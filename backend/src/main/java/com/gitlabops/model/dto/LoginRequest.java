package com.gitlabops.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class LoginRequest {

    @NotBlank(message = "Username is required")
    @Size(max = 255, message = "Username must be 255 characters or fewer")
    private String username;

    @NotBlank(message = "Password is required")
    @Size(max = 255, message = "Password must be 255 characters or fewer")
    private String password;

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}