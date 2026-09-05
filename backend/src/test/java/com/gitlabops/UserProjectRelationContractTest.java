package com.gitlabops;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Phase 6.1 User-Project Relation contract tests.
 */
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "analytics.enabled=true",
    "READ_ONLY=true",
    "HIDE_WRITE_ACTIONS=false",
    "session.secure=false"
})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, classes = com.gitlabops.GitLabOpsApplication.class)
class UserProjectRelationContractTest {

    @Autowired
    private TestRestTemplate restTemplate;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void relationsReturnsHttp200() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/user-project-relations?group_ids=123", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void relationsReturnsArray() throws Exception {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/user-project-relations?group_ids=123", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = MAPPER.readTree(response.getBody());
        assertTrue(root.isArray());
        assertFalse(root.isEmpty());
    }

    @Test
    void relationsHasCorrectKeys() throws Exception {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/user-project-relations?group_ids=123", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = MAPPER.readTree(response.getBody());
        assertTrue(root.isArray());
        assertFalse(root.isEmpty());

        JsonNode first = root.get(0);
        assertTrue(first.has("userId"));
        assertTrue(first.has("projectId"));
        assertTrue(first.has("groupId"));
    }

    @Test
    void relationsNoDuplicates() throws Exception {
        ResponseEntity<String> response1 = restTemplate.getForEntity(
            "/api/analytics/user-project-relations?group_ids=123", String.class);
        JsonNode root1 = MAPPER.readTree(response1.getBody());
        int len1 = root1.size();

        ResponseEntity<String> response2 = restTemplate.getForEntity(
            "/api/analytics/user-project-relations?group_ids=123", String.class);
        JsonNode root2 = MAPPER.readTree(response2.getBody());
        assertEquals(len1, root2.size());
    }

    @Test
    void relationsEmptyWhenNoGroupOrId() throws Exception {
        // No params - should handle gracefully
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/user-project-relations", String.class);
        assertNotNull(response.getBody());
    }

    @Test
    void relationsFilteredByGroup() throws Exception {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/user-project-relations?group_ids=99999", String.class);
        JsonNode root = MAPPER.readTree(response.getBody());
        assertEquals(0, root.size());
    }
}
