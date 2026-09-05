package com.gitlabops.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AnalyticsRunnerTotalsTest {

    private static ObjectMapper objectMapper = new ObjectMapper();

    private static String minutesAgo(int minutes) {
        return Instant.now().minusSeconds(minutes * 60L)
                .atOffset(ZoneOffset.UTC)
                .format(DateTimeFormatter.ISO_INSTANT);
    }

    private static String minutesFromNow(int minutes) {
        return Instant.now().plusSeconds(minutes * 60L)
                .atOffset(ZoneOffset.UTC)
                .format(DateTimeFormatter.ISO_INSTANT);
    }

    private Map<String, Integer> classify(String jsonArray) throws Exception {
        JsonNode nodes = objectMapper.readTree(jsonArray);
        if (!nodes.isArray()) return Map.of();

        Map<String, Integer> counts = new HashMap<>();

        for (JsonNode item : nodes) {
            JsonNode runner = item.has("runner") ? item.path("runner") : item;
            if (!runner.isObject()) continue;

            boolean paused = runner.path("paused").asBoolean(false);
            String jobStatus = runner.path("job_execution_status").asText("");
            boolean online = runner.path("online").asBoolean(false);
            String contactedAt = runner.path("contacted_at").asText("");

            String runnerStatus;
            if (paused) {
                runnerStatus = "paused";
            } else if ("running".equals(jobStatus) || "active".equals(jobStatus)) {
                runnerStatus = "running";
            } else if (online && "idle".equals(jobStatus)) {
                runnerStatus = "idle";
            } else if (online && !contactedAt.isEmpty()) {
                try {
                    var lastContacted = Instant.parse(contactedAt);
                    if (lastContacted.isBefore(Instant.now().minusSeconds(1800))) {
                        runnerStatus = "stale";
                    } else {
                        runnerStatus = "online";
                    }
                } catch (Exception e) {
                    runnerStatus = "online";
                }
            } else if (online) {
                runnerStatus = "online";
            } else {
                runnerStatus = "offline";
            }

            counts.merge(runnerStatus, 1, Integer::sum);
        }

        return counts;
    }

    @Test
    void rawRunnerElementWithRunningStatus() throws Exception {
        String json = "[" +
            "{\"id\":1,\"paused\":false,\"job_execution_status\":\"running\",\"online\":true,\"contacted_at\":\"" + minutesAgo(2) + "\"}" +
        "]";

        Map<String, Integer> counts = classify(json);

        assertEquals(1, counts.get("running"));
        assertEquals(1, counts.values().stream().mapToInt(Integer::intValue).sum(), "total must be 1");
    }

    @Test
    void legacyRunnerWrapper() throws Exception {
        String json = "[" +
            "{\"runner\":{" +
            "\"id\":2,\"paused\":false,\"job_execution_status\":\"running\",\"online\":true,\"contacted_at\":\"" + minutesAgo(1) + "\"" +
            "}}" +
        "]";

        Map<String, Integer> counts = classify(json);

        assertEquals(1, counts.get("running"));
        assertEquals(1, counts.values().stream().mapToInt(Integer::intValue).sum(), "total must be 1");
    }

    @Test
    void pausedRunner() throws Exception {
        String json = "[" +
            "{\"id\":3,\"paused\":true,\"job_execution_status\":\"running\",\"online\":false}" +
        "]";

        Map<String, Integer> counts = classify(json);

        assertEquals(1, counts.get("paused"));
        assertFalse(counts.containsKey("running"), "paused must take precedence over running");
    }

    @Test
    void idleRunner() throws Exception {
        String json = "[" +
            "{\"id\":4,\"paused\":false,\"job_execution_status\":\"idle\",\"online\":true,\"contacted_at\":\"" + minutesAgo(1) + "\"}" +
        "]";

        Map<String, Integer> counts = classify(json);

        assertEquals(1, counts.get("idle"));
        assertEquals(1, counts.values().stream().mapToInt(Integer::intValue).sum(), "total must be 1");
    }

    @Test
    void staleRunner() throws Exception {
        String json = "[" +
            "{\"id\":5,\"paused\":false,\"job_execution_status\":\"\",\"online\":true,\"contacted_at\":\"" + minutesAgo(45) + "\"}" +
        "]";

        Map<String, Integer> counts = classify(json);

        assertEquals(1, counts.get("stale"));
        assertEquals(1, counts.values().stream().mapToInt(Integer::intValue).sum(), "total must be 1");
    }

    @Test
    void onlineRunnerWithRecentContact() throws Exception {
        String json = "[" +
            "{\"id\":6,\"paused\":false,\"job_execution_status\":\"\",\"online\":true,\"contacted_at\":\"" + minutesAgo(5) + "\"}" +
        "]";

        Map<String, Integer> counts = classify(json);

        assertEquals(1, counts.get("online"));
        assertEquals(1, counts.values().stream().mapToInt(Integer::intValue).sum(), "total must be 1");
    }

    @Test
    void onlineRunnerWithNoContactedAt() throws Exception {
        String json = "[" +
            "{\"id\":7,\"paused\":false,\"job_execution_status\":\"\",\"online\":true,\"contacted_at\":\"\"}" +
        "]";

        Map<String, Integer> counts = classify(json);

        assertEquals(1, counts.get("online"));
        assertEquals(1, counts.values().stream().mapToInt(Integer::intValue).sum(), "total must be 1");
    }

    @Test
    void offlineRunner() throws Exception {
        String json = "[" +
            "{\"id\":8,\"paused\":false,\"job_execution_status\":\"\",\"online\":false}" +
        "]";

        Map<String, Integer> counts = classify(json);

        assertEquals(1, counts.get("offline"));
        assertEquals(1, counts.values().stream().mapToInt(Integer::intValue).sum(), "total must be 1");
    }

    @Test
    void mixedArrayWithLegacyAndRawElements() throws Exception {
        String recentContact = minutesAgo(1);
        String json = "[" +
            "{\"runner\":{\"id\":1,\"paused\":false,\"job_execution_status\":\"running\",\"online\":true,\"contacted_at\":\"" + recentContact + "\"}}," +
            "{\"id\":2,\"paused\":false,\"job_execution_status\":\"idle\",\"online\":true,\"contacted_at\":\"" + recentContact + "\"}," +
            "{\"id\":3,\"paused\":true,\"job_execution_status\":\"running\",\"online\":false}," +
            "{\"id\":4,\"paused\":false,\"job_execution_status\":\"\",\"online\":true,\"contacted_at\":\"" + minutesAgo(50) + "\"}," +
            "{\"id\":5,\"paused\":false,\"job_execution_status\":\"\",\"online\":true,\"contacted_at\":\"" + recentContact + "\"}," +
            "{\"id\":6,\"paused\":false,\"job_execution_status\":\"\",\"online\":false}" +
        "]";

        Map<String, Integer> counts = classify(json);

        assertEquals(1, counts.get("running"), "legacy wrapped running");
        assertEquals(1, counts.get("idle"), "raw idle");
        assertEquals(1, counts.get("paused"), "raw paused");
        assertEquals(1, counts.get("stale"), "raw stale");
        assertEquals(1, counts.get("online"), "raw online");
        assertEquals(1, counts.get("offline"), "raw offline");
        int total = counts.values().stream().mapToInt(Integer::intValue).sum();
        assertEquals(6, total, "all 6 runners must be classified");
    }

    @Test
    void emptyArray() throws Exception {
        Map<String, Integer> counts = classify("[]");
        assertTrue(counts.isEmpty());
    }

    @Test
    void invalidItemsSkipped() throws Exception {
        String json = "[" +
            "\"not a runner\"," +
            "123," +
            "{\"id\":10,\"paused\":false,\"job_execution_status\":\"\",\"online\":true,\"contacted_at\":\"" + minutesAgo(1) + "\"}" +
        "]";

        Map<String, Integer> counts = classify(json);

        assertEquals(1, counts.values().stream().mapToInt(Integer::intValue).sum(), "only 1 valid runner");
        assertEquals(1, counts.get("online"));
    }

    @Test
    void activeJobExecutionStatusTreatedAsRunning() throws Exception {
        String json = "[" +
            "{\"id\":11,\"paused\":false,\"job_execution_status\":\"active\",\"online\":true}" +
        "]";

        Map<String, Integer> counts = classify(json);

        assertEquals(1, counts.get("running"));
        assertFalse(counts.containsKey("idle"));
    }

    @Test
    void pausedOverridesIdle() throws Exception {
        String json = "[" +
            "{\"id\":12,\"paused\":true,\"job_execution_status\":\"idle\",\"online\":true}" +
        "]";

        Map<String, Integer> counts = classify(json);

        assertEquals(1, counts.get("paused"));
        assertFalse(counts.containsKey("idle"));
    }

    @Test
    void pausedOverridesStale() throws Exception {
        String json = "[" +
            "{\"id\":13,\"paused\":true,\"job_execution_status\":\"\",\"online\":true,\"contacted_at\":\"" + minutesAgo(60) + "\"}" +
        "]";

        Map<String, Integer> counts = classify(json);

        assertEquals(1, counts.get("paused"));
        assertFalse(counts.containsKey("stale"));
    }
}
