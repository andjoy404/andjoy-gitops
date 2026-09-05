package com.gitlabops.service;

import com.gitlabops.model.dto.GraphEdge;
import com.gitlabops.model.dto.GraphNode;
import com.gitlabops.model.dto.GraphResponse;
import com.gitlabops.model.dto.GraphResponse.GraphMetadata;
import com.gitlabops.util.FederatedIdUtility;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.jooq.Result;
import org.jooq.impl.DSL;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

import static org.jooq.impl.DSL.field;

@Service
public class GraphService {

    private static final Logger log = LoggerFactory.getLogger(GraphService.class);

    private final DSLContext dsl;

    public GraphService(DSLContext dsl) {
        this.dsl = dsl;
    }

    // ─── Mode 1: User → Group → Project ───────────────────────────────

    public GraphResponse getUserProjectGraph(String groupIds, String userIdsParam) {
        return getUserProjectGraph(groupIds, null, userIdsParam, null);
    }

    public GraphResponse getUserProjectGraph(String groupIds, String groupPaths, String userIdsParam) {
        return getUserProjectGraph(groupIds, groupPaths, userIdsParam, null);
    }

    public GraphResponse getUserProjectGraph(String groupIds, String groupPaths,
                                             String userIdsParam, String projectIdsParam) {
        Set<Long> groupIdsSet = parseGroupIds(groupIds);
        List<String> groupPathsList = parseGroupPaths(groupPaths);
        Set<Long> userIdsSet = parseIds(userIdsParam);
        Set<Long> projectIdsSet = parseIds(projectIdsParam);

        if (groupIdsSet.isEmpty() && groupPathsList.isEmpty() && projectIdsSet.isEmpty()) {
            return buildEmptyResponse("user-group-project");
        }

        List<Long> groupList = new ArrayList<>(groupIdsSet);

        if (groupList.size() > 65535) {
            groupList = groupList.subList(0, 65535);
        }

        StringBuilder where = new StringBuilder("WHERE 1=1");
        List<Object> params = new ArrayList<>();
        appendGroupFilter(where, params, groupIdsSet, groupPathsList,
                "r.group_id", "ap.namespace_path");

        if (!userIdsSet.isEmpty()) {
            where.append(" AND r.user_id IN (").append(buildInClause(new ArrayList<>(userIdsSet))).append(")");
            params.addAll(userIdsSet);
        }

        if (!projectIdsSet.isEmpty()) {
            where.append(" AND r.project_id IN (").append(buildInClause(new ArrayList<>(projectIdsSet))).append(")");
            params.addAll(projectIdsSet);
        }

        String sql = ("SELECT r.user_id, r.group_id, r.project_id,"
                + " r.relation_type, r.evidence_type,"
                + " au.username, au.name, au.avatar_url, au.web_url,"
                + " ap.name AS project_name, ap.path || '/' || ap.namespace_path AS project_path_with_ns,"
                + " ap.namespace_path, ap.web_url AS project_web_url"
                + " FROM analytics_user_project_relations r"
                + " JOIN analytics_users au ON au.gitlab_id = r.user_id"
                + " JOIN analytics_projects ap ON ap.gitlab_id = r.project_id"
                + " " + where
                + " ORDER BY r.user_id, r.group_id, r.project_id").toString();
        Result<Record> rows = dsl.fetch(sql, params.toArray());

        Map<Long, GraphNode> userNodes = new LinkedHashMap<>();
        Map<String, GraphNode> groupNodes = new LinkedHashMap<>();
        Map<Long, GraphNode> projectNodes = new LinkedHashMap<>();
        Set<String> edges = new LinkedHashSet<>();
        Set<String> seenGroupProject = new LinkedHashSet<>();

        for (Record row : rows) {
            long userId = row.get("user_id", Long.class);
            long groupId = row.get("group_id", Long.class);
            long projectId = row.get("project_id", Long.class);
            String evidenceType = row.get("evidence_type", String.class);
            String username = row.get("username", String.class);
            String userName = row.get("name", String.class);
            String avatarUrl = row.get("avatar_url", String.class);
            String userWebUrl = row.get("web_url", String.class);
            String projectName = row.get("project_name", String.class);
            String projectPath = row.get("project_path_with_ns", String.class);
            String nsPath = row.get("namespace_path", String.class);
            String projectWebUrl = row.get("project_web_url", String.class);

            if (!userNodes.containsKey(userId)) {
                GraphNode u = new GraphNode();
                u.setId("user:" + userId);
                u.setType("user");
                u.setLabel(userName != null && !userName.isEmpty() ? userName : username);
                u.setSecondaryLabel("@" + username);
                u.setAvatarUrl(avatarUrl);
                u.setWebUrl(userWebUrl);
                userNodes.put(userId, u);
            }

            // Key group nodes by the project's namespace (its immediate
            // parent group) rather than the relation's sync-root group_id,
            // which is a single top-level sync root many subgroups share.
            // Keying by namespace_path keeps distinct selected subgroups as
            // distinct nodes instead of collapsing them into one.
            String groupKey = (nsPath != null && !nsPath.isEmpty()) ? nsPath : ("id:" + groupId);
            if (groupId != 0L && !groupNodes.containsKey(groupKey)) {
                GraphNode g = new GraphNode();
                g.setId("group:" + groupKey);
                g.setType("group");
                g.setLabel(groupKey);
                g.setSecondaryLabel("Group: " + groupKey);
                groupNodes.put(groupKey, g);
            }

            if (!projectNodes.containsKey(projectId)) {
                GraphNode p = new GraphNode();
                p.setId("project:" + projectId);
                p.setType("project");
                p.setLabel(projectName);
                p.setSecondaryLabel(projectPath);
                p.setPathWithNs(projectPath);
                p.setWebUrl(projectWebUrl);
                p.setDefaultBranch("main");
                projectNodes.put(projectId, p);
            }

            // The user is always connected through the owning group
            // (user -> group -> project). A direct user -> project edge is
            // only added when the relation carries no group, so a user that
            // belongs to a project via a group is never also linked straight
            // to the project.
            if (groupId == 0L) {
                edges.add("user:" + userId + "->project:" + projectId);
            } else {
                edges.add("user:" + userId + "->group:" + groupKey);
                String gpPair = groupKey + ":" + projectId;
                if (seenGroupProject.add(gpPair)) {
                    edges.add("group:" + groupKey + "->project:" + projectId);
                }
            }
        }

        List<GraphNode> allNodes = new ArrayList<>();
        allNodes.addAll(userNodes.values());
        allNodes.addAll(groupNodes.values());
        allNodes.addAll(projectNodes.values());

        List<String> edgeList = new ArrayList<>(edges);
        List<GraphEdge> allEdges = buildUserProjectEdges(edgeList);

        if (allNodes.isEmpty()) {
            return buildEmptyResponse("user-group-project");
        }

        GraphMetadata meta = new GraphMetadata();
        meta.setMapType("user-group-project");
        meta.setNodeCount(allNodes.size());
        meta.setEdgeCount(allEdges.size());

        log.info("Mode 1: {} users, {} groups, {} projects, {} edges",
                userNodes.size(), groupNodes.size(), projectNodes.size(), allEdges.size());

        GraphResponse response = new GraphResponse();
        response.setNodes(allNodes);
        response.setEdges(allEdges);
        response.setMetadata(meta);
        return response;
    }

