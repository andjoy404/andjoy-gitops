package com.gitlabops;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class GitLabOpsApplicationNameTest {

    @Test
    void applicationClassExists() {
        assertNotNull(GitLabOpsApplication.class);
        assertTrue(GitLabOpsApplication.class.isAnnotationPresent(org.springframework.boot.autoconfigure.SpringBootApplication.class));
    }

    @Test
    void gitlabOpsApplicationHasCorrectPackageName() {
        assertEquals("com.gitlabops", GitLabOpsApplication.class.getPackage().getName());
    }
}
