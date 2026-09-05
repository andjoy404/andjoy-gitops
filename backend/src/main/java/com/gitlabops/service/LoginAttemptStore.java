package com.gitlabops.service;

import java.security.SecureRandom;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class LoginAttemptStore {

    public record LoginAttempt(String username, long timestamp, int attempts) {
        LoginAttempt withIncrement() {
            return new LoginAttempt(username, timestamp, attempts() + 1);
        }
    }

    private static final int MAX_ATTEMPTS = 5;
    private static final long WINDOW_MS = 60_000L;

    private final ConcurrentHashMap<String, LoginAttempt> attempts = new ConcurrentHashMap<>();

    public boolean isThrottled(String username) {
        LoginAttempt attempt = attempts.get(username);
        if (attempt == null)
            return false;
        long now = System.currentTimeMillis();
        if (now - attempt.timestamp() > WINDOW_MS) {
            attempts.remove(username);
            return false;
        }
        return attempt.attempts() >= MAX_ATTEMPTS;
    }

    public void recordAttempt(String username, boolean success) {
        long now = System.currentTimeMillis();
        LoginAttempt existing = attempts.get(username);
        if (existing != null && now - existing.timestamp() > WINDOW_MS) {
            attempts.remove(username);
        }
        if (success) {
            attempts.remove(username);
        } else {
            if (existing != null) {
                attempts.put(username, existing.withIncrement());
            } else {
                attempts.put(username, new LoginAttempt(username, now, 1));
            }
        }
    }

    @Scheduled(fixedRate = 300_000)
    public void cleanupExpiredAttempts() {
        long now = System.currentTimeMillis();
        Iterator<Map.Entry<String, LoginAttempt>> it = attempts.entrySet().iterator();
        while (it.hasNext()) {
            if (now - it.next().getValue().timestamp() > WINDOW_MS) {
                it.remove();
            }
        }
    }
}