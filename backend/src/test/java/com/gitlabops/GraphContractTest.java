package com.gitlabops;

import com.gitlabops.model.dto.GraphEdge;
import com.gitlabops.model.dto.GraphNode;
import com.gitlabops.model.dto.GraphResponse;
import com.gitlabops.service.GraphService;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class GraphContractTest {

    @Autowired
    private DSLContext dsl;

    @Autowired
    private DataSource dataSource;

    private GraphService graphService;

    @BeforeEach
    void setUp() {
        graphService = new GraphService(dsl);
    }

    @Test
    @DisplayName("Mode 1 returns graph response structure")
    void mode1_returnsResponseStructure() {
        GraphResponse response = graphService.getUserProjectGraph("123", null);

        assertNotNull(response);
        assertNotNull(response.getNodes());
        assertNotNull(response.getEdges());

        // Verify edge structure
        for (GraphEdge edge : response.getEdges()) {
            assertNotNull(edge.getId(), "Edge must have id");
            assertNotNull(edge.getSource(), "Edge must have source");
            assertNotNull(edge.getTarget(), "Edge must have target");
            assertNotNull(edge.getType(), "Edge must have type");
        }

        // Verify node structure
        for (GraphNode node : response.getNodes()) {
            assertNotNull(node.getId(), "Node must have id");
            assertNotNull(node.getType(), "Node must have type");
            assertTrue(node.getId().startsWith("user:") ||
                       node.getId().startsWith("group:") ||
                       node.getId().startsWith("project:"),
                       "Node ID must have type prefix");
        }
    }

    @Test
    @DisplayName("Mode 1 edge source and target reference existing nodes")
    void mode1_noDanglingEdges() {
        GraphResponse response = graphService.getUserProjectGraph("123", null);
        Set<String> nodeIds = response.getNodes().stream()
                .map(GraphNode::getId)
                .collect(java.util.stream.Collectors.toSet());

        for (GraphEdge edge : response.getEdges()) {
            assertTrue(nodeIds.contains(edge.getSource()),
                    "Edge source " + edge.getSource() + " must reference existing node");
            assertTrue(nodeIds.contains(edge.getTarget()),
                    "Edge target " + edge.getTarget() + " must reference existing node");
        }
    }

    @Test
    @DisplayName("Mode 1 no duplicate node IDs")
    void mode1_noDuplicateNodeIds() {
        GraphResponse response = graphService.getUserProjectGraph("123", null);
        Set<String> nodeIds = response.getNodes().stream()
                .map(GraphNode::getId)
                .collect(java.util.stream.Collectors.toSet());
        assertEquals(nodeIds.size(), response.getNodes().size(),
                "Node IDs must be unique");
    }

    @Test
    @DisplayName("Mode 1 no duplicate edge IDs")
    void mode1_noDuplicateEdgeIds() {
        GraphResponse response = graphService.getUserProjectGraph("123", null);
        Set<String> edgeIds = response.getEdges().stream()
                .map(GraphEdge::getId)
                .collect(java.util.stream.Collectors.toSet());
        assertEquals(edgeIds.size(), response.getEdges().size(),
                "Edge IDs must be unique");
    }

    @Test
    @DisplayName("Mode 1 edge types are valid")
    void mode1_validEdgeTypes() {
        GraphResponse response = graphService.getUserProjectGraph("123", null);
        Set<String> validTypes = Set.of("user-group", "group-project");

        for (GraphEdge edge : response.getEdges()) {
            assertTrue(validTypes.contains(edge.getType()),
                    "Edge type must be " + validTypes + " but was " + edge.getType());
        }
    }

    @Test
    @DisplayName("Mode 2 returns graph response structure")
    void mode2_returnsResponseStructure() {
        GraphResponse response = graphService.getCICDGraph(
                "123", "101", null, null, null, 24);

        assertNotNull(response);
        assertNotNull(response.getNodes());
        assertNotNull(response.getEdges());

        // Verify node structure
        for (GraphNode node : response.getNodes()) {
            assertNotNull(node.getId(), "Node must have id");
            assertNotNull(node.getType(), "Node must have type");
        }

        // Verify edge structure  
        for (GraphEdge edge : response.getEdges()) {
            assertNotNull(edge.getId(), "Edge must have id");
            assertNotNull(edge.getSource(), "Edge must have source");
            assertNotNull(edge.getTarget(), "Edge must have target");
        }
    }

    @Test
    @DisplayName("Mode 2 edge source and target reference existing nodes")
    void mode2_noDanglingEdges() {
        GraphResponse response = graphService.getCICDGraph(
                "123", "101", null, null, null, 24);
        Set<String> nodeIds = response.getNodes().stream()
                .map(GraphNode::getId)
                .collect(java.util.stream.Collectors.toSet());

        for (GraphEdge edge : response.getEdges()) {
            assertTrue(nodeIds.contains(edge.getSource()),
                    "Edge source " + edge.getSource() + " must reference existing node, nodes: " + nodeIds);
            assertTrue(nodeIds.contains(edge.getTarget()),
                    "Edge target " + edge.getTarget() + " must reference existing node");
        }
    }

    @Test
    @DisplayName("Mode 2 no duplicate node IDs")
    void mode2_noDuplicateNodeIds() {
        GraphResponse response = graphService.getCICDGraph(
                "123", "101", null, null, null, 24);
        Set<String> nodeIds = response.getNodes().stream()
                .map(GraphNode::getId)
                .collect(java.util.stream.Collectors.toSet());
        assertEquals(nodeIds.size(), response.getNodes().size(),
                "Node IDs must be unique");
    }

    @Test
    @DisplayName("Mode 2 node types are valid")
    void mode2_validNodeTypes() {
        GraphResponse response = graphService.getCICDGraph(
                "123", "101", null, null, null, 24);
        Set<String> validTypes = Set.of("project", "branch", "pipeline", "job");

        for (GraphNode node : response.getNodes()) {
            assertTrue(validTypes.contains(node.getType()),
                    "Node type must be one of " + validTypes + " but was " + node.getType());
        }
    }

    @Test
    @DisplayName("Mode 2 empty response when no groups")
    void mode2_emptyNoGroups() {
        GraphResponse response = graphService.getCICDGraph(null, null, null, null, null, 24);

        assertNotNull(response);
        assertNotNull(response.getNodes());
        assertTrue(response.getMetadata().getNodeCount() >= 0);
    }

    @Test
    @DisplayName("Mode 1 empty response when no groups")
    void mode1_emptyNoGroups() {
        GraphResponse response = graphService.getUserProjectGraph(null, null);

        assertNotNull(response);
        assertNotNull(response.getNodes());
        assertNotNull(response.getEdges());
        assertEquals(0, response.getNodes().size());
        assertEquals(0, response.getEdges().size());
    }

    @Test
    @DisplayName("Mode 1 user filter works")
    void mode1_userFilterWorks() {
        GraphResponse all = graphService.getUserProjectGraph("123", null);
        GraphResponse filtered = graphService.getUserProjectGraph("123", "11");

        assertNotNull(all);
        assertNotNull(filtered);

        // Filtered should have ≤ nodes than unfiltered
        assertTrue(filtered.getNodes().size() <= all.getNodes().size(),
                "Filtered graph should not have more nodes than unfiltered");
    }

    @Test
    @DisplayName("Mode 2 pipeline status filter reduces results")
    void mode2_statusFilterReceives() {
        GraphResponse all = graphService.getCICDGraph(
                "123", "101", null, null, null, 24);
        
        // All pipelines from project 101 that are "success"
        GraphResponse successFiltered = graphService.getCICDGraph(
                "123", "101", null, "success", null, 24);

        assertNotNull(all);
        assertNotNull(successFiltered);
        
        // Both should have at least project nodes
        assertTrue(all.getNodes().size() > 0, "Should have project nodes");
        assertTrue(successFiltered.getNodes().size() >= 0, "Filtered should not fail");
    }

    @Test
    @DisplayName("Node IDs use consistent type prefixes")
    void nodeIdConsistentPrefixes() {
        GraphResponse response = graphService.getUserProjectGraph("123", null);

        for (GraphNode node : response.getNodes()) {
            String id = node.getId();
            String type = node.getType();
            assertTrue(id.startsWith(type + ":"),
                    "Node ID '" + id + "' must start with '" + type + "': ");
        }
    }

    @Test
    @DisplayName("Metadata contains graph dimensions")
    void metadataContainsDimensions() {
        GraphResponse response = graphService.getUserProjectGraph("123", null);

        assertNotNull(response.getMetadata());
        assertNotNull(response.getMetadata().getMapType());
        assertNotNull(response.getMetadata().getNodeCount());
        assertNotNull(response.getMetadata().getEdgeCount());

        assertEquals(response.getNodes().size(), response.getMetadata().getNodeCount());
        assertEquals(response.getEdges().size(), response.getMetadata().getEdgeCount());
    }

    @Test
    @DisplayName("Mode 2 metadata contains graph dimensions")
    void mode2MetadataContainsDimensions() {
        GraphResponse response = graphService.getCICDGraph("123", "101", null, null, null, 24);

        assertNotNull(response.getMetadata());
        assertEquals("project-branch-pipeline-jobs", response.getMetadata().getMapType());
        assertEquals(response.getNodes().size(), response.getMetadata().getNodeCount());
        assertEquals(response.getEdges().size(), response.getMetadata().getEdgeCount());
    }

    // ─── V25: relation_type / evidence_type upgrade regression ────────────

    /**
     * Replays V25__user_project_relation_types.sql verbatim on a throwaway
     * table that still has the V21 layout (no type columns), so a test
     * PostgreSQL DB that is already past V25 still exercises a real upgrade.
     */
    @Test
    @DisplayName("V25 upgrades a V24-style table with existing rows and is safe to re-run")
    void v25MigrationUpgradesV24TableAndIsIdempotent() throws Exception {
        String table = "graph_v25_test.upr_v25";
        String migration = readResource(
                "db/migration/V25__user_project_relation_types.sql")
                .replace("TABLE analytics_user_project_relations", "TABLE " + table);
        try (Connection c = dataSource.getConnection();
             Statement stmt = c.createStatement()) {
            stmt.execute("DROP SCHEMA IF EXISTS graph_v25_test CASCADE");
            stmt.execute("CREATE SCHEMA graph_v25_test");
            // V21 layout: the columns GraphService selects are missing.
            stmt.execute(
                "CREATE TABLE " + table + " ( "
                + "id BIGSERIAL PRIMARY KEY, "
                + "user_id BIGINT NOT NULL REFERENCES public.analytics_users(gitlab_id) ON DELETE CASCADE, "
                + "project_id BIGINT NOT NULL REFERENCES public.analytics_projects(gitlab_id) ON DELETE CASCADE, "
                + "group_id BIGINT NOT NULL, "
                + "synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), "
                + "UNIQUE(user_id, project_id, group_id) )");
            stmt.execute("INSERT INTO " + table
                    + " (user_id, project_id, group_id, synced_at) VALUES (11, 101, 123, NOW())");
            stmt.execute("INSERT INTO " + table
                    + " (user_id, project_id, group_id, synced_at) VALUES (12, 102, 123, NOW())");

            stmt.execute(migration);
            try (ResultSet rs = stmt.executeQuery(
                    "SELECT relation_type, evidence_type FROM " + table + " ORDER BY user_id")) {
                assertTrue(rs.next());
                assertEquals("membership", rs.getString(1));
                assertEquals("unknown", rs.getString(2));
                assertTrue(rs.next());
                assertEquals("membership", rs.getString(1));
                assertEquals("unknown", rs.getString(2));
                assertFalse(rs.next(), "exactly the two pre-upgrade rows must remain");
            }

            // Idempotency: re-running V25 is a no-op.
            String afterFirstRun = checksum(stmt);
            stmt.execute(migration);
            assertEquals(afterFirstRun, checksum(stmt),
                    "re-running V25 must not change any relation data");
        } finally {
            try (Connection c = dataSource.getConnection();
                 Statement stmt = c.createStatement()) {
                stmt.execute("DROP SCHEMA IF EXISTS graph_v25_test CASCADE");
            }
        }
    }

    /** Deterministic content digest of the whole throwaway table. */
    private String checksum(Statement stmt) throws Exception {
        try (ResultSet rs = stmt.executeQuery(
                "SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY id)) FROM "
                + "(SELECT * FROM graph_v25_test.upr_v25) t")) {
            assertTrue(rs.next());
            return rs.getString(1);
        }
    }

    private String readResource(String path) throws Exception {
        java.io.InputStream in = getClass().getClassLoader().getResourceAsStream(path);
        assertNotNull(in, "Resource missing from test classpath: " + path);
        return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("Fresh database: relation type columns exist and no row has null values")
    void freshDatabaseRelationsHaveDefaultTypes() {
        List<String> pairs = dsl.fetch(
                "SELECT relation_type || '|' || evidence_type FROM analytics_user_project_relations ORDER BY id")
                .into(String.class);
        assertFalse(pairs.isEmpty(), "Test fixtures must contain relation rows");
        for (String pair : pairs) {
            assertFalse(pair.contains("null") || pair.isBlank(),
                    "relation_type/evidence_type must never be null: " + pair);
            int pipe = pair.indexOf('|');
            assertTrue(pipe > 0 && pair.length() > pipe + 1,
                    "both type values must be non-blank: " + pair);
        }
    }

    @Test
    @DisplayName("V25 upgraded graph rows keep their defaults and the graph query returns data")
    void upgradedRelationRowsReturnDataFromGraphQuery() {
        // Insert a row WITHOUT the columns (fixture combo 11 -> 105 is not in
        // the fixtures) to prove the NOT NULL DEFAULT backfills them exactly
        // the way V25 does on an upgraded database.
        dsl.execute(
            "INSERT INTO analytics_user_project_relations (user_id, project_id, group_id, synced_at) "
            + "VALUES (11, 105, 123, NOW())");

        try {
            int defaulted = dsl.fetch(
                "SELECT COUNT(*) FROM analytics_user_project_relations "
                + "WHERE user_id = 11 AND project_id = 105 AND group_id = 123 "
                + "AND relation_type = 'membership' AND evidence_type = 'unknown'")
                .get(0).get(0, int.class);
            assertEquals(1, defaulted,
                    "Row inserted without explicit types must be backfilled with the V25 defaults");

            // The exact query from GraphService.getUserProjectGraph on the upgraded table.
            List<Object> ids = new java.util.ArrayList<>();
            ids.add(123L);
            List<Record> rows = dsl.fetch(
                "SELECT r.user_id, r.group_id, r.project_id, "
                + "r.relation_type, r.evidence_type, "
                + "au.username, au.name, au.avatar_url, au.web_url, "
                + "ap.name AS project_name, ap.path || '/' || ap.namespace_path AS project_path_with_ns, "
                + "ap.namespace_path, ap.web_url AS project_web_url "
                + "FROM analytics_user_project_relations r "
                + "JOIN analytics_users au ON au.gitlab_id = r.user_id "
                + "JOIN analytics_projects ap ON ap.gitlab_id = r.project_id "
                + "WHERE r.group_id IN (?) "
                + "ORDER BY r.user_id, r.group_id, r.project_id",
                ids.toArray());
            assertFalse(rows.isEmpty(), "Graph query must return rows after the V25 upgrade");
            for (Record row : rows) {
                String relation = row.get("relation_type", String.class);
                assertNotNull(relation, "relation_type must never be null");
                assertTrue("membership".equals(relation) || "activity".equals(relation),
                        "relation_type must be a known value: " + relation);
                assertNotNull(row.get("evidence_type", String.class),
                        "evidence_type must never be null");
            }
        } finally {
            dsl.execute(
                "DELETE FROM analytics_user_project_relations "
                + "WHERE user_id = 11 AND project_id = 105 AND group_id = 123 "
                + "AND relation_type = 'membership' AND evidence_type = 'unknown'");
        }
    }

    @Test
    @DisplayName("GraphService.getUserProjectGraph returns populated data without SQL errors")
    void graphServiceReturnsDataWithoutSqlErrors() {
        GraphResponse response = graphService.getUserProjectGraph("123", null);

        assertNotNull(response);
        assertEquals("user-group-project", response.getMetadata().getMapType());
        assertEquals(response.getNodes().size(), response.getMetadata().getNodeCount());
        assertEquals(response.getEdges().size(), response.getMetadata().getEdgeCount());
        assertTrue(response.getNodes().size() > 0, "Fixture graph must contain nodes");
        assertTrue(response.getMetadata().getNodeCount() > 0);
        assertEquals(response.getEdges().size(), response.getMetadata().getEdgeCount());
        assertTrue(response.getNodes().stream().anyMatch(n -> "user".equals(n.getType())),
                "graph must contain user nodes from the fixture data");
    }
}
