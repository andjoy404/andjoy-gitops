package com.gitlabops;

import com.gitlabops.model.dto.GlobalConfigDTO;
import com.gitlabops.model.dto.GlobalConfigRequest;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GlobalConfigContractTest {

    @Test
    void globalConfigGetReturnsDTOWithDefaults() {
        var repo = mock(com.gitlabops.repository.EnvironmentRepository.class);
        when(repo.getGlobalConfig()).thenReturn(Optional.empty());

        var encryptionService = mock(com.gitlabops.service.EncryptionService.class);
        var sessionStore = new com.gitlabops.service.SessionStore();
        var envService = new com.gitlabops.service.EnvironmentService(
            repo, encryptionService, sessionStore
        );
        var controller = new com.gitlabops.controller.EnvironmentController(
            envService, mock(com.gitlabops.service.GroupService.class)
        );

        var response = controller.getGlobalConfig();
        
        assertEquals(200, response.getStatusCodeValue());
        assertNotNull(response.getBody());
        assertEquals("latest", response.getBody().getPipelineView());
        assertEquals("", response.getBody().getCompanyName());
        assertEquals("", response.getBody().getCompanyLogo());
    }

    @Test
    void globalConfigGetReturnsStoredValues() {
        var repo = mock(com.gitlabops.repository.EnvironmentRepository.class);
        when(repo.getGlobalConfig()).thenReturn(Optional.of(
            new GlobalConfigDTO("Acme Corp", "https://acme.com/logo.png", "all")
        ));

        var encryptionService = mock(com.gitlabops.service.EncryptionService.class);
        var sessionStore = new com.gitlabops.service.SessionStore();
        var envService = new com.gitlabops.service.EnvironmentService(
            repo, encryptionService, sessionStore
        );
        var controller = new com.gitlabops.controller.EnvironmentController(
            envService, mock(com.gitlabops.service.GroupService.class)
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
}
