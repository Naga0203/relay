package com.relay.auth.entity;

import com.relay.user.entity.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * SECURITY FIX (§11): The {@code token} column has been replaced by {@code token_hash}.
 *
 * We store SHA-256(rawTokenValue) instead of the raw value so that a DB read
 * (SQL injection, backup leak, compromised replica) does not yield usable credentials.
 * The raw token value is generated in {@link com.relay.auth.security.JwtTokenProvider},
 * returned to the client once, and never stored — only its hash is persisted here.
 */
@Entity
@Table(name = "refresh_tokens")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // SECURITY FIX (§11): stores SHA-256 hex digest of the raw token, never the raw value.
    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(nullable = false)
    @Builder.Default
    private Boolean revoked = false;

    public boolean isExpired() {
        return Instant.now().isAfter(expiresAt);
    }
}
