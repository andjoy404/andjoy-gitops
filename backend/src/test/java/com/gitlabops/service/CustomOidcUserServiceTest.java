package com.gitlabops.service;

import com.gitlabops.model.dto.AppUserDTO;
import com.gitlabops.model.dto.GlobalConfigDTO;
import com.gitlabops.repository.AppUserRepository;
import com.gitlabops.repository.EnvironmentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import static org.mockito.ArgumentMatchers.anyLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CustomOidcUserServiceTest {

    private AppUserRepository userRepository;
    private EnvironmentRepository environmentRepository;
    private CustomOidcUserService service;
    private DefaultOAuth2UserService mockDelegate;
    private OidcUserRequest userRequest;
    private ClientRegistration.ProviderDetails mockProviderDetails;
    private ClientRegistration mockClientRegistration;

    @BeforeEach
    void setUp() {
        userRepository = mock(AppUserRepository.class);
        environmentRepository = mock(EnvironmentRepository.class);
        mockDelegate = mock(DefaultOAuth2UserService.class);
        service = new CustomOidcUserService(userRepository, environmentRepository, mockDelegate);

        // Common mocks for userRequest
        mockProviderDetails = mock(ClientRegistration.ProviderDetails.class);
        when(mockProviderDetails.getIssuerUri()).thenReturn("https://idp.example.com");
        mockClientRegistration = mock(ClientRegistration.class);
        when(mockClientRegistration.getProviderDetails()).thenReturn(mockProviderDetails);

        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("sub", "oidc_test_sub");
        claims.put("email", "test@example.com");
        OidcIdToken idToken = new OidcIdToken("token_value",
                Instant.now().minusSeconds(60), Instant.now().plusSeconds(300), claims);

        userRequest = mock(OidcUserRequest.class);
        when(userRequest.getIdToken()).thenReturn(idToken);
        when(userRequest.getClientRegistration()).thenReturn(mockClientRegistration);

        // Default: delegate returns a user with base claims
        when(mockDelegate.loadUser(any(OidcUserRequest.class))).thenReturn(
                new DefaultOidcUser(new ArrayList<>(), idToken));
    }

    // ===================================================================
    // OIDC Admin Group Claim Mapping Tests
    // ===================================================================

    @Test
    void loadUser_adminGroupAssigned_roleAdmin() throws Exception {
        GlobalConfigDTO config = new GlobalConfigDTO();
        config.setOidcAdminGroupClaim("groups");
        config.setOidcAdminGroupValue("admin");
        when(environmentRepository.getGlobalConfig()).thenReturn(Optional.of(config));

        when(userRepository.findByProviderUserId("oidc_sub_123")).thenReturn(null);
        when(userRepository.findByEmail("user@example.com")).thenReturn(null);
        when(userRepository.createOidcUser(anyString(), anyString(), eq("user@example.com"),
                eq("oidc_sub_123"), eq("admin"))).thenReturn(1L);
        AppUserDTO createdUser = new AppUserDTO();
        createdUser.id = 1L;
        createdUser.username = "user@example.com";
        createdUser.displayName = "User";
        createdUser.email = "user@example.com";
        createdUser.role = "editor";
        createdUser.enabled = true;
        when(userRepository.findById(anyLong())).thenReturn(createdUser);

        Map<String, Object> claims = Map.of(
                "sub", "oidc_sub_123",
                "email", "user@example.com",
                "groups", List.of("users", "admin", "developers"));
        OidcIdToken idToken = new OidcIdToken("token",
                Instant.now().minusSeconds(60), Instant.now().plusSeconds(300), claims);
        when(userRequest.getIdToken()).thenReturn(idToken);
        when(mockDelegate.loadUser(any(OidcUserRequest.class))).thenReturn(
                new DefaultOidcUser(new ArrayList<>(), idToken));

        OidcUser user = service.loadUser(userRequest);

        assertTrue(user.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority())),
                "User with admin group claim should have ROLE_ADMIN");
    }

    @Test
    void loadUser_nonAdminGroupAssigned_roleViewer() throws Exception {
        GlobalConfigDTO config = new GlobalConfigDTO();
        config.setOidcAdminGroupClaim("groups");
        config.setOidcAdminGroupValue("admin");
        when(environmentRepository.getGlobalConfig()).thenReturn(Optional.of(config));

        when(userRepository.findByProviderUserId("oidc_sub_456")).thenReturn(null);
        when(userRepository.findByEmail("viewer@example.com")).thenReturn(null);
        when(userRepository.createOidcUser(anyString(), anyString(), eq("viewer@example.com"),
                eq("oidc_sub_456"), eq("editor"))).thenReturn(2L);
        AppUserDTO u2 = new AppUserDTO();
        u2.id = 2L; u2.username = "viewer@example.com"; u2.displayName = "User";
        u2.email = "viewer@example.com"; u2.role = "editor"; u2.enabled = true;
        when(userRepository.findById(anyLong())).thenReturn(u2);

        Map<String, Object> claims = Map.of(
                "sub", "oidc_sub_456",
                "email", "viewer@example.com",
                "groups", List.of("users", "developers"));
        OidcIdToken idToken = new OidcIdToken("token",
                Instant.now().minusSeconds(60), Instant.now().plusSeconds(300), claims);
        when(userRequest.getIdToken()).thenReturn(idToken);
        when(mockDelegate.loadUser(any(OidcUserRequest.class))).thenReturn(
                new DefaultOidcUser(new ArrayList<>(), idToken));

        OidcUser user = service.loadUser(userRequest);

        assertFalse(user.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority())),
                "User without admin group should NOT have ROLE_ADMIN");
        assertTrue(user.getAuthorities().stream().anyMatch(a -> "ROLE_VIEWER".equals(a.getAuthority())),
                "User without admin group should have ROLE_VIEWER");
    }

    @Test
    void loadUser_missingGroupClaim_defaultsToViewer() throws Exception {
        GlobalConfigDTO config = new GlobalConfigDTO();
        config.setOidcAdminGroupClaim("groups");
        config.setOidcAdminGroupValue("admin");
        when(environmentRepository.getGlobalConfig()).thenReturn(Optional.of(config));

        when(userRepository.findByProviderUserId("oidc_sub_789")).thenReturn(null);
        when(userRepository.findByEmail("novice@example.com")).thenReturn(null);
        when(userRepository.createOidcUser(anyString(), anyString(), eq("novice@example.com"),
                eq("oidc_sub_789"), eq("editor"))).thenReturn(3L);
        AppUserDTO u3 = new AppUserDTO();
        u3.id = 3L; u3.username = "novice@example.com"; u3.displayName = "User";
        u3.email = "novice@example.com"; u3.role = "editor"; u3.enabled = true;
        when(userRepository.findById(anyLong())).thenReturn(u3);

        Map<String, Object> claims = Map.of("sub", "oidc_sub_789", "email", "novice@example.com");
        OidcIdToken idToken = new OidcIdToken("token",
                Instant.now().minusSeconds(60), Instant.now().plusSeconds(300), claims);
        when(userRequest.getIdToken()).thenReturn(idToken);
        when(mockDelegate.loadUser(any(OidcUserRequest.class))).thenReturn(
                new DefaultOidcUser(new ArrayList<>(), idToken));

        assertDoesNotThrow(() -> service.loadUser(userRequest),
                "Missing group claim should not throw");

        OidcUser user = service.loadUser(userRequest);
        assertTrue(user.getAuthorities().stream().anyMatch(a -> "ROLE_VIEWER".equals(a.getAuthority())),
                "User with missing group claim should default to ROLE_VIEWER");
    }

    @Test
    void loadUser_missingConfig_defaultsToAdminValues() throws Exception {
        when(environmentRepository.getGlobalConfig()).thenReturn(Optional.empty());

        when(userRepository.findByProviderUserId("oidc_sub_000")).thenReturn(null);
        when(userRepository.findByEmail("nobody@example.com")).thenReturn(null);
        when(userRepository.createOidcUser(anyString(), anyString(), eq("nobody@example.com"),
                eq("oidc_sub_000"), eq("editor"))).thenReturn(4L);
        AppUserDTO u4 = new AppUserDTO();
        u4.id = 4L; u4.username = "nobody@example.com"; u4.displayName = "User";
        u4.email = "nobody@example.com"; u4.role = "editor"; u4.enabled = true;
        when(userRepository.findById(anyLong())).thenReturn(u4);

        Map<String, Object> claims = Map.of(
                "sub", "oidc_sub_000",
                "email", "nobody@example.com",
                "groups", List.of("admin"));
        OidcIdToken idToken = new OidcIdToken("token",
                Instant.now().minusSeconds(60), Instant.now().plusSeconds(300), claims);
        when(userRequest.getIdToken()).thenReturn(idToken);
        when(mockDelegate.loadUser(any(OidcUserRequest.class))).thenReturn(
                new DefaultOidcUser(new ArrayList<>(), idToken));

        assertDoesNotThrow(() -> service.loadUser(userRequest));
    }

    @Test
    void loadUser_nonListGroupClaim_parsesCorrectly() throws Exception {
        GlobalConfigDTO config = new GlobalConfigDTO();
        config.setOidcAdminGroupClaim("custom_role");
        config.setOidcAdminGroupValue("superadmin");
        when(environmentRepository.getGlobalConfig()).thenReturn(Optional.of(config));

        when(userRepository.findByProviderUserId("oidc_sub_111")).thenReturn(null);
        when(userRepository.findByEmail("roleuser@example.com")).thenReturn(null);
        when(userRepository.createOidcUser(anyString(), anyString(), eq("roleuser@example.com"),
                eq("oidc_sub_111"), eq("admin"))).thenReturn(5L);
        AppUserDTO u5 = new AppUserDTO();
        u5.id = 5L; u5.username = "roleuser@example.com"; u5.displayName = "User";
        u5.email = "roleuser@example.com"; u5.role = "editor"; u5.enabled = true;
        when(userRepository.findById(anyLong())).thenReturn(u5);

        Map<String, Object> claims = Map.of(
                "sub", "oidc_sub_111",
                "email", "roleuser@example.com",
                "custom_role", "superadmin");
        OidcIdToken idToken = new OidcIdToken("token",
                Instant.now().minusSeconds(60), Instant.now().plusSeconds(300), claims);
        when(userRequest.getIdToken()).thenReturn(idToken);
        when(mockDelegate.loadUser(any(OidcUserRequest.class))).thenReturn(
                new DefaultOidcUser(new ArrayList<>(), idToken));

        assertDoesNotThrow(() -> service.loadUser(userRequest));
    }

    @Test
    void loadUser_providerUserIdLookup_skipsEmailAndCreate() throws Exception {
        AppUserDTO existingUser = new AppUserDTO();
        existingUser.id = 10L;
        existingUser.username = "existing_user";
        existingUser.displayName = "Existing User";
        existingUser.email = "ex@example.com";
        existingUser.role = "admin";
        existingUser.enabled = true;

        when(environmentRepository.getGlobalConfig()).thenReturn(Optional.empty());
        when(userRepository.findByProviderUserId("linked_sub")).thenReturn(existingUser);

        Map<String, Object> claims = Map.of("sub", "linked_sub", "email", "ex@example.com");
        OidcIdToken idToken = new OidcIdToken("token",
                Instant.now().minusSeconds(60), Instant.now().plusSeconds(300), claims);
        when(userRequest.getIdToken()).thenReturn(idToken);
        when(mockDelegate.loadUser(any(OidcUserRequest.class))).thenReturn(
                new DefaultOidcUser(new ArrayList<>(), idToken));

        service.loadUser(userRequest);

        verify(userRepository, never()).createOidcUser(anyString(), anyString(), anyString(), anyString(), anyString());
        verify(userRepository, never()).findByEmail(anyString());
    }

    @Test
    void loadUser_newOidcUser_usesEmailAsUsernameAndNameAsDisplayName() throws Exception {
        when(environmentRepository.getGlobalConfig()).thenReturn(Optional.empty());
        when(userRepository.findByProviderUserId("sub_abc")).thenReturn(null);
        when(userRepository.findByEmail("alice@example.com")).thenReturn(null);
        when(userRepository.createOidcUser(eq("alice@example.com"), eq("Alice Wonderland"),
                eq("alice@example.com"), eq("sub_abc"), eq("editor"))).thenReturn(20L);

        AppUserDTO created = new AppUserDTO();
        created.id = 20L;
        created.username = "alice@example.com";
        created.displayName = "Alice Wonderland";
        created.email = "alice@example.com";
        created.role = "editor";
        created.enabled = true;
        when(userRepository.findById(20L)).thenReturn(created);

        Map<String, Object> claims = Map.of(
                "sub", "sub_abc",
                "email", "alice@example.com",
                "name", "Alice Wonderland",
                "preferred_username", "alice@example.com");
        OidcIdToken idToken = new OidcIdToken("token",
                Instant.now().minusSeconds(60), Instant.now().plusSeconds(300), claims);
        when(userRequest.getIdToken()).thenReturn(idToken);
        when(mockDelegate.loadUser(any(OidcUserRequest.class))).thenReturn(
                new DefaultOidcUser(new ArrayList<>(), idToken));

        service.loadUser(userRequest);

        verify(userRepository).createOidcUser("alice@example.com", "Alice Wonderland",
                "alice@example.com", "sub_abc", "editor");
    }

    @Test
    void loadUser_existingOidcUserWithPrefix_migratesUsernameAndDisplayName() throws Exception {
        AppUserDTO existingUser = new AppUserDTO();
        existingUser.id = 30L;
        existingUser.username = "oidc_bob@example.com";
        existingUser.displayName = "bob@example.com";
        existingUser.email = "bob@example.com";
        existingUser.role = "editor";
        existingUser.enabled = true;

        when(environmentRepository.getGlobalConfig()).thenReturn(Optional.empty());
        when(userRepository.findByProviderUserId("sub_bob")).thenReturn(existingUser);
        when(userRepository.findByUsername("bob@example.com")).thenReturn(null);

        Map<String, Object> claims = Map.of(
                "sub", "sub_bob",
                "email", "bob@example.com",
                "name", "Bob Builder");
        OidcIdToken idToken = new OidcIdToken("token",
                Instant.now().minusSeconds(60), Instant.now().plusSeconds(300), claims);
        when(userRequest.getIdToken()).thenReturn(idToken);
        when(mockDelegate.loadUser(any(OidcUserRequest.class))).thenReturn(
                new DefaultOidcUser(new ArrayList<>(), idToken));

        service.loadUser(userRequest);

        verify(userRepository).update(30L, "bob@example.com", "Bob Builder",
                "bob@example.com", "editor", true);
    }
}
