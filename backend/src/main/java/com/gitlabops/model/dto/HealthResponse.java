package com.gitlabops.model.dto;

public class HealthResponse {

    private String status;
    private String message;

    public HealthResponse() {
        this.status = "UP";
        this.message = "OK";
    }

    public HealthResponse(String status, String message) {
        this.status = status;
        this.message = message;
    }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
