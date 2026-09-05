package com.gitlabops.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@ActiveProfiles("test")
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class EnvironmentRepositoryIntegrationTest {

    @Autowired
    private EnvironmentRepository repository;

    @Test
    void createAndUpdatePersistPostgresBigintArray() {
        long id = repository.create(
                "Array Binding Test",
                "https://array-binding-test.example.com",
                new byte[] { 1, 2, 3 },
                List.of(2L, 42L),
                true,
                false,
                true);

        var created = repository.findById(id).orElseThrow();
        assertEquals(List.of(2L, 42L), created.getGroupIds());

        repository.updateWithoutToken(
                id,
                "Array Binding Test",
                "https://array-binding-test.example.com",
                List.of(7L, 99L),
                true,
                true,
                false);

        var updated = repository.findById(id).orElseThrow();
        assertEquals(List.of(7L, 99L), updated.getGroupIds());
        assertTrue(updated.isTokenConfigured());
    }
}