    // ─── Mode 2: Project → Branch → Pipeline → Job ────────────────────

    public GraphResponse getCICDGraph(String groupIds, String projectIdsParam,
                                        String branchNamesParam,
                                        String pipelineStatusesParam,
                                        String jobStatusesParam,
                                        Integer hours) {
        return getCICDGraph(groupIds, null, projectIdsParam, branchNamesParam,
                pipelineStatusesParam, jobStatusesParam, hours);
    }

    public GraphResponse getCICDGraph(String groupIds, String groupPaths, String projectIdsParam,
                                        String branchNamesParam,
                                        String pipelineStatusesParam,
                                        String jobStatusesParam,
                                        Integer hours) {
        Set<Long> groupIdsSet = parseGroupIds(groupIds);
        List<String> groupPathsList = parseGroupPaths(groupPaths);
        Set<Long> projectIdsSet = parseIds(projectIdsParam);
        List<String> branchNames = parseCsv(branchNamesParam);

        if (groupIdsSet.isEmpty() && groupPathsList.isEmpty() && projectIdsSet.isEmpty()) {
            return buildEmptyResponse("project-branch-pipeline-jobs");
        }

        // Step 1: Fetch projects
        List<GraphNode> projects = queryProjects(groupIdsSet, groupPathsList, projectIdsSet);
        if (projects.isEmpty()) {
            return buildEmptyResponse("project-branch-pipeline-jobs");
        }

        Set<Long> availableProjectIds = new HashSet<>();
        for (GraphNode p : projects) {
            availableProjectIds.add(Long.parseLong(p.getId().replace("project:", "")));
        }

        // Step 2: Query pipelines
        String whereClause = "WHERE p.project_id IN (%s)".formatted(buildInClause(new ArrayList<>(availableProjectIds)));

        List<Object> pipeParams = new ArrayList<>(availableProjectIds);
        if (hours != null && hours > 0) {
            whereClause += " AND p.updated_at > NOW() - (? || ' hours')::interval";
            pipeParams.add(hours);
        }

        List<String> pipelineStatuses = parseCsvLower(pipelineStatusesParam);
        if (!pipelineStatuses.isEmpty()) {
            whereClause += " AND LOWER(p.status) IN (%s)"
                .formatted(buildInClauseStrings(pipelineStatuses));
            pipeParams.addAll(pipelineStatuses);
        }
        if (!branchNames.isEmpty()) {
            whereClause += " AND p.branch IN (%s)"
                .formatted(buildInClauseStrings(branchNames));
            pipeParams.addAll(branchNames);
        }

        // Cap the node count for the frontend graph renderer: a wide scope
        // (e.g. the 90-day window) would otherwise pull thousands of pipelines
        // and their jobs, freezing the browser. Keep only the most recent.
        whereClause += " ORDER BY p.updated_at DESC LIMIT 500";
        Result<Record> pipeRows = dsl.fetch(
            """
            SELECT p.gitlab_id, p.project_id, p.branch, p.status,
                   p.sha, p.source, p.web_url, p.iid
            FROM analytics_pipelines p
            %s
            """.formatted(whereClause),
            pipeParams.toArray()
        );

        // Step 3: Build pipeline nodes
        Map<Long, GraphNode> pipelineNodes = new LinkedHashMap<>();
        Map<Long, Long> pipelineProjectOf = new HashMap<>();
        Map<Long, String> pipelineBranchOf = new HashMap<>();
        for (Record row : pipeRows) {
            long pid = row.get("gitlab_id", Long.class);
            long projectId = row.get("project_id", Long.class);
            String branch = row.get("branch", String.class);
            String source = row.get("source", String.class);
            String webUrl = row.get("web_url", String.class);
            long iid = row.get("iid", Long.class);

            String key = "pipeline:" + pid;
            if (!pipelineNodes.containsKey(key)) {
                GraphNode pipe = new GraphNode();
                pipe.setId(key);
                pipe.setType("pipeline");
                pipe.setLabel("Pipeline #" + iid);
                pipe.setSecondaryLabel(branch + " · " + source);
                pipe.setPipelineCount(0);
                pipe.setWebUrl(webUrl);
                pipelineNodes.put(pid, pipe);
                pipelineProjectOf.put(pid, projectId);
                pipelineBranchOf.put(pid, branch == null ? "" : branch);
            }
        }

        if (pipelineNodes.isEmpty()) {
            return buildEmptyResponse("project-branch-pipeline-jobs");
        }

        // Step 4: Query jobs
        List<Long> pipelineIds = new ArrayList<>(pipelineNodes.keySet());
        Map<Long, GraphNode> jobNodes = new LinkedHashMap<>();

        String jobFilter = "j.pipeline_id IN (%s)".formatted(buildInClause(pipelineIds));

        List<Object> jobParams = new ArrayList<>(pipelineIds);
        List<String> jobStatuses = parseCsvLower(jobStatusesParam);
        if (!jobStatuses.isEmpty()) {
            jobFilter += " AND LOWER(j.status) IN (%s)"
                .formatted(buildInClauseStrings(jobStatuses));
            jobParams.addAll(jobStatuses);
        }

        // Same renderer budget as the pipeline step: cap the (most recent) job
        // nodes so a big scope can't hand the frontend tens of thousands of
        // leaves and freeze the browser.
        String jobSql = "SELECT j.gitlab_id, j.name, j.stage, j.status, j.web_url, j.pipeline_id FROM analytics_jobs j WHERE %s ORDER BY j.created_at DESC LIMIT 3000".formatted(jobFilter);
        Result<Record> jobRows = dsl.fetch(jobSql, jobParams.toArray());
        for (Record row : jobRows) {
            long jobId = row.get("gitlab_id", Long.class);
            String jobName = row.get("name", String.class);
            String stage = row.get("stage", String.class);
            String status = row.get("status", String.class);
            String webUrl = row.get("web_url", String.class);
            long pipelineId = row.get("pipeline_id", Long.class);

            String key = "job:" + jobId;
            if (!jobNodes.containsKey(key)) {
                GraphNode jn = new GraphNode();
                jn.setId(key);
                jn.setType("job");
                jn.setLabel(jobName);
                jn.setSecondaryLabel("Stage: " + stage);
                jn.setStatus(status);
                jn.setWebUrl(webUrl);
                jn.setPipelineId(pipelineId);
                jobNodes.put(jobId, jn);
            }
        }

        // Step 5: Build branch nodes from pipeline data
        // Step 5: Build branch nodes. Branches must be per-project: a pipeline
        // lives in exactly one project, so each branch node is keyed by the
        // owning project. This keeps project→branch and branch→pipeline edges
        // attached to the correct project instead of always the first one.
        Map<String, Integer> branchCounts = new LinkedHashMap<>(); // "pid|branch" -> pipelines
        Map<String, Long> branchProject = new LinkedHashMap<>();
        for (Long pid : pipelineProjectOf.keySet()) {
            long ownerId = pipelineProjectOf.get(pid);
            String bName = pipelineBranchOf.get(pid);
            if (bName == null || bName.isEmpty()) continue;
            String bk = ownerId + "|" + bName;
            branchCounts.put(bk, branchCounts.getOrDefault(bk, 0) + 1);
            branchProject.putIfAbsent(bk, ownerId);
        }

        Map<String, GraphNode> branchNodes = new LinkedHashMap<>(); // "branch:pid:name" -> node
        Map<String, Long> branchNodeOwner = new LinkedHashMap<>();  // node id -> project id
        for (Map.Entry<String, Integer> entry : branchCounts.entrySet()) {
            Long ownerId = branchProject.get(entry.getKey());
            String bName = entry.getKey().substring(entry.getKey().indexOf('|') + 1);
            String bKey = "branch:" + ownerId + ":" + bName;
            GraphNode bn = new GraphNode();
            bn.setId(bKey);
            bn.setType("branch");
            bn.setLabel(bName);
            bn.setSecondaryLabel(entry.getValue() + " pipeline" + (entry.getValue() > 1 ? "s" : ""));
            bn.setPipelineCount(entry.getValue());
            branchNodes.put(bKey, bn);
            branchNodeOwner.put(bKey, ownerId);
        }

        // Step 6: Assemble all nodes
        List<GraphNode> allNodes = new ArrayList<>();
        allNodes.addAll(projects);
        allNodes.addAll(branchNodes.values());
        allNodes.addAll(pipelineNodes.values());
        allNodes.addAll(jobNodes.values());

        // Step 7: Build edges
        List<GraphEdge> allEdges = new ArrayList<>();

        // Project → Branch
        for (GraphNode project : projects) {
            long pid = Long.parseLong(project.getId().replace("project:", ""));
            for (GraphNode branch : branchNodes.values()) {
                if (branch.getId().startsWith("branch:" + pid + ":")) {
                    GraphEdge e = new GraphEdge();
                    e.setId(project.getId() + "->" + branch.getId());
                    e.setSource(project.getId());
                    e.setTarget(branch.getId());
                    e.setType("project-branch");
                    allEdges.add(e);
                }
            }
        }

        // Branch → Pipeline (exact: the pipeline's owning project + branch name)
        for (Long pid : pipelineProjectOf.keySet()) {
            long ownerId = pipelineProjectOf.get(pid);
            String pBranch = pipelineBranchOf.get(pid);
            if (pBranch == null || pBranch.isEmpty()) continue;
            String branchNodeId = "branch:" + ownerId + ":" + pBranch;
            if (branchNodes.containsKey(branchNodeId)) {
                String pipeId = "pipeline:" + pid;
                GraphEdge e = new GraphEdge();
                e.setId(branchNodeId + "->" + pipeId);
                e.setSource(branchNodeId);
                e.setTarget(pipeId);
                e.setType("branch-pipeline");
                allEdges.add(e);
            }
        }

        // Pipeline → Job
        for (GraphNode job : jobNodes.values()) {
            Long pId = job.getPipelineId();
            if (pId != null && pipelineNodes.containsKey(pId)) {
                String pipeId = "pipeline:" + pId;
                GraphEdge e = new GraphEdge();
                e.setId(pipeId + "->" + job.getId());
                e.setSource(pipeId);
                e.setTarget(job.getId());
                e.setType("pipeline-job");
                allEdges.add(e);
            }
        }

        GraphMetadata meta = new GraphMetadata();
        meta.setMapType("project-branch-pipeline-jobs");
        meta.setNodeCount(allNodes.size());
        meta.setEdgeCount(allEdges.size());

        log.info("Mode 2: {} projects, {} branches, {} pipelines, {} jobs, {} edges",
                projects.size(), branchNodes.size(), pipelineNodes.size(),
                jobNodes.size(), allEdges.size());

        GraphResponse response = new GraphResponse();
        response.setNodes(allNodes);
        response.setEdges(allEdges);
        response.setMetadata(meta);
        return response;
    }

