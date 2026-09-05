package com.gitlabops.model.dto;

public class UserMetrics {

    private int activeUsers;
    private int nonActiveUsers;
    private int totalUsers;
    private int totalIssues;
    private int totalMergeRequests;
    private int totalMergedUsers;
    private int totalPushes;
    private int totalComments;
    private boolean activityLoading;

    public UserMetrics() {
    }

    public UserMetrics(int activeUsers, int nonActiveUsers, int totalUsers,
                       int totalIssues, int totalMergeRequests, int totalMergedUsers,
                       int totalPushes, int totalComments, boolean activityLoading) {
        this.activeUsers = activeUsers;
        this.nonActiveUsers = nonActiveUsers;
        this.totalUsers = totalUsers;
        this.totalIssues = totalIssues;
        this.totalMergeRequests = totalMergeRequests;
        this.totalMergedUsers = totalMergedUsers;
        this.totalPushes = totalPushes;
        this.totalComments = totalComments;
        this.activityLoading = activityLoading;
    }

    public int getActiveUsers() { return activeUsers; }
    public void setActiveUsers(int activeUsers) { this.activeUsers = activeUsers; }

    public int getNonActiveUsers() { return nonActiveUsers; }
    public void setNonActiveUsers(int nonActiveUsers) { this.nonActiveUsers = nonActiveUsers; }

    public int getTotalUsers() { return totalUsers; }
    public void setTotalUsers(int totalUsers) { this.totalUsers = totalUsers; }

    public int getTotalIssues() { return totalIssues; }
    public void setTotalIssues(int totalIssues) { this.totalIssues = totalIssues; }

    public int getTotalMergeRequests() { return totalMergeRequests; }
    public void setTotalMergeRequests(int totalMergeRequests) { this.totalMergeRequests = totalMergeRequests; }

    public int getTotalMergedUsers() { return totalMergedUsers; }
    public void setTotalMergedUsers(int totalMergedUsers) { this.totalMergedUsers = totalMergedUsers; }

    public int getTotalPushes() { return totalPushes; }
    public void setTotalPushes(int totalPushes) { this.totalPushes = totalPushes; }

    public int getTotalComments() { return totalComments; }
    public void setTotalComments(int totalComments) { this.totalComments = totalComments; }

    public boolean isActivityLoading() { return activityLoading; }
    public void setActivityLoading(boolean activityLoading) { this.activityLoading = activityLoading; }
}
