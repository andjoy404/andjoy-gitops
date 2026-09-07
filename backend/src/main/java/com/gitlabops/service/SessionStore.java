package com.gitlabops.service;

import java.security.SecureRandom;
import java.util.Iterator;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class SessionStore {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    public record SessionInfo(
            Long userId, String username, String role, boolean mustChangePassword,
            long createdAt, long lastAccessedAt) {}

    private final ConcurrentHashMap<String, SessionInfo> sessions = new ConcurrentHashMap<>();

    static long parseTimeoutMs(String envVal, long defaultVal, long multiplier) {
        if (envVal == null || envVal.isBlank()) {
            return defaultVal * multiplier;
        }
        try {
            long val = Long.parseLong(envVal.trim());
            if (val <= 0) {
                return Long.MAX_VALUE;
            }
            return val * multiplier;
        } catch (NumberFormatException e) {
            return defaultVal * multiplier;
        }
    }

    public static final long IDLE_TIMEOUT_MS = parseTimeoutMs(
            System.getenv("SESSION_IDLE_TIMEOUT_MINUTES"), 480L, 60 * 1000L);

    public static final long ABSOLUTE_TIMEOUT_MS = parseTimeoutMs(
            System.getenv("SESSION_ABSOLUTE_TIMEOUT_HOURS"), 24L, 3600 * 1000L);

    public String createSession(Long userId, String username, String role, boolean mustChangePassword) {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        String token = String.format("%064x", new java.math.BigInteger(1, bytes));
        long now = System.currentTimeMillis();
        sessions.put(token, new SessionInfo(userId, username, role, mustChangePassword, now, now));
        return token;
    }

    public SessionInfo getSession(String token) {
        SessionInfo session = sessions.get(token);
        if (session == null) return null;
        long now = System.currentTimeMillis();
        boolean idleExpired = (IDLE_TIMEOUT_MS != Long.MAX_VALUE) && (now - session.lastAccessedAt() > IDLE_TIMEOUT_MS);
        boolean absoluteExpired = (ABSOLUTE_TIMEOUT_MS != Long.MAX_VALUE) && (now - session.createdAt() > ABSOLUTE_TIMEOUT_MS);
        if (idleExpired || absoluteExpired) {
            sessions.remove(token);
            return null;
        }
        return new SessionInfo(session.userId(), session.username(), session.role(),
                session.mustChangePassword(), session.createdAt(), now);
    }

    public void invalidate(String token) {
        sessions.remove(token);
    }

    @Scheduled(fixedRate = 3600_000)
    public void cleanupExpiredSessions() {
        long now = System.currentTimeMillis();
        Iterator<Map.Entry<String, SessionInfo>> it = sessions.entrySet().iterator();
        while (it.hasNext()) {
            SessionInfo s = it.next().getValue();
            boolean idleExpired = (IDLE_TIMEOUT_MS != Long.MAX_VALUE) && (now - s.lastAccessedAt() > IDLE_TIMEOUT_MS);
            boolean absoluteExpired = (ABSOLUTE_TIMEOUT_MS != Long.MAX_VALUE) && (now - s.createdAt() > ABSOLUTE_TIMEOUT_MS);
            if (idleExpired || absoluteExpired) {
                it.remove();
            }
        }
    }
}
