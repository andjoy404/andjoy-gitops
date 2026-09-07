package com.gitlabops.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SessionStoreTest {

    @Test
    void parseTimeoutMs_zeroReturnsMaxLongWithoutOverflow() {
        long timeout = SessionStore.parseTimeoutMs("0", 480L, 60 * 1000L);
        assertEquals(Long.MAX_VALUE, timeout);
        assertTrue(timeout > 0, "Timeout must be strictly positive");
    }

    @Test
    void parseTimeoutMs_positiveMultipliesCorrectly() {
        long timeout = SessionStore.parseTimeoutMs("10", 480L, 60 * 1000L);
        assertEquals(600_000L, timeout);
    }

    @Test
    void parseTimeoutMs_blankUsesDefault() {
        long timeout = SessionStore.parseTimeoutMs("", 480L, 60 * 1000L);
        assertEquals(480L * 60 * 1000L, timeout);
    }

    @Test
    void createdSession_canBeRetrievedImmediately() {
        SessionStore store = new SessionStore();
        String token = store.createSession(1L, "admin", "admin", false);
        assertNotNull(token);

        SessionStore.SessionInfo session = store.getSession(token);
        assertNotNull(session, "Session must not be null immediately after creation");
        assertEquals("admin", session.username());
        assertEquals("admin", session.role());
    }
}
