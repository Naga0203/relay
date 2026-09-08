package com.relay.message.entity;

import com.relay.user.entity.User;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/**
 * ARCH FIX (§9): Per-recipient wrapped message key for group E2EE.
 *
 * Each row stores the random per-message AES-GCM key, wrapped (encrypted) under
 * the pairwise ECDH session key between the message sender and this recipient.
 * The recipient unwraps with their own pairwise key, then decrypts the message body.
 */
@Entity
@Table(name = "message_recipient_keys")
@IdClass(MessageRecipientKeyId.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MessageRecipientKey {

    @Id
    @Column(name = "message_id", nullable = false)
    private UUID messageId;

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** Base64-encoded AES-GCM ciphertext of the per-message symmetric key. */
    @Column(name = "wrapped_key", nullable = false, columnDefinition = "TEXT")
    private String wrappedKey;
}
