package com.gitlabops.model.dto;

/**
 * Represents a GitLab group/project member from the GitLab API response.
 */
public record GitlabMember(
    long id,
    String username,
    String name,
    String email,
    String state,
    String avatar_url,
    String web_url,
    int access_level,
    String created_at,
    String expires_at,
    String member_roles,
    String source,
    String confirmation_sent_at,
    String last_sign_in_at,
    String blocked
) {
    public GitlabMember(long id, String username, String name, String email, String state,
                        String avatar_url, String web_url, int access_level, String created_at,
                        String expires_at, String member_roles, String source,
                        String confirmation_sent_at, String last_sign_in_at, String blocked) {
        this.id = id;
        this.username = username;
        this.name = name;
        this.email = email;
        this.state = state;
        this.avatar_url = avatar_url;
        this.web_url = web_url;
        this.access_level = access_level;
        this.created_at = created_at;
        this.expires_at = expires_at;
        this.member_roles = member_roles;
        this.source = source;
        this.confirmation_sent_at = confirmation_sent_at;
        this.last_sign_in_at = last_sign_in_at;
        this.blocked = blocked;
    }
}
