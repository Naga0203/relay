package com.relay.user.repository;

import com.relay.user.entity.PublicKeyAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.UUID;

public interface PublicKeyAuditLogRepository extends JpaRepository<PublicKeyAuditLog, UUID> {

    /**
     * SECURITY FIX (§8): Count how many key changes this user has made since a given
     * instant, used to enforce the 1-change-per-hour rate limit in UserService.
     */
    @Query("SELECT COUNT(a) FROM PublicKeyAuditLog a WHERE a.user.id = :userId AND a.changedAt >= :since")
    long countByUserIdSince(UUID userId, Instant since);
}