    // ─── Filter options ─────────────────────────────────────────
    //
    // Used by the Relations Map UI to populate the user / project / branch
    // filter dropdowns with real, current values for the selected group
    // instead of hardcoded sample ids.

    /**
     * Users for the Relations Map filter, scoped by the selected projects when
     * given (users who have a relation to any of those projects), else scoped
     * to the selected groups. Supports the project → users cascade.
     */
    public List<Map<String, Object>> graphUsers(String groupIds, String projectIds, String groupPaths) {
        Set<Long> groups = parseGroupIds(groupIds);
        Set<Long> projects = parseIds(projectIds);
        List<String> gpaths = parseGroupPaths(groupPaths);
        if (groups.isEmpty() && gpaths.isEmpty() && projects.isEmpty()) return List.of();

        StringBuilder sql = new StringBuilder(
                "SELECT DISTINCT au.gitlab_id AS id, au.username, au.name, au.avatar_url "
                + "FROM analytics_user_project_relations r "
                + "JOIN analytics_users au ON au.gitlab_id = r.user_id "
                + "LEFT JOIN analytics_projects ap ON ap.gitlab_id = r.project_id WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (!projects.isEmpty()) {
            sql.append(" AND r.project_id IN (").append(buildInClause(new ArrayList<>(projects))).append(")");
            params.addAll(projects);
        }
        // Group scope: match on the relation's stored group_id OR on the
        // project's namespace path (subtree of the selected groups).
        if (!groups.isEmpty() || !gpaths.isEmpty()) {
            StringBuilder cond = new StringBuilder(" AND (");
            boolean first = true;
            if (!groups.isEmpty()) {
                cond.append("r.group_id IN (").append(buildInClause(new ArrayList<>(groups))).append(")");
                params.addAll(groups);
                first = false;
            }
            for (String p : gpaths) {
                if (!first) cond.append(" OR ");
                cond.append("ap.namespace_path = ?");
                params.add(p);
                cond.append(" OR ap.namespace_path LIKE ?");
                params.add(p + "/%");
                first = false;
            }
            cond.append(")");
            sql.append(cond);
        }
        sql.append(" ORDER BY au.username");

        Result<Record> rows = dsl.fetch(sql.toString(), params.toArray());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Record r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.get("id", Long.class));
            m.put("username", r.get("username", String.class));
            m.put("name", r.get("name", String.class));
            m.put("avatar_url", r.get("avatar_url", String.class));
            out.add(m);
        }
        return out;
    }

    /**
     * Projects for the Relations Map filter, scoped by the selected users when
     * given (projects those users relate to), else scoped to the selected
     * groups.
     */
    public List<Map<String, Object>> graphProjects(String groupIds, String userIds, String groupPaths,
                                                   Integer hours, boolean cicd) {
        Set<Long> groups = parseGroupIds(groupIds);
        Set<Long> users = parseIds(userIds);
        List<String> gpaths = parseGroupPaths(groupPaths);
        if (groups.isEmpty() && gpaths.isEmpty() && users.isEmpty()) return List.of();

        StringBuilder sql;
        List<Object> params = new ArrayList<>();
        if (!users.isEmpty()) {
            sql = new StringBuilder(
                    "SELECT DISTINCT ap.gitlab_id AS id, ap.name, ap.path, ap.namespace_path, ap.default_branch "
                    + "FROM analytics_user_project_relations r "
                    + "JOIN analytics_projects ap ON ap.gitlab_id = r.project_id WHERE 1=1");
            sql.append(" AND r.user_id IN (").append(buildInClause(new ArrayList<>(users))).append(")");
            params.addAll(users);
            if (!gpaths.isEmpty()) {
                // Scoped by the selected path subtree exactly: a project matches
                // when its own namespace_path equals a selected group path or
                // is nested under it. This avoids leaking projects via the
                // project's stored group_id (its environment sync root).
                appendGroupPathFilter(sql, params, gpaths, "ap.namespace_path");
            } else if (!groups.isEmpty()) {
                appendGroupFilter(sql, params, groups, gpaths,
                        "ap.group_id", "ap.namespace_path");
            }
        } else {
            sql = new StringBuilder(
                    "SELECT gitlab_id AS id, name, path, namespace_path, default_branch "
                    + "FROM analytics_projects ap WHERE 1=1");
            if (!gpaths.isEmpty()) {
                appendGroupPathFilter(sql, params, gpaths, "ap.namespace_path");
            } else {
                appendGroupFilter(sql, params, groups, gpaths,
                        "ap.group_id", "ap.namespace_path");
            }
        }
        // On the CICD map, a project is only selectable if it has pipeline
        // records within the active time range, so the drill-down doesn't list
        // projects that would render an empty map.
        if (cicd && hours != null && hours > 0) {
            sql.append(" AND EXISTS (SELECT 1 FROM analytics_pipelines p "
                    + "WHERE p.project_id = ap.gitlab_id "
                    + "AND p.updated_at > NOW() - (? || ' hours')::interval)");
            params.add(hours);
        }
        sql.append(" ORDER BY ap.name");

        Result<Record> rows = dsl.fetch(sql.toString(), params.toArray());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Record r : rows) {
            String path = r.get("path", String.class);
            String ns = r.get("namespace_path", String.class);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.get("id", Long.class));
            m.put("name", r.get("name", String.class));
            m.put("path_with_ns", (ns != null && !ns.isEmpty()) ? ns + "/" + path : path);
            m.put("default_branch", r.get("default_branch", String.class));
            out.add(m);
        }
        return out;
    }

    /**
     * Branches for the Relations Map filter, scoped by the selected projects
     * when given (branches of pipelines in those projects), else the selected
     * groups.
     */
    public List<String> graphBranches(String groupIds, String projectIds, String groupPaths,
                                      Integer hours, boolean cicd) {
        Set<Long> groups = parseGroupIds(groupIds);
        Set<Long> projects = parseIds(projectIds);
        List<String> gpaths = parseGroupPaths(groupPaths);
        if (groups.isEmpty() && gpaths.isEmpty() && projects.isEmpty()) return List.of();

        StringBuilder sql = new StringBuilder(
                "SELECT DISTINCT p.branch FROM analytics_pipelines p WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (!projects.isEmpty()) {
            sql.append(" AND p.project_id IN (").append(buildInClause(new ArrayList<>(projects))).append(")");
            params.addAll(projects);
        }
        // On the CICD map, only branches that still have a pipeline within the
        // active time range are offered (mirrors the pipeline query below).
        if (cicd && hours != null && hours > 0) {
            sql.append(" AND p.updated_at > NOW() - (? || ' hours')::interval");
            params.add(hours);
        }
        if (!gpaths.isEmpty()) {
            StringBuilder sub = new StringBuilder(
                " AND EXISTS (SELECT 1 FROM analytics_projects ap WHERE ap.gitlab_id = p.project_id");
            appendGroupPathFilter(sub, params, gpaths, "ap.namespace_path");
            sub.append(")");
            sql.append(sub);
        } else if (!groups.isEmpty()) {
            StringBuilder sub = new StringBuilder(
                " AND EXISTS (SELECT 1 FROM analytics_projects ap WHERE ap.gitlab_id = p.project_id");
            appendGroupFilter(sub, params, groups, gpaths,
                    "ap.group_id", "ap.namespace_path");
            sub.append(")");
            sql.append(sub);
        }
        sql.append(" AND p.branch IS NOT NULL AND p.branch <> '' ORDER BY p.branch");

        Result<Record> rows = dsl.fetch(sql.toString(), params.toArray());
        List<String> out = new ArrayList<>();
        for (Record r : rows) {
            String b = r.get("branch", String.class);
            if (b != null && !b.isEmpty()) out.add(b);
        }
        return out;
    }

    // ─── Private utilities ─────────────────────────────────────────────

    private List<GraphNode> queryProjects(Set<Long> groupIds, List<String> groupPaths, Set<Long> projectIds) {
        List<GraphNode> result = new ArrayList<>();
        if (groupIds.isEmpty() && groupPaths.isEmpty() && projectIds.isEmpty()) return result;

        StringBuilder sql = new StringBuilder(
                "SELECT gitlab_id, name, path, namespace_path, web_url, default_branch, "
                + "path || '/' || namespace_path AS path_with_ns "
                + "FROM analytics_projects WHERE 1=1");

        List<Object> params = new ArrayList<>();
        if (!groupPaths.isEmpty()) {
            // Strict path-subtree containment for the project list: a project
            // matches when its own namespace_path equals a selected group path
            // or is nested under it. The group_id fallback (ap.group_id) can
            // over-include projects whose sync root falls inside the expanded
            // id set but whose namespace_path isn't under the selected group,
            // which leaks sibling projects outside the chosen scope.
            appendGroupPathFilter(sql, params, groupPaths, "namespace_path");
        } else {
            appendGroupFilter(sql, params, groupIds, groupPaths,
                    "group_id", "namespace_path");
        }
        if (!projectIds.isEmpty()) {
            sql.append(" AND gitlab_id IN (").append(buildInClause(new ArrayList<>(projectIds))).append(")");
            params.addAll(projectIds);
        }

        try {
            Result<Record> rows = dsl.fetch(sql.toString(), params.toArray());
            for (Record row : rows) {
                long pid = row.get("gitlab_id", Long.class);
                GraphNode p = new GraphNode();
                p.setId("project:" + pid);
                p.setType("project");
                p.setLabel(row.get("name", String.class));
                p.setSecondaryLabel(row.get("path_with_ns", String.class));
                p.setWebUrl(row.get("web_url", String.class));
                p.setDefaultBranch(row.get("default_branch", String.class));
                p.setPathWithNs(row.get("path_with_ns", String.class));
                result.add(p);
            }
        } catch (Exception e) {
            log.warn("Project query failed", e);
        }

        return result;
    }

    private List<GraphEdge> buildUserProjectEdges(List<String> edgeKeys) {
        List<GraphEdge> result = new ArrayList<>();
        for (String key : edgeKeys) {
            String[] parts = key.split("->");
            if (parts.length != 2) continue;

            GraphEdge e = new GraphEdge();
            e.setId(key);
            e.setSource(parts[0]);
            e.setTarget(parts[1]);

            if (parts[1].startsWith("project:") && parts[0].startsWith("user:")) {
                e.setType("user-project");
            } else if (parts[0].startsWith("user:")) {
                e.setType("user-group");
            } else {
                e.setType("group-project");
            }
            result.add(e);
        }
        return result;
    }

    private String buildInClause(List<Long> ids) {
        if (ids.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < ids.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("?");
        }
        return sb.toString();
    }

    private Set<Long> parseIds(String param) {
        Set<Long> result = new HashSet<>();
        if (param == null || param.isEmpty()) return result;
        for (String part : param.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                try {
                    result.add(Long.parseLong(trimmed));
                } catch (NumberFormatException e) {
                    log.warn("Failed to parse ID: {}", trimmed, e);
                }
            }
        }
        return result;
    }

    /**
     * Parse the frontend group_ids CSV into native GitLab group ids used as
     * the analytics_*.group_id DB key. The frontend sends federated ids
     * (namespace &lt;&lt; 44 | local); decoding is idempotent for native ids and
     * it already expands a selected group to its subgroups (by full_path), so
     * subgroup data is matched by the downstream group_id filters.
     */
    private Set<Long> parseGroupIds(String param) {
        Set<Long> parsed = parseIds(param);
        Set<Long> result = new LinkedHashSet<>();
        for (long id : parsed) {
            result.add(FederatedIdUtility.decode(id)[1]);
        }
        return result;
    }

    /**
     * Parse a CSV of GitLab group full_paths (e.g. "appfluxion/agis") into a
     * trimmed, de-duplicated list. Used for subtree matching on a project's
     * {@code namespace_path}. An empty result means "no group-path bound".
     */
    private List<String> parseGroupPaths(String param) {
        if (param == null || param.isEmpty()) return List.of();
        Set<String> seen = new LinkedHashSet<>();
        for (String raw : param.split(",")) {
            String v = raw.trim();
            if (!v.isEmpty()) seen.add(v);
        }
        return new ArrayList<>(seen);
    }

    /**
     * Appends an AND-ed group-scope WHERE fragment to {@code sql}, adding its
     * bound parameters to {@code params} in placeholder order.
     *
     * <p>Two predicates are OR-ed so a selected group matches projects two ways:
     * <ol>
     *   <li>{@code <idColumn> IN (...)} — the project's stored group id (its sync
     *       root at upsert time) equals one of the selected native group ids.</li>
     *   <li>{@code <pathExpr> = p OR <pathExpr> LIKE p||'/%'} for each selected
     *       full_path {@code p} — the project's location (namespace full_path +
     *       own path) equals or is nested under the selected group, which matches
     *       project rows written under any sync root within the group's subtree.</li>
     * </ol>
     *
     * <p>{@code idColumn}/{@code pathExpr} may reference a column in scope or an
     * expression (e.g. {@code "ap.path || '/' || ap.namespace_path"}).
     * Returns when neither ids nor paths are supplied (no fragment appended).
     */
    private void appendGroupFilter(StringBuilder sql, List<Object> params,
                                   Set<Long> groupIds, List<String> groupPaths,
                                   String idColumn, String pathExpr) {
        if (groupIds.isEmpty() && groupPaths.isEmpty()) return;
        StringBuilder cond = new StringBuilder("(");
        boolean first = true;
        if (!groupIds.isEmpty()) {
            cond.append(idColumn).append(" IN (").append(buildInClause(new ArrayList<>(groupIds))).append(")");
            params.addAll(groupIds);
            first = false;
        }
        for (String p : groupPaths) {
            if (!first) cond.append(" OR ");
            cond.append(pathExpr).append(" = ?");
            params.add(p);
            cond.append(" OR ").append(pathExpr).append(" LIKE ?");
            params.add(p + "/%");
            first = false;
        }
        cond.append(")");
        sql.append(" AND ").append(cond);
    }

    /**
     * Appends a group-scope WHERE fragment that matches ONLY by the selected
     * group full_paths, on the project's own {@code pathExpr} (its
     * {@code namespace_path}). A project matches when its location equals a
     * selected path or sits anywhere under it ({@code p OR p/%}).
     *
     * <p>This is the strict "extension from group path" scoping used for the
     * Groups start point: picking a group constrains the project set to that
     * group's subtree exactly, without the {@code group_id IN (...)} fallback
     * (a project's stored {@code group_id} is its sync root, which can differ
     * from the selected subgroup and over-include sibling projects). Returns
     * without appending when no group paths are supplied.
     */
    private void appendGroupPathFilter(StringBuilder sql, List<Object> params,
                                       List<String> groupPaths, String pathExpr) {
        if (groupPaths.isEmpty()) return;
        StringBuilder cond = new StringBuilder("(");
        boolean first = true;
        for (String p : groupPaths) {
            if (!first) cond.append(" OR ");
            cond.append(pathExpr).append(" = ?");
            params.add(p);
            cond.append(" OR ").append(pathExpr).append(" LIKE ?");
            params.add(p + "/%");
            first = false;
        }
        cond.append(")");
        sql.append(" AND ").append(cond);
    }

    private GraphResponse buildEmptyResponse(String mapType) {
        GraphResponse resp = new GraphResponse();
        resp.setNodes(new ArrayList<>());
        resp.setEdges(new ArrayList<>());
        GraphMetadata meta = new GraphMetadata();
        meta.setMapType(mapType);
        meta.setNodeCount(0);
        meta.setEdgeCount(0);
        resp.setMetadata(meta);
        return resp;
    }

    /**
     * Build a comma-separated "?,?,?" placeholder list of length items.size().
     */
    private String buildInClauseStrings(List<String> items) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("?");
        }
        return sb.toString();
    }

    /**
     * Parse a CSV of enum values (e.g. statuses) into a lowercase list for
     * use with an SQL IN clause. Preserves first-seen order, drops blanks,
     * de-duplicates, and caps at a sane bound (statuses are a small closed
     * set; anything beyond that is a client bug).
     */
    private List<String> parseCsvLower(String param) {
        return parseCsv(param, true);
    }

    /**
     * Parse a CSV of values (e.g. branch names) for use with an SQL IN clause.
     * Preserves first-seen order and case, drops blanks, de-duplicates, and
     * caps at a sane bound.
     */
    private List<String> parseCsv(String param) {
        return parseCsv(param, false);
    }

    /**
     * Core CSV parser. Lowercases each value when {@code lowerCase} is true
     * (for enum fields); branch names keep their exact case. A given case
     * variant appears at most once in the output.
     */
    private List<String> parseCsv(String param, boolean lowerCase) {
        if (param == null || param.isEmpty()) return List.of();
        List<String> out = new java.util.ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (String raw : param.split(",")) {
            String v = raw.trim();
            if (lowerCase) v = v.toLowerCase(Locale.ROOT);
            if (v.isEmpty()) continue;
            String key = lowerCase ? v : v.toLowerCase(Locale.ROOT);
            if (!seen.contains(key)) {
                seen.add(key);
                if (out.size() < 32) out.add(v);
            }
        }
        return out;
    }
}
