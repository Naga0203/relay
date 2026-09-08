package com.relay.auth.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * SECURITY FIX (§11): Single source of truth for refresh-token hashing.
 *
 * All callers that need to store or look up a refresh token must go through
 * {@link #hash(String)}.  Keeping the logic here (not inlined in the service)
 * makes it easy to audit and change the algorithm in one place if needed.
 */
public final class RefreshTokenHashUtil {

    private RefreshTokenHashUtil() {}

    /**
     * Returns the lowercase hex SHA-256 digest of the raw token value.
     * The result is exactly 64 hex characters — fits in the {@code VARCHAR(64)} column.
     */
    public static String hash(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : hashBytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the Java SE specification — this can never happen.
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
