package com.relay.conversation.entity;

import com.relay.user.entity.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "conversation_members")
@IdClass(ConversationMemberId.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder


public class ConversationMember {

    @Id
    @Column(name = "conversation_id")
    private UUID conversationId;

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "conversation_id", insertable = false, updatable = false)
    private Conversation conversation;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", insertable = false, updatable = false)
    private User user;

    @Column(nullable = false, length = 10)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private MemberRole role = MemberRole.MEMBER;

    @Column(name = "joined_at", nullable = false)
    @Builder.Default
    private Instant joinedAt = Instant.now();

    @Column(name = "last_read_message_id")
    private UUID lastReadMessageId;

    @Column(name = "last_read_sequence", nullable = false)
    @Builder.Default
    private Long lastReadSequence = 0L;

    @Column(nullable = false)
    @Builder.Default
    private Boolean muted = false;

    public enum MemberRole {
        ADMIN, MEMBER
    }
}
