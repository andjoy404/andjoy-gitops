package com.gitlabops.controller;

import com.gitlabops.model.dto.EnvironmentCreateRequest;
import com.gitlabops.model.dto.EnvironmentDTO;
import com.gitlabops.model.dto.EnvironmentUpdateRequest;
import com.gitlabops.model.dto.GlobalConfigDTO;
import com.gitlabops.model.dto.GlobalConfigRequest;
import com.gitlabops.model.dto.GroupDTO;
import com.gitlabops.service.EnvironmentService;
import com.gitlabops.service.GroupService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.List;

@RestController
@RequestMapping("/api")
public class EnvironmentController {

    private final EnvironmentService environmentService;

    private final GroupService groupService;

    public EnvironmentController(EnvironmentService environmentService, GroupService groupService) {
        this.environmentService = environmentService;
        this.groupService = groupService;
    }

    @GetMapping("/environments")
    public ResponseEntity<List<EnvironmentDTO>> getAllEnvironments() {
        return ResponseEntity.ok(environmentService.getAllEnvironments());
    }

    @PostMapping("/environments")
    public ResponseEntity<?> createEnvironment(@Valid @RequestBody EnvironmentCreateRequest req,
                                               HttpServletRequest request) {
        try {
            EnvironmentDTO created = environmentService.createEnvironment(request, req);
            groupService.invalidateCache();
            return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("id", created.getId()));
        } catch (org.springframework.web.server.ResponseStatusException e) {
            String message = e.getReason() != null ? e.getReason() : "Unable to create environment";
            return ResponseEntity.status(e.getStatusCode()).body(Map.of("error", message));
        }
    }

    @PatchMapping("/environments/{id}")
    public ResponseEntity<Void> updateEnvironment(@PathVariable long id,
                                                   @Valid @RequestBody EnvironmentUpdateRequest req,
                                                   HttpServletRequest request) {
        try {
            environmentService.updateEnvironment(request, id, req);
            groupService.invalidateCache();
            return ResponseEntity.noContent().build();
        } catch (org.springframework.web.server.ResponseStatusException e) {
            if (e.getStatusCode() == HttpStatus.NOT_FOUND) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/environments/{id}")
    public ResponseEntity<Void> deleteEnvironment(@PathVariable long id,
                                                   HttpServletRequest request) {
        try {
            environmentService.deleteEnvironment(request, id);
            groupService.invalidateCache();
            return ResponseEntity.noContent().build();
        } catch (org.springframework.web.server.ResponseStatusException e) {
            if (e.getStatusCode() == HttpStatus.NOT_FOUND) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.status(e.getStatusCode()).build();
        }
    }

    @PatchMapping("/environments/{id}/set-default")
    public ResponseEntity<Void> setDefaultEnvironment(@PathVariable long id,
                                                       HttpServletRequest request) {
        try {
            environmentService.setDefaultEnvironment(request, id);
            return ResponseEntity.noContent().build();
        } catch (org.springframework.web.server.ResponseStatusException e) {
            if (e.getStatusCode() == HttpStatus.NOT_FOUND) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.status(e.getStatusCode()).build();
        }
    }

    @GetMapping("/groups")
    public ResponseEntity<List<GroupDTO>> getAllGroups() {
        return ResponseEntity.ok(groupService.getAllGroups());
    }

    @GetMapping("/global-config")
    public ResponseEntity<GlobalConfigDTO> getGlobalConfig() {
        return ResponseEntity.ok(environmentService.getGlobalConfig());
    }

    @PutMapping("/global-config")
    public ResponseEntity<Void> updateGlobalConfig(@Valid @RequestBody GlobalConfigRequest req,
                                                    HttpServletRequest request) {
        try {
            environmentService.updateGlobalConfig(request, req);
            return ResponseEntity.noContent().build();
        } catch (org.springframework.web.server.ResponseStatusException e) {
            return ResponseEntity.status(e.getStatusCode()).build();
        }
    }
}
