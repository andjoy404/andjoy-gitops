package com.gitlabops;

import com.gitlabops.model.dto.GraphResponse;
import com.gitlabops.service.GraphService;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression tests for V25__user_project_relation_types.sql.
 *
 * The upgrade simulation runs in an isolated schema (v25_upgrade_test) so the
 * shared test fixtures stay untouched. GraphService coverage for healthy data
 * lives in GraphContractTest.
 */
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "analytics.enabled=true",
    "READ_ONLY=true",
    "HIDE_WRITE_ACTIONS=false",
    "session.secure=false"
})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, classes = com.gitlabops.GitLabOpsApplication.class)
class PostgresFlywayV25MigrationTest {

    private static final String SCHEMA = "v25_upgrade_test";

    @Autowired
    private DataSource dataSource;

    @Autowired
    private DSLContext dsl;

    private GraphService graphService;

    @BeforeEach
    void setUp() throws Exception {
        graphService = new GraphService(dsl);
        execute("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
        execute("CREATE SCHEMA " + SCHEMA);
    }

    @AfterEach
    void tearDown() throws Exception {
        execute("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
    }

    @Test
    @DisplayName("Fresh database (test fixture init): relation table already has the V25 columns with defaults")
    void freshDatabaseHasRelationTypeColumns() throws Exception {
        try (Connection c = dataSource.getConnection();
             ResultSet rs = c.createStatement().executeQuery(
                    "SELECT column_name, is_nullable, column_default FROM information_schema.columns "
                    + "WHERE table_schema = 'public' AND table_name = 'analytics_user_project_relations' "
                    + "AND column_name IN ('relation_type', 'evidence_type') ORDER BY column_name")) {
            List<String> found = new ArrayList<>();
            while (rs.next()) {
                String name = rs.getString(1);
                found.add(name);
                assertEquals("NO", rs.getString(2), name + " must be NOT NULL");
                assertNotNull(rs.getString(3));
                assertFalse(rs.getString(3).isBlank(), name + " must have a default");
            }
            assertTrue(found.contains("relation_type"), "relation_type column must exist");
            assertTrue(found.contains("evidence_type"), "evidence_type column must exist");
        }
    }

    @Test
    @DisplayName("Upgrading a V24 database with existing relation rows adds backfilled columns")
    void v24DatabaseUpgradesWithExistingRowsBackfilled() throws Exception {
        String table = SCHEMA + ".analytics_user_project_relations";
        try (Connection c = dataSource.getConnection()) {
            // 1. Rebuild the table exactly as V21 left it (before V25): no type columns.
            Statement stmt = c.createStatement();
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

            // 2. Run V25 exactly as Flyway would (statements qualified to this schema).
            for (String sql : migrationStatements()) {
                stmt.execute(sql.replace(
                        "TABLE analytics_user_project_relations", "TABLE " + table));
            }

            // 3. Existing rows survive the upgrade and carry the new column defaults.
            ResultSet rs = stmt.executeQuery(
                    "SELECT user_id, relation_type, evidence_type FROM " + table + " ORDER BY user_id");
            assertTrue(rs.next());
            assertEquals(11L, rs.getLong(1));
            assertEquals("membership", rs.getString(2));
            assertEquals("unknown", rs.getString(3));
            assertTrue(rs.next());
            assertEquals(12L, rs.getLong(1));
            assertEquals("membership", rs.getString(2));
            assertEquals("unknown", rs.getString(3));
            assertFalse(rs.next(), "exactly the two pre-upgrade rows must remain");

            // 4. Idempotency: a second V25 run is a no-op and keeps the data intact.
            for (String sql : migrationStatements()) {
                stmt.execute(sql.replace(
                        "TABLE analytics_user_project_relations", "TABLE " + table));
            }
            ResultSet count = stmt.executeQuery("SELECT count(*) FROM " + table);
            assertTrue(count.next());
            assertEquals(2, count.getInt(1), "re-running V25 must not duplicate or drop rows");
        }

        // 5. Column metadata: NOT NULL with the documented defaults.
        try (ResultSet rs = dataSource.getConnection().createStatement().executeQuery(
                "SELECT is_nullable, column_default FROM information_schema.columns "
                + "WHERE table_schema = '" + SCHEMA + "' "
                + "AND table_name = 'analytics_user_project_relations' AND column_name = 'relation_type'")) {
            assertTrue(rs.next());
            assertEquals("NO", rs.getString(1));
            assertTrue(rs.getString(2).contains("membership"),
                    "default must be 'membership' but was: " + rs.getString(2));
        }
    }

    @Test
    @DisplayName("GraphService query shape works against a V25-upgraded table with data")
    void upgradedTableServesGraphQuery() throws Exception {
        String table = SCHEMA + ".analytics_user_project_relations";
        try (Connection c = dataSource.getConnection(); Statement stmt = c.createStatement()) {
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
            for (String sql : migrationStatements()) {
                stmt.execute(sql.replace(
                        "TABLE analytics_user_project_relations", "TABLE " + table));
            }
        }

        // The exact projection GraphService.getUserProjectGraph uses, run against
        // the upgraded table (its unqualified version runs in the public schema).
        String sql = "SELECT r.user_id, r.group_id, r.project_id, "
                + "r.relation_type, r.evidence_type, "
                + "au.username, au.name, au.avatar_url, au.web_url, "
                + "ap.name AS project_name, ap.path || '/' || ap.namespace_path AS project_path_with_ns, "
                + "ap.namespace_path, ap.web_url AS project_web_url "
                + "FROM " + table + " r "
                + "JOIN public.analytics_users au ON au.gitlab_id = r.user_id "
                + "JOIN public.analytics_projects ap ON ap.gitlab_id = r.project_id "
                + "WHERE r.group_id IN (?) "
                + "ORDER BY r.user_id, r.group_id, r.project_id";
        List<Record> rows = dsl.fetch(sql, 123L);

        assertEquals(1, rows.size(), "upgraded row must be visible to the graph query");
        assertEquals("membership", rows.get(0).get("relation_type", String.class));
        assertEquals("unknown", rows.get(0).get("evidence_type", String.class));

        // And the unqualified (public) graph endpoint path still returns data.
        GraphResponse response = graphService.getUserProjectGraph("123", null);
        assertNotNull(response);
        assertTrue(response.getNodes().stream().anyMatch(n -> "user".equals(n.getType())),
                "graph must contain user nodes from the fixture data");
    }

    /** Splits V25 into the individual statements Flyway executes, ignoring SQL comments. */
    private List<String> migrationStatements() throws Exception {
        String sql;
        try (var in = getClass().getClassLoader().getResourceAsStream(
                "db/migration/V25__user_project_relation_types.sql")) {
            assertNotNull(in, "V25 migration must be on the test classpath");
            sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        StringBuilder noComments = new StringBuilder();
        for (String line : sql.split("\n")) {
            int comment = line.indexOf("--");
            if (comment >= 0) {
                line = line.substring(0, comment);
            }
            noComments.append(line).append('\n');
        }
        List<String> statements = new ArrayList<>();
        for (String segment : noComments.toString().split(";")) {
            String trimmed = segment.trim();
            if (!trimmed.isEmpty()) {
                statements.add(trimmed);
            }
        }
        assertFalse(statements.isEmpty(), "V25 must contain at least one statement");
        return statements;
    }

    private void execute(String sql) throws Exception {
        try (Connection c = dataSource.getConnection();
             Statement stmt = c.createStatement()) {
            stmt.execute(sql);
        }
    }
}
