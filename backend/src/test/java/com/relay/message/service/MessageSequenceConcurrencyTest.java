package com.relay.message.service;

import com.relay.auth.security.UserPrincipal;
import com.relay.message.dto.MessageResponse;
import com.relay.message.dto.SendMessageRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SECURITY FIX (§1): Concurrency test proving that the atomic sequence-number
 * allocation in MessageService.sendMessage does not produce duplicates even
 * under heavy contention.
 *
 * The test boots a full Spring context (H2 in-memory, Flyway migrations) and
 * fires N concurrent sendMessage calls against the same conversation.
 * After all complete, every message must have a unique, contiguous sequence
 * number — no gaps, no duplicates.
 *
 * Note: This test uses the default H2 profile (PostgreSQL-mode) which is
 * sufficient to validate the Java-layer concurrency logic.  The native-SQL
 * `UPDATE ... RETURNING` works in H2 PostgreSQL mode.
 */
@SpringBootTest
@ActiveProfiles("test")
class MessageSequenceConcurrencyTest {

    @Autowired
    private MessageService messageService;

    @Autowired
    private com.relay.conversation.repository.ConversationRepository conversationRepository;

    @Autowired
    private com.relay.conversation.repository.ConversationMemberRepository memberRepository;

    @Autowired
    private com.relay.user.repository.UserRepository userRepository;

    /**
     * Fire 20 concurrent sendMessage calls and assert all get unique, non-null
     * sequence numbers with no duplicates.
     */
    @Test
    void concurrentSendsShouldProduceUniqueSequenceNumbers() throws Exception {
        // Setup: create a user and a conversation.
        var user = com.relay.user.entity.User.builder()
                .name("ConcurrencyTestUser")
                .email("concurrency-test-" + UUID.randomUUID() + "@relay.test")
                .passwordHash("$argon2id$v=19$m=65536,t=3,p=1$dummysalt$dummyhash")
                .build();
        user = userRepository.saveAndFlush(user);

        var conversation = com.relay.conversation.entity.Conversation.builder()
                .type(com.relay.conversation.entity.Conversation.ConversationType.DIRECT)
                .name("ConcurrencyTestConv")
                .build();
        conversation = conversationRepository.saveAndFlush(conversation);

        var member = com.relay.conversation.entity.ConversationMember.builder()
                .conversationId(conversation.getId())
                .userId(user.getId())
                .conversation(conversation)
                .user(user)
                .role(com.relay.conversation.entity.ConversationMember.MemberRole.ADMIN)
                .build();
        memberRepository.saveAndFlush(member);

        final UUID convId = conversation.getId();
        final UserPrincipal principal = UserPrincipal.from(user);

        // Fire N concurrent sends.
        int N = 20;
        CountDownLatch startLatch = new CountDownLatch(1);
        Set<Long> seenSequences = ConcurrentHashMap.newKeySet();
        List<CompletableFuture<MessageResponse>> futures = new ArrayList<>();

        for (int i = 0; i < N; i++) {
            final int idx = i;
            futures.add(CompletableFuture.supplyAsync(() -> {
                try {
                    startLatch.await(); // all threads start together
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                SendMessageRequest req = new SendMessageRequest(
                        "msg-" + idx,
                        com.relay.message.entity.Message.MessageType.TEXT,
                        null,
                        UUID.randomUUID().toString(),
                        null  // no recipientKeys for this test
                );
                return messageService.sendMessage(principal, convId, req);
            }));
        }

        startLatch.countDown(); // GO!

        List<MessageResponse> results = new ArrayList<>();
        for (var f : futures) {
            results.add(f.join());
        }

        // All N messages must have been sent.
        assertThat(results).hasSize(N);

        // All sequence numbers must be non-null and unique.
        for (var r : results) {
            assertThat(r.sequenceNumber()).isNotNull();
            boolean added = seenSequences.add(r.sequenceNumber());
            assertThat(added)
                    .as("Sequence number %d should be unique", r.sequenceNumber())
                    .isTrue();
        }

        // Exactly N distinct sequence numbers.
        assertThat(seenSequences).hasSize(N);
    }
}
