package com.gitlabops.service;

import de.mkammerer.argon2.Argon2;
import de.mkammerer.argon2.Argon2Factory;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final Argon2dPasswordEncoder argon2dEncoder;
    private final Argon2 argon2dVerifier;
    private final Argon2 argon2iVerifier;

    public AuthService() {
        this.argon2dEncoder = new Argon2dPasswordEncoder();
        // Direct Argon2d verifier for cross-impl compatibility with Rust hashes
        this.argon2dVerifier = Argon2Factory.create(Argon2Factory.Argon2Types.ARGON2d);
        // Argon2i verifier for any future Argon2i hashes (e.g., from Spring Security)
        this.argon2iVerifier = Argon2Factory.create(Argon2Factory.Argon2Types.ARGON2i);
    }

    public String hashPassword(String rawPassword) {
        return argon2dEncoder.encode(rawPassword);
    }

    public String hashNewPassword(String rawPassword) {
        return argon2dEncoder.encode(rawPassword);
    }

    public boolean verifyPassword(String rawPassword, String storedHash) {
        if (storedHash == null || storedHash.isEmpty()) {
            return false;
        }

        if (storedHash.startsWith("$argon2d$")) {
            try {
                return argon2dVerifier.verify(storedHash, rawPassword);
            } catch (Exception e) {
                return false;
            }
        }

        if (storedHash.startsWith("$argon2i$")) {
            try {
                return argon2iVerifier.verify(storedHash, rawPassword);
            } catch (Exception e) {
                return false;
            }
        }

        return false;
    }

    public boolean isCompatibleWithRustArgon2(String storedHash) {
        return storedHash != null && storedHash.startsWith("$argon2d$");
    }
}
