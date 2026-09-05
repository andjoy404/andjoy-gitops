package com.gitlabops.model.dto;

import java.time.OffsetDateTime;

public class AppUserDTO {
    public Long id;
    public String username;
    public String passwordHash;
    public String displayName;
    public String email;
    public String role;
    public Boolean enabled;
    public Boolean mustChangePassword;
    public OffsetDateTime created_at;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }

    public Boolean getMustChangePassword() { return mustChangePassword; }
    public void setMustChangePassword(Boolean mustChangePassword) { this.mustChangePassword = mustChangePassword; }

    public OffsetDateTime getCreatedAt() { return created_at; }
    public void setCreatedAt(OffsetDateTime created_at) { this.created_at = created_at; }
}
