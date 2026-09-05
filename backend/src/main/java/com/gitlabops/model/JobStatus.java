package com.gitlabops.model;

public enum JobStatus {

    CREATED("created"),
    PENDING("pending"),
    RUNNING("running"),
    FAILED("failed"),
    SUCCESS("success"),
    CANCELED("canceled"),
    CANCELING("canceling"),
    SKIPPED("skipped"),
    WAITING_FOR_RESOURCE("waiting_for_resource"),
    MANUAL("manual");

    private final String value;

    JobStatus(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static JobStatus fromValue(String value) {
        for (JobStatus status : values()) {
            if (status.value.equals(value)) {
                return status;
            }
        }
        return null;
    }
}
