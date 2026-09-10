package com.gitlabops.config;

import com.gitlabops.model.dto.GlobalConfigDTO;
import com.gitlabops.repository.EnvironmentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.security.oauth2.client.OAuth2ClientProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.ClientRegistrations;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Dynamically loads OIDC client registration from the app_global_settings table
 * (and falls back to environment properties).
 *
 * Implements ClientRegistrationRepository so Spring Security always has a repository,
 * even during early startup before the DB is reached.
 */
@Component
@EnableConfigurationProperties(OAuth2ClientProperties.class)
public class DynamicClientRegistrationRepository implements ClientRegistrationRepository, Iterable<ClientRegistration> {

    private static final Logger log = LoggerFactory.getLogger(DynamicClientRegistrationRepository.class);
    private static final String REGISTRATION_ID = "oidc";

    private final EnvironmentRepository environmentRepository;
    private final OAuth2ClientProperties clientProperties;

    @Value("${sso.oidc-issuer-uri:}")
    private String envIssuerUri;

    @Value("${sso.oidc-client-id:}")
    private String envClientId;

    @Value("${sso.oidc-client-secret:}")
    private String envClientSecret;

    /** Cached ClientRegistration keyed by registration id; null means not yet resolved. */
    private volatile Map<String, ClientRegistration> cache = new HashMap<>();

    /** Monotonically increasing counter to bust the cache when config changes. */
    private volatile long cacheVersion = 0;

    public DynamicClientRegistrationRepository(
            EnvironmentRepository environmentRepository,
            OAuth2ClientProperties clientProperties) {
        this.environmentRepository = environmentRepository;
        this.clientProperties = clientProperties;
    }

    @Override
    public ClientRegistration findByRegistrationId(String registrationId) {
        if (registrationId == null) {
            return null;
        }
        if (!REGISTRATION_ID.equalsIgnoreCase(registrationId.trim())) {
            return null;
        }

        // Lazy-initialise cache on first call
        if (cache.get(REGISTRATION_ID) == null) {
            try {
                cache = resolveAll();
            } catch (Exception e) {
                log.warn("Failed to resolve dynamic OIDC client registration: {}; returning empty registration", e.getMessage());
                cache = buildDummyMap();
            }
        }

        return cache.get(REGISTRATION_ID);
    }

    @Override
    public Iterator<ClientRegistration> iterator() {
        ClientRegistration registration = findByRegistrationId(REGISTRATION_ID);
        if (registration == null) {
            return Collections.emptyIterator();
        }
        return Collections.singletonList(registration).iterator();
    }

    /**
     * Resolve a live set of ClientRegistrations by reading from DB and/or env properties.
     */
    private Map<String, ClientRegistration> resolveAll() {
        Map<String, ClientRegistration> result = new HashMap<>();

        String issuerUri = null;
        String clientId = null;
        String clientSecret = null;

        // 1. Try DB first
        try {
            Optional<GlobalConfigDTO> maybeConfig = environmentRepository.getGlobalConfig();
            if (maybeConfig.isPresent()) {
                GlobalConfigDTO cfg = maybeConfig.get();
                issuerUri = cfg.getOidcIssuerUri();
                clientId = cfg.getOidcClientId();
                clientSecret = cfg.getOidcClientSecret();
            }
        } catch (Exception e) {
            log.debug("DB not yet available for OIDC config lookup: {}", e.getMessage());
        }

        // 2. Fallback to env properties if still empty
        if ((issuerUri == null || issuerUri.isEmpty()) && !envIssuerUri.isEmpty()) {
            issuerUri = envIssuerUri;
        }
        if ((clientId == null || clientId.isEmpty()) && !envClientId.isEmpty()) {
            clientId = envClientId;
        }
        if ((clientSecret == null || clientSecret.isEmpty()) && !envClientSecret.isEmpty()) {
            clientSecret = envClientSecret;
        }

        // 3. If both DB and env are empty → return dummy map so Spring boots cleanly
        if ((issuerUri == null || issuerUri.isEmpty()) || (clientId == null || clientId.isEmpty())) {
            log.info("OIDC credentials not available (issuer/blank issuer={}, clientId/blank clientId={}); using placeholder registration",
                    issuerUri != null ? issuerUri : "(empty)",
                    clientId != null ? clientId : "(empty)");
            return buildDummyMap();
        }

        String redirectUri = "{baseUrl}/login/oauth2/code/{registrationId}";

        // Try building via issuer discovery first
        ClientRegistration clientRegistration;
        try {
            if (log.isDebugEnabled()) {
                log.debug("Building ClientRegistration via issuer discovery at: {}", issuerUri);
            }
            clientRegistration = ClientRegistrations
                    .fromIssuerLocation(issuerUri)
                    .registrationId(REGISTRATION_ID)
                    .clientId(clientId)
                    .clientSecret(clientSecret)
                    .redirectUri(redirectUri)
                    .scope("openid", "profile", "email")
                    .clientName("Corporate SSO")
                    .build();
        } catch (Exception discoveryEx) {
            log.warn("Issuer discovery failed at {}; falling back to manual OpenID Connect endpoints: {}",
                    issuerUri, discoveryEx.getMessage());

            // Remove trailing slash for path construction
            String base = issuerUri;
            if (base.endsWith("/")) {
                base = base.substring(0, base.length() - 1);
            }

            clientRegistration = ClientRegistration.withRegistrationId(REGISTRATION_ID)
                    .issuerUri(issuerUri)
                    .clientId(clientId)
                    .clientSecret(clientSecret)
                    .redirectUri(redirectUri)
                    .scope("openid", "profile", "email")
                    .clientName("Corporate SSO")
                    .authorizationUri(base + "/protocol/openid-connect/auth")
                    .tokenUri(base + "/protocol/openid-connect/token")
                    .userInfoUri(base + "/protocol/openid-connect/userinfo")
                    .jwkSetUri(base + "/protocol/openid-connect/certs")
                    .build();
        }

        result.put(REGISTRATION_ID, clientRegistration);
        return result;
    }

    private Map<String, ClientRegistration> buildDummyMap() {
        Map<String, ClientRegistration> map = new HashMap<>();
        map.put(REGISTRATION_ID, ClientRegistration.withRegistrationId(REGISTRATION_ID)
                .issuerUri("")
                .clientId("placeholder")
                .clientSecret("placeholder")
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .scope("openid")
                .clientName("Corporate SSO")
                .build());
        return map;
    }

    /**
     * Publicly accessible bustCache() so callers can invalidate the cached
     * ClientRegistration when DB configuration changes.
     */
    public void bustCache() {
        cacheVersion++;
        cache = new HashMap<>();
        log.info("OIDC client registration cache busted (version {})", cacheVersion);
    }

    /** Expose current cache so callers can verify. */
    public Map<String, ClientRegistration> getCurrentCache() {
        return new HashMap<>(cache);
    }
}
