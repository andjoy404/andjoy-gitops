package com.gitlabops;

import com.gitlabops.model.dto.GlobalConfigDTO;
import com.gitlabops.model.dto.GlobalConfigRequest;
import com.gitlabops.repository.EnvironmentRepository;
import com.gitlabops.service.EncryptionService;
import com.gitlabops.service.GroupService;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.jooq.DSLContext;
import org.jooq.SQLDialect;
import org.jooq.impl.DSL;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Optional;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class GlobalConfigContractTest {

    private static final org.springframework.core.env.Environment testEnv = new StandardEnvironment() {{
        getPropertySources().addFirst(new MapPropertySource("test", Map.of(
            "security.encryption-key", "0000000000000000000000000000000000000000000000000000000000000000"
        )));
    }};

    private static HikariDataSource testDataSource;
    private static DSLContext testDsl;

    @AfterAll
    static void cleanup() {
        if (testDataSource != null && !testDataSource.isClosed()) {
            testDataSource.close();
        }
    }

    private static DataSource getTestDataSource() throws Exception {
        if (testDataSource == null) {
            testDataSource = new HikariDataSource();
            testDataSource.setJdbcUrl("jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1");
            testDataSource.setDriverClassName("org.h2.Driver");
            testDataSource.setUsername("sa");
            testDataSource.setPassword("");

            try (Connection conn = testDataSource.getConnection();
                 Statement stmt = conn.createStatement()) {
                stmt.execute("CREATE TABLE IF NOT EXISTS app_global_settings ("
                    + "singleton BOOLEAN, company_name VARCHAR, company_logo VARCHAR, "
                    + "updated_at TIMESTAMP, pipeline_view VARCHAR, sso_enabled BOOLEAN, "
                    + "local_login_enabled BOOLEAN, oidc_issuer_uri VARCHAR, oidc_client_id VARCHAR, "
                    + "oidc_client_secret VARCHAR, oidc_admin_group_claim VARCHAR, oidc_admin_group_value VARCHAR)");
                stmt.execute("INSERT INTO app_global_settings(singleton, company_name, company_logo, pipeline_view) VALUES(TRUE, 'Default', '', 'latest')");
            }
        }
        return testDataSource;
    }

    private static DSLContext getTestDsl() throws Exception {
        if (testDsl == null) {
            testDsl = DSL.using(getTestDataSource(), SQLDialect.H2);
        }
        return testDsl;
    }

    @Test
    void globalConfigGetReturnsDTOWithDefaults() throws Exception {
        EnvironmentRepository repo = new EnvironmentRepository(getTestDsl(), getTestDataSource()) {
            @Override
            public Optional<GlobalConfigDTO> getGlobalConfig() {
                return Optional.empty();
            }
        };
        EncryptionService encryptionService = new EncryptionService(testEnv);
        var sessionStore = new com.gitlabops.service.SessionStore();
        var envService = new com.gitlabops.service.EnvironmentService(repo, encryptionService, sessionStore);
        var controller = new com.gitlabops.controller.EnvironmentController(
            envService, emptyGroupService()
        );

        var response = controller.getGlobalConfig();
        
        assertEquals(200, response.getStatusCodeValue());
        assertNotNull(response.getBody());
        assertEquals("latest", response.getBody().getPipelineView());
        assertEquals("", response.getBody().getCompanyName());
        assertEquals("", response.getBody().getCompanyLogo());
    }

    @Test
    void globalConfigGetReturnsStoredValues() throws Exception {
        // Modify test DB to return values
        try (var conn = getTestDataSource().getConnection();
             var stmt = conn.createStatement()) {
            stmt.execute("UPDATE app_global_settings SET company_name='Acme Corp', company_logo='https://acme.com/logo.png', pipeline_view='all'");
        }

        EnvironmentRepository repo = new EnvironmentRepository(getTestDsl(), getTestDataSource()) {
            @Override
            public Optional<GlobalConfigDTO> getGlobalConfig() {
                return super.getGlobalConfig();
            }
        };
        EncryptionService encryptionService = new EncryptionService(testEnv);
        var sessionStore = new com.gitlabops.service.SessionStore();
        var envService = new com.gitlabops.service.EnvironmentService(repo, encryptionService, sessionStore);
        var controller = new com.gitlabops.controller.EnvironmentController(
            envService, emptyGroupService()
        );

        var response = controller.getGlobalConfig();
        
        assertEquals(200, response.getStatusCodeValue());
        assertEquals("Acme Corp", response.getBody().getCompanyName());
        assertEquals("https://acme.com/logo.png", response.getBody().getCompanyLogo());
        assertEquals("all", response.getBody().getPipelineView());
    }

    @Test
    void globalConfigRequestValidatesCompanyRequired() {
        var request = new GlobalConfigRequest();
        request.setCompanyName("");
        request.setCompanyLogo("https://example.com/logo.png");
        request.setPipelineView("latest");

        var errors = new org.springframework.validation.BeanPropertyBindingResult(request, "request");
        var validator = new org.springframework.validation.beanvalidation.LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        validator.validate(request, errors);

        assertTrue(errors.hasFieldErrors("companyName"));
    }

    @Test
    void globalConfigRequestValidatesPipelineView() {
        var request = new GlobalConfigRequest();
        request.setCompanyName("Test Corp");
        request.setCompanyLogo("");
        request.setPipelineView("invalid_view");

        var errors = new org.springframework.validation.BeanPropertyBindingResult(request, "request");
        var validator = new org.springframework.validation.beanvalidation.LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        validator.validate(request, errors);

        assertTrue(errors.hasFieldErrors("pipelineView"));
    }

    @Test
    void globalConfigRequestAcceptsValidValues() {
        var request = new GlobalConfigRequest();
        request.setCompanyName("Test Corp");
        request.setCompanyLogo("https://example.com/logo.png");
        request.setPipelineView("latest");

        var errors = new org.springframework.validation.BeanPropertyBindingResult(request, "request");
        var validator = new org.springframework.validation.beanvalidation.LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        validator.validate(request, errors);

        assertFalse(errors.hasErrors());
    }

    @Test
    void globalConfigDTOUsesSnakeCasePropertyNames() {
        GlobalConfigDTO dto = new GlobalConfigDTO("My Company", "https://example.com/logo.png", "latest");
        
        try {
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            String serialized = mapper.writeValueAsString(dto);
            
            assertTrue(serialized.contains("company_name"), "Should use snake_case: company_name");
            assertTrue(serialized.contains("company_logo"), "Should use snake_case: company_logo");
            assertTrue(serialized.contains("pipeline_view"), "Should use snake_case: pipeline_view");
        } catch (Exception e) {
            fail("GlobalConfigDTO serialization failed: " + e.getMessage());
        }
    }

    @Test
    void globalConfigDTOIncludesSsoFields() {
        GlobalConfigDTO dto = new GlobalConfigDTO();
        dto.setCompanyName("Test");
        dto.setCompanyLogo("");
        dto.setPipelineView("latest");
        dto.setSsoEnabled(true);
        dto.setLocalLoginEnabled(false);
        dto.setOidcIssuerUri("https://example.com");
        dto.setOidcClientId("my-client");
        dto.setOidcAdminGroupClaim("groups");
        dto.setOidcAdminGroupValue("sso-admins");

        try {
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            mapper.enable(com.fasterxml.jackson.databind.SerializationFeature.INDENT_OUTPUT);
            String serialized = mapper.writeValueAsString(dto);
            
            assertTrue(serialized.contains("sso_enabled"), "Should include sso_enabled");
            assertTrue(serialized.contains("local_login_enabled"), "Should include local_login_enabled");
            assertTrue(serialized.contains("oidc_issuer_uri"), "Should include oidc_issuer_uri");
            assertTrue(serialized.contains("oidc_client_id"), "Should include oidc_client_id");
            assertTrue(serialized.contains("oidc_admin_group_claim"), "Should include oidc_admin_group_claim");
            assertTrue(serialized.contains("oidc_admin_group_value"), "Should include oidc_admin_group_value");
            // oidc_client_secret is not set, so it should be null and included in non-configured ObjectMapper
            // (Spring's non_null exclusion is separate from default ObjectMapper behavior)
        } catch (Exception e) {
            fail("GlobalConfigDTO SSO serialization failed: " + e.getMessage());
        }
    }

    private GroupService emptyGroupService() {
        return new GroupService(null) {
            @Override
            public java.util.List<com.gitlabops.model.dto.GroupDTO> getAllGroups() {
                return java.util.List.of();
            }
        };
    }
}
