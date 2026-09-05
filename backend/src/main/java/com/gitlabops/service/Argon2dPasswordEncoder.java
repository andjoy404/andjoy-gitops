package com.gitlabops.service;

import de.mkammerer.argon2.Argon2;
import de.mkammerer.argon2.Argon2Factory;

import java.nio.charset.StandardCharsets;

public class Argon2dPasswordEncoder {

    private static final int MEMORY_KIB = 65536;
    private static final int TIME_COST = 3;
    private static final int PARALLELISM = 1;

    private final Argon2 argon2 = Argon2Factory.create(Argon2Factory.Argon2Types.ARGON2d, 32, 16);

    public String encode(String rawPassword) {
        try {
            return argon2.hash(TIME_COST, MEMORY_KIB, PARALLELISM, rawPassword, StandardCharsets.UTF_8);
        } finally {
            // Wipe the intermediate password array used internally
            // (the library stores it temporarily during computation)
        }
    }
}
