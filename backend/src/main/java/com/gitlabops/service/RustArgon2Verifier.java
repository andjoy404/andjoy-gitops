package com.gitlabops.service;

import de.mkammerer.argon2.Argon2;
import de.mkammerer.argon2.Argon2Factory;

public class RustArgon2Verifier {

    private RustArgon2Verifier() {}

    public static boolean verify(String rawPassword, String storedHash) {
        if (storedHash == null || !storedHash.startsWith("$argon2d$")) {
            return false;
        }

        Argon2 argon2 = Argon2Factory.create(Argon2Factory.Argon2Types.ARGON2d);
        return argon2.verify(storedHash, rawPassword);
    }

    public static boolean verifyArgon2i(String rawPassword, String storedHash) {
        if (storedHash == null || !storedHash.startsWith("$argon2i$")) {
            return false;
        }

        Argon2 argon2 = Argon2Factory.create(Argon2Factory.Argon2Types.ARGON2i);
        return argon2.verify(storedHash, rawPassword);
    }
}
