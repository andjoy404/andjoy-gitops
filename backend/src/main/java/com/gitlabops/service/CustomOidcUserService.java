package com.gitlabops.service;

import com.gitlabops.model.dto.AppUserDTO;
import com.gitlabops.model.dto.GlobalConfigDTO;
import com.gitlabops.repository.AppUserRepository;
import com.gitlabops.repository.EnvironmentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.OidcUserInfo;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class CustomOidcUserService implements OAuth2UserService<OidcUserRequest, OidcUser> {

    private static final Logger log = LoggerFactory.getLogger(CustomOidcUserService.class);
    private static final String ROLE_ADMIN = "ROLE_ADMIN";
    private static final String ROLE_VIEWER = "ROLE_VIEWER";

    private final AppUserRepository userRepository;
    private final EnvironmentRepository environmentRepository;
    private DefaultOAuth2UserService delegate;

    @Autowired
    public CustomOidcUserService(AppUserRepository userRepository,
                                  EnvironmentRepository environmentRepository) {
        this(userRepository, environmentRepository, new DefaultOAuth2UserService());
    }

    /** Visible for testing — permits injection of a mock OAuth2UserService. */
    CustomOidcUserService(AppUserRepository userRepository,
                          EnvironmentRepository environmentRepository,
                          DefaultOAuth2UserService delegate) {
        this.userRepository = userRepository;
        this.environmentRepository = environmentRepository;
        this.delegate = delegate;
    }

    @Override
    public OidcUser loadUser(OidcUserRequest userRequest) throws OAuth2AuthenticationException {
        OAuth2User oauth2User = delegate.loadUser(userRequest);

        String issuerUri = userRequest.getClientRegistration().getProviderDetails()
            .getIssuerUri();
        log.info("OIDC login from issuer: {}", issuerUri);

        // Load SSO config from DB to determine group claim mapping
        GlobalConfigDTO globalConfig = environmentRepository.getGlobalConfig()
            .orElseGet(() -> {
                GlobalConfigDTO def = new GlobalConfigDTO();
                def.setOidcAdminGroupClaim("groups");
                def.setOidcAdminGroupValue("admin");
                return def;
            });

        String groupClaimName = globalConfig.getOidcAdminGroupClaim() != null
            ? globalConfig.getOidcAdminGroupClaim() : "groups";
        String adminGroupValue = globalConfig.getOidcAdminGroupValue() != null
            ? globalConfig.getOidcAdminGroupValue() : "admin";

        Map<String, Object> attributes = oauth2User.getAttributes();
        String sub = getStringAttribute(attributes, "sub");
        String email = getStringAttribute(attributes, "email");
        String preferredUsername = getStringAttribute(attributes, "preferred_username");
        String name = getStringAttribute(attributes, "name");

        if (email == null || email.trim().isEmpty()) {
            String upn = getStringAttribute(attributes, "upn");
            if (upn != null && upn.contains("@")) {
                email = upn.trim();
            } else if (preferredUsername != null && preferredUsername.contains("@")) {
                email = preferredUsername.trim();
            }
        }

        if (sub == null && email == null) {
            throw new OAuth2AuthenticationException("OIDC response missing both 'sub' and 'email'");
        }

        // Upsert local user from OIDC identity
        AppUserDTO appUser = findByProviderOrUpsert(sub, email, preferredUsername, name, attributes);
        String username = appUser.username != null ? appUser.username : email;

        // Determine role based on OIDC group claim or existing local database role
        List<String> groupClaimValues = extractGroupClaimValues(attributes, groupClaimName);
        boolean isOidcAdmin = groupClaimValues.contains(adminGroupValue);
        boolean isLocalAdmin = "admin".equals(appUser.role);
        boolean isAdmin = isOidcAdmin || isLocalAdmin;
        String dbRole = isAdmin ? "admin" : "editor";

        // Update local user role if needed
        if (!dbRole.equals(appUser.role)) {
            userRepository.update(appUser.id, appUser.username, appUser.displayName,
                appUser.email, dbRole, appUser.enabled != null && appUser.enabled);
            appUser.role = dbRole;
        }

        // Build authorities list from determined role
        List<GrantedAuthority> authorities = new ArrayList<>();
        authorities.add(new SimpleGrantedAuthority(isAdmin ? ROLE_ADMIN : ROLE_VIEWER));
        authorities.addAll(oauth2User.getAuthorities());

        OidcUserInfo userInfo = new OidcUserInfo(attributes);

        String tokenValue = userRequest.getIdToken().getTokenValue();
        OidcIdToken idToken = new OidcIdToken(tokenValue,
            java.time.Instant.now().minusSeconds(60),
            java.time.Instant.now().plusSeconds(300),
            attributes);

        return new DefaultOidcUser(authorities, idToken, userInfo);
    }

    private String getStringAttribute(Map<String, Object> attributes, String key) {
        Object val = attributes.get(key);
        return val != null ? val.toString() : null;
    }

    private String resolveDisplayName(Map<String, Object> attributes, String name,
                                       String preferredUsername, String email) {
        if (name != null && !name.trim().isEmpty()) {
            return name.trim();
        }
        String givenName = getStringAttribute(attributes, "given_name");
        String familyName = getStringAttribute(attributes, "family_name");
        if (givenName != null || familyName != null) {
            String full = ((givenName != null ? givenName : "") + " " + (familyName != null ? familyName : "")).trim();
            if (!full.isEmpty()) {
                return full;
            }
        }
        if (preferredUsername != null && !preferredUsername.trim().isEmpty() && !preferredUsername.contains("@")) {
            return preferredUsername.trim();
        }
        if (email != null && !email.trim().isEmpty()) {
            int atIndex = email.indexOf('@');
            return atIndex > 0 ? email.substring(0, atIndex) : email;
        }
        return "User";
    }

    private String resolveUsername(String email, String preferredUsername, String sub) {
        if (email != null && !email.trim().isEmpty()) {
            return email.trim().toLowerCase();
        }
        if (preferredUsername != null && !preferredUsername.trim().isEmpty()) {
            return preferredUsername.trim().toLowerCase();
        }
        return sub != null ? "user_" + sub.substring(0, Math.min(sub.length(), 8)) : "user";
    }

    private AppUserDTO findByProviderOrUpsert(String sub, String email,
                                              String preferredUsername, String name,
                                              Map<String, Object> attributes) {
        String displayName = resolveDisplayName(attributes, name, preferredUsername, email);
        String targetUsername = resolveUsername(email, preferredUsername, sub);

        // 1. Lookup by provider_user_id (sub)
        if (sub != null) {
            AppUserDTO existing = userRepository.findByProviderUserId(sub);
            if (existing != null) {
                boolean updated = false;
                String currentUsername = existing.username;
                String currentDisplayName = existing.displayName;

                // Fix username if it had the old oidc_ prefix
                if (currentUsername != null && currentUsername.startsWith("oidc_") && targetUsername != null) {
                    AppUserDTO collision = userRepository.findByUsername(targetUsername);
                    if (collision == null || collision.id.equals(existing.id)) {
                        currentUsername = targetUsername;
                        updated = true;
                    }
                }

                // Fix displayName if it was previously email or oidc_ prefix
                if (displayName != null && !displayName.isEmpty() &&
                    (currentDisplayName == null || currentDisplayName.isEmpty() ||
                     currentDisplayName.equals(existing.email) || currentDisplayName.startsWith("oidc_"))) {
                    currentDisplayName = displayName;
                    updated = true;
                }

                if (updated) {
                    userRepository.update(existing.id, currentUsername, currentDisplayName,
                        existing.email, existing.role, existing.enabled != null && existing.enabled);
                    existing.username = currentUsername;
                    existing.displayName = currentDisplayName;
                }
                return existing;
            }
        }

        // 2. Lookup by email, link sub if local user has no provider
        if (email != null) {
            AppUserDTO byEmail = userRepository.findByEmail(email);
            if (byEmail != null) {
                if (byEmail.providerUserId == null) {
                    userRepository.updateProviderUserId(byEmail.id, sub);
                    byEmail.providerUserId = sub;
                }
                if (displayName != null && !displayName.isEmpty() &&
                    (byEmail.displayName == null || byEmail.displayName.isEmpty() ||
                     byEmail.displayName.equals(byEmail.email) || byEmail.displayName.startsWith("oidc_"))) {
                    userRepository.update(byEmail.id, byEmail.username, displayName,
                        byEmail.email, byEmail.role, byEmail.enabled != null && byEmail.enabled);
                    byEmail.displayName = displayName;
                }
                return byEmail;
            }
        }

        // 3. Create new OIDC user
        String finalDisplayName = displayName;
        String baseUsername = targetUsername;
        String username = baseUsername;
        int counter = 1;
        while (userRepository.findByUsername(username) != null && counter < 100) {
            username = baseUsername + "_" + counter;
            counter++;
        }

        String finalUsername = username;
        AppUserDTO created = new AppUserDTO();
        created.id = userRepository.createOidcUser(finalUsername, finalDisplayName,
            email, sub, "editor");

        try {
            created = userRepository.findById(created.id);
        } catch (Exception e) {
            created.setUsername(finalUsername);
            created.setDisplayName(finalDisplayName);
            created.setRole("editor");
        }

        return created;
    }

    private List<String> extractGroupClaimValues(Map<String, Object> attributes, String claimName) {
        List<String> values = new ArrayList<>();
        Object claim = attributes.get(claimName);

        if (claim == null) {
            return values;
        }

        if (claim instanceof List<?> list) {
            for (Object item : list) {
                if (item != null) {
                    values.add(item.toString());
                }
            }
        } else if (claim instanceof Object[] array) {
            for (Object item : array) {
                if (item != null) {
                    values.add(item.toString());
                }
            }
        } else {
            values.add(claim.toString());
        }

        return values;
    }
}
