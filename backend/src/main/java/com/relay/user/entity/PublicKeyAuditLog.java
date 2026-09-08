package com.relay.user.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * SECURITY FIX (§8): Audit record for every ECDH public-key change.
 * See V10__key_upload_audit_log.sql for rationale.
 */
@Entity
@Table(name = "public_key_audit_log")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PublicKeyAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** SHA-256 hex of the previous public key; null on the very first upload. */
    @Column(name = "old_key_hash", length = 64)
    private String oldKeyHash;

    /** SHA-256 hex of the newly uploaded public key. */
    @Column(name = "new_key_hash", nullable = false, length = 64)
    private String newKeyHash;

    @Column(name = "changed_at", nullable = false)
    @Builder.Default
    private Instant changedAt = Instant.now();

    @Column(name = "client_ip", length = 45)
    private String clientIp;
}
