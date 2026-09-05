package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.ArrayList;

public class ProjectPipeline {

    @JsonProperty("group_id")
    private long groupId;

    private ProjectData project;

    @JsonProperty("pipelines")
    private List<PipelineDTO> pipelines;

    public ProjectPipeline() {
    }

    public ProjectPipeline(long groupId, ProjectData project, List<PipelineDTO> pipelines) {
        this.groupId = groupId;
        this.project = project;
        this.pipelines = pipelines;
    }

    public long getGroupId() { return groupId; }
    public void setGroupId(long groupId) { this.groupId = groupId; }

    public ProjectData getProject() { return project; }
    public void setProject(ProjectData project) { this.project = project; }

    public List<PipelineDTO> getPipelines() { return pipelines; }
    public void setPipelines(List<PipelineDTO> pipelines) { this.pipelines = pipelines; }

    public static class ProjectData {

        private long id;
        private String name;
        private String path;
        @JsonProperty("web_url")
        private String webUrl;
        @JsonProperty("default_branch")
        private String defaultBranch;
        private List<String> topics;
        private NamespaceData namespace;
        @JsonProperty("jobs_enabled")
        private boolean jobsEnabled;

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getPath() { return path; }
        public void setPath(String path) { this.path = path; }

        public String getWebUrl() { return webUrl; }
        public void setWebUrl(String webUrl) { this.webUrl = webUrl; }

        public String getDefaultBranch() { return defaultBranch; }
        public void setDefaultBranch(String defaultBranch) { this.defaultBranch = defaultBranch; }

        public List<String> getTopics() { return topics; }
        public void setTopics(List<String> topics) { this.topics = topics; }

        public NamespaceData getNamespace() { return namespace; }
        public void setNamespace(NamespaceData namespace) { this.namespace = namespace; }

        public boolean isJobsEnabled() { return jobsEnabled; }
        public void setJobsEnabled(boolean jobsEnabled) { this.jobsEnabled = jobsEnabled; }

        public static class NamespaceData {

            private long id;
            private String name;
            private String path;
            @JsonProperty("full_path")
            private String fullPath;

            public NamespaceData() {
            }

            public NamespaceData(long id, String name, String path, String fullPath) {
                this.id = id;
                this.name = name;
                this.path = path;
                this.fullPath = fullPath;
            }

            public long getId() { return id; }
            public void setId(long id) { this.id = id; }

            public String getName() { return name; }
            public void setName(String name) { this.name = name; }

            public String getPath() { return path; }
            public void setPath(String path) { this.path = path; }

            public String getFullPath() { return fullPath; }
            public void setFullPath(String fullPath) { this.fullPath = fullPath; }
        }
    }

    public static class PipelineDTO {

        private long id;
        private long iid;
        @JsonProperty("project_id")
        private long projectId;
        private Object coverage;
        private String sha;
        private String ref;
        private String status;
        private String source;
        @JsonProperty("created_at")
        private String createdAt;
        @JsonProperty("updated_at")
        private String updatedAt;
        @JsonProperty("web_url")
        private String webUrl;

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }

        public long getIid() { return iid; }
        public void setIid(long iid) { this.iid = iid; }

        public long getProjectId() { return projectId; }
        public void setProjectId(long projectId) { this.projectId = projectId; }

        public Object getCoverage() { return coverage; }
        public void setCoverage(Object coverage) { this.coverage = coverage; }

        public String getSha() { return sha; }
        public void setSha(String sha) { this.sha = sha; }

        public String getRef() { return ref; }
        public void setRef(String ref) { this.ref = ref; }

        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }

        public String getSource() { return source; }
        public void setSource(String source) { this.source = source; }

        public String getCreatedAt() { return createdAt; }
        public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

        public String getUpdatedAt() { return updatedAt; }
        public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }

        public String getWebUrl() { return webUrl; }
        public void setWebUrl(String webUrl) { this.webUrl = webUrl; }
    }
}