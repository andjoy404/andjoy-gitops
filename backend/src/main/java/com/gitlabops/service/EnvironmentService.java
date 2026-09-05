package com.gitlabops.service;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import com.gitlabops.model.dto.EnvironmentCreateRequest;
import com.gitlabops.model.dto.EnvironmentDTO;
import com.gitlabops.model.dto.EnvironmentUpdateRequest;
import com.gitlabops.model.dto.GlobalConfigDTO;
import com.gitlabops.model.dto.GlobalConfigRequest;
import com.gitlabops.repository.EnvironmentRepository;

@Service
public class EnvironmentService {

    private static final Logger log = LoggerFactory.getLogger(EnvironmentService.class);

    private final EnvironmentRepository environmentRepository;
    private final EncryptionService encryptionService;
    private final SessionStore sessionStore;

    public EnvironmentService(EnvironmentRepository environmentRepository,
                              EncryptionService encryptionService,
                              SessionStore sessionStore) {
        this.environmentRepository = environmentRepository;
        this.encryptionService = encryptionService;
        this.sessionStore = sessionStore;
    }

    public EnvironmentDTO getEnvironment(long id) {
        return environmentRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Environment not found"));
    }

    public java.util.List<EnvironmentDTO> getAllEnvironments() {
        return environmentRepository.listAll();
    }

    public EnvironmentDTO createEnvironment(HttpServletRequest request,
                                            EnvironmentCreateRequest req) {
        requireAdmin(request);

        String name = req.getName().trim();
        String baseUrl = req.getBaseUrl().trim().replaceAll("/+$", "");
        String token = req.getToken().trim();

        if (name.isEmpty() || baseUrl.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and GitLab URL are required");
        }

        if (token.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name, GitLab URL, and token are required");
        }

        validateGitLabToken(baseUrl, token);

        byte[] encryptedToken = encryptionService.encrypt(token);

        long id = environmentRepository.create(
            name, baseUrl, encryptedToken,
            req.getGroupIds() != null ? req.getGroupIds() : new java.util.ArrayList<>(),
            req.isEnabled(),
            req.isOnlyTopLevel(),
            req.isIncludeSubgroups()
        );

        return environmentRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create environment"));
    }

    public void updateEnvironment(HttpServletRequest request, long id,
                                  EnvironmentUpdateRequest req) {
        requireAdmin(request);

        environmentRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Environment not found"));

        String name = req.getName().trim();
        String baseUrl = req.getBaseUrl().trim().replaceAll("/+$", "");

        if (name.isEmpty() || baseUrl.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and GitLab URL are required");
        }

        // Token is optional: only encrypt/re-encrypt if provided
        if (req.getToken() != null && !req.getToken().isEmpty()) {
            String token = req.getToken().trim();
            validateGitLabToken(baseUrl, token);
            byte[] encryptedToken = encryptionService.encrypt(token);
            environmentRepository.update(
                id, name, baseUrl, encryptedToken,
                req.getGroupIds() != null ? req.getGroupIds() : new java.util.ArrayList<>(),
                req.isEnabled(),
                req.isOnlyTopLevel(),
                req.isIncludeSubgroups()
            );
        } else {
            environmentRepository.updateWithoutToken(
                id, name, baseUrl,
                req.getGroupIds() != null ? req.getGroupIds() : new java.util.ArrayList<>(),
                req.isEnabled(),
                req.isOnlyTopLevel(),
                req.isIncludeSubgroups()
            );
        }

        environmentRepository.setLastTested(id);
    }

    public void deleteEnvironment(HttpServletRequest request, long id) {
        requireAdmin(request);

        environmentRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Environment not found"));

        environmentRepository.deleteById(id);
    }

    public void setDefaultEnvironment(HttpServletRequest request, long id) {
        requireAdmin(request);

        environmentRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Environment not found"));

        environmentRepository.setDefault(id);
    }

    public GlobalConfigDTO getGlobalConfig() {
        return environmentRepository.getGlobalConfig()
            .orElse(new GlobalConfigDTO("", "", "latest"));
    }

    public void updateGlobalConfig(HttpServletRequest request, GlobalConfigRequest req) {
        requireAdmin(request);

        String companyName = req.getCompanyName().trim();
        if (companyName.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Company name is required");
        }

        String pipelineView = req.getPipelineView() != null ? req.getPipelineView().trim() : "latest";
        if (!"all".equals(pipelineView) && !"latest".equals(pipelineView)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid pipeline view: must be 'all' or 'latest'");
        }

        environmentRepository.saveGlobalConfig(
            companyName,
            req.getCompanyLogo() != null ? req.getCompanyLogo() : "",
            pipelineView
        );
    }

    private void validateGitLabToken(String baseUrl, String token) {
        try {
            WebClient client = WebClient.builder()
                .baseUrl(baseUrl)
                .build();

            client
                .get()
                .uri("/api/v4/user")
                .header("PRIVATE-TOKEN", token)
                .retrieve()
                .bodyToMono(String.class)
                .block();
        } catch (WebClientResponseException.Unauthorized | WebClientResponseException.Forbidden e) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "GitLab access token is invalid or does not have access to that instance"
            );
        } catch (WebClientResponseException e) {
            log.warn("GitLab token validation returned HTTP {} for {}", e.getStatusCode().value(), baseUrl);
            throw new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "GitLab rejected the validation request with HTTP " + e.getStatusCode().value()
            );
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Failed to validate GitLab token for {}: {}", baseUrl, e.getMessage());
            throw new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "Unable to connect to the configured GitLab URL"
            );
        }
    }

    private void requireAdmin(HttpServletRequest request) {
        String sessionToken = extractSessionCookie(request);

        if (sessionToken == null || sessionToken.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Authentication is required");
        }

        var session = sessionStore.getSession(sessionToken);
        if (session == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Authentication is required");
        }

        if (!"admin".equals(session.role())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Administrator access is required");
        }
    }

    private String extractSessionCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if ("gcd_session".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }
}
