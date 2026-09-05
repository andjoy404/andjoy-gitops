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

    private static final long IDLE_TIMEOUT_MS = Optional
            .ofNullable(System.getenv("SESSION_IDLE_TIMEOUT_MINUTES"))
            .map(Long::valueOf)
            .orElse(480L) * 60 * 1000L;

    private static final long ABSOLUTE_TIMEOUT_MS = Optional
            .ofNullable(System.getenv("SESSION_ABSOLUTE_TIMEOUT_HOURS"))
            .map(Long::valueOf)
            .orElse(24L) * 3600 * 1000L;

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
        if (now - session.lastAccessedAt() > IDLE_TIMEOUT_MS
                || now - session.createdAt() > ABSOLUTE_TIMEOUT_MS) {
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
            if (now - s.lastAccessedAt() > IDLE_TIMEOUT_MS
                    || now - s.createdAt() > ABSOLUTE_TIMEOUT_MS) {
                it.remove();
            }
        }
    }
}
