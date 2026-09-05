package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.NONE,
                getterVisibility = JsonAutoDetect.Visibility.PUBLIC_ONLY)
public class UserActivity {

    private long id;
    private String username;
    private String name;

    private String avatarUrl;
    private String webUrl;
    private String state;

    private boolean isAdmin;

    private boolean isCurrentMember;

    private String lastActivityOn;

    private int issueCount;

    private int mergeRequestCount;

    private int mergedCount;

    private int pushCount;

    private int commentCount;

    private String lastPipelineActivity;

    private int totalActivity;

    public UserActivity() {
    }

    public UserActivity(long id, String username, String name, String avatarUrl,
                        String webUrl, String state, boolean isAdmin, boolean isCurrentMember,
                        String lastActivityOn, int issueCount, int mergeRequestCount,
                        int pushCount, int commentCount, String lastPipelineActivity) {
        this.id = id;
        this.username = username;
        this.name = name;
        this.avatarUrl = avatarUrl;
        this.webUrl = webUrl;
        this.state = state;
        this.isAdmin = isAdmin;
        this.isCurrentMember = isCurrentMember;
        this.lastActivityOn = lastActivityOn;
        this.issueCount = issueCount;
        this.mergeRequestCount = mergeRequestCount;
        this.pushCount = pushCount;
        this.commentCount = commentCount;
        this.lastPipelineActivity = lastPipelineActivity;
        this.totalActivity = pushCount + mergeRequestCount + commentCount + issueCount;
    }

    public long getId() { return id; }
    public void setId(long id) { this.id = id; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    @JsonProperty("avatar_url")
    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }

    @JsonProperty("web_url")
    public String getWebUrl() { return webUrl; }
    public void setWebUrl(String webUrl) { this.webUrl = webUrl; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    @JsonProperty("is_admin")
    public boolean isAdmin() { return isAdmin; }
    public void setIsAdmin(boolean admin) { isAdmin = admin; }

    @JsonProperty("is_current_member")
    public boolean isCurrentMember() { return isCurrentMember; }
    public void setIsCurrentMember(boolean currentMember) { isCurrentMember = currentMember; }

    @JsonProperty("last_activity_on")
    public String getLastActivityOn() { return lastActivityOn; }
    public void setLastActivityOn(String lastActivityOn) { this.lastActivityOn = lastActivityOn; }

    @JsonProperty("issue_count")
    public int getIssueCount() { return issueCount; }
    public void setIssueCount(int issueCount) { this.issueCount = issueCount; }

    @JsonProperty("merge_request_count")
    public int getMergeRequestCount() { return mergeRequestCount; }
    public void setMergeRequestCount(int mergeRequestCount) { this.mergeRequestCount = mergeRequestCount; }

    @JsonProperty("merged_count")
    public int getMergedCount() { return mergedCount; }
    public void setMergedCount(int mergedCount) { this.mergedCount = mergedCount; }

    @JsonProperty("push_count")
    public int getPushCount() { return pushCount; }
    public void setPushCount(int pushCount) { this.pushCount = pushCount; }

    @JsonProperty("comment_count")
    public int getCommentCount() { return commentCount; }
    public void setCommentCount(int commentCount) { this.commentCount = commentCount; }

    @JsonProperty("last_pipeline_activity")
    public String getLastPipelineActivity() { return lastPipelineActivity; }
    public void setLastPipelineActivity(String lastPipelineActivity) { this.lastPipelineActivity = lastPipelineActivity; }

    @JsonProperty("total_activity")
    public int getTotalActivity() {
        return pushCount + mergeRequestCount + commentCount + issueCount;
    }
}
