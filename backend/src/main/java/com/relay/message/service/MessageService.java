package com.relay.message.service;

import com.relay.auth.security.UserPrincipal;
import com.relay.common.exception.ApiException;
import com.relay.conversation.entity.Conversation;
import com.relay.conversation.repository.ConversationMemberRepository;
import com.relay.conversation.repository.ConversationRepository;
import com.relay.message.dto.MessagePage;
import com.relay.message.dto.MessageResponse;
import com.relay.message.dto.SendMessageRequest;
import com.relay.message.entity.Message;
import com.relay.message.entity.MessageRecipientKey;
import com.relay.message.repository.MessageRecipientKeyRepository;
import com.relay.message.repository.MessageRepository;
import com.relay.user.entity.User;
import com.relay.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class MessageService {

    private final MessageRepository messageRepository;
    private final ConversationRepository conversationRepository;
    private final ConversationMemberRepository memberRepository;
    private final UserRepository userRepository;
    // ARCH FIX (§9): Repository for per-recipient wrapped message keys.
    private final MessageRecipientKeyRepository recipientKeyRepository;

    @Transactional
    public MessageResponse sendMessage(UserPrincipal principal, UUID conversationId, SendMessageRequest request) {
        // ARCH FIX (§10): Idempotency check — catch race before touching sequence counter.
        if (request.idempotencyKey() != null) {
            var existing = messageRepository.findByIdempotencyKey(request.idempotencyKey());
            if (existing.isPresent()) {
                log.debug("Idempotent message detected: {}", request.idempotencyKey());
                return toResponseWithKeys(existing.get());
            }
        }

        // ARCH FIX (§1): Allocate sequence number via a pessimistic write lock on the
        // conversations row (which always exists). This guarantees mutual exclusion across
        // concurrent sendMessage calls for this conversation — including on the very first
        // message when the messages table is empty.
        Conversation conversation = conversationRepository.findByIdForUpdate(conversationId)
                .orElseThrow(() -> ApiException.notFound("Conversation", conversationId));

        if (!memberRepository.existsByConversationIdAndUserId(conversationId, principal.getId())) {
            throw ApiException.forbidden("You are not a member of this conversation");
        }

        User sender = userRepository.findById(principal.getId())
                .orElseThrow(() -> ApiException.notFound("User", principal.getId()));

        Long nextSequence = conversation.getNextSequence();
        conversation.setNextSequence(nextSequence + 1);
        conversation.setUpdatedAt(Instant.now());
        conversationRepository.saveAndFlush(conversation);

        Message message = Message.builder()
                .conversation(conversation)
                .sender(sender)
                .content(request.content())
                .messageType(request.messageType() != null ? request.messageType() : Message.MessageType.TEXT)
                .sequenceNumber(nextSequence)
                .idempotencyKey(request.idempotencyKey())
                .build();

        if (request.replyToId() != null) {
            Message replyTo = messageRepository.findById(request.replyToId())
                    .orElseThrow(() -> ApiException.notFound("Message", request.replyToId()));
            if (!replyTo.getConversation().getId().equals(conversationId)) {
                throw ApiException.badRequest("Reply-to message is not in this conversation");
            }
            message.setReplyTo(replyTo);
        }

        // ARCH FIX (§1, defense-in-depth): The unique constraint uq_messages_conv_seq is the
        // final safety net. On the extremely unlikely event of a DB-level duplicate (e.g.
        // sequence counter skew after a crash mid-transaction), catch the violation, retry
        // sequence allocation once, then surface a 409 rather than a 500.
        try {
            message = messageRepository.saveAndFlush(message);
        } catch (DataIntegrityViolationException ex) {
            log.warn("Sequence collision on first attempt for conversation {} — retrying once", conversationId);
            Long retrySequence = conversation.getNextSequence();
            conversation.setNextSequence(retrySequence + 1);
            conversationRepository.saveAndFlush(conversation);
            message.setSequenceNumber(retrySequence);
            try {
                message = messageRepository.saveAndFlush(message);
            } catch (DataIntegrityViolationException retryEx) {
                log.error("Sequence collision persists after retry for conversation {} — giving up", conversationId);
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Message could not be saved due to a sequencing conflict. Please try again.");
            }
        }

        // ARCH FIX (§9): Persist per-recipient wrapped message keys if provided.
        // The client sends recipientKeys: { userId: wrappedKeyBase64 } for each member.
        Map<String, String> recipientKeys = request.recipientKeys();
        if (recipientKeys != null && !recipientKeys.isEmpty()) {
            List<MessageRecipientKey> keyEntities = new ArrayList<>();
            for (Map.Entry<String, String> entry : recipientKeys.entrySet()) {
                keyEntities.add(MessageRecipientKey.builder()
                        .messageId(message.getId())
                        .userId(UUID.fromString(entry.getKey()))
                        .wrappedKey(entry.getValue())
                        .build());
            }
            recipientKeyRepository.saveAll(keyEntities);
        }

        log.debug("Message sent: {} in conversation {}", message.getId(), conversationId);
        return MessageResponse.from(message, recipientKeys);
    }

    @Transactional(readOnly = true)
    public MessagePage getMessages(UserPrincipal principal, UUID conversationId, Long beforeSequence, int limit) {
        if (!memberRepository.existsByConversationIdAndUserId(conversationId, principal.getId())) {
            throw ApiException.forbidden("You are not a member of this conversation");
        }

        limit = Math.min(limit, 100);
        PageRequest pageable = PageRequest.of(0, limit + 1);

        List<Message> messages;
        if (beforeSequence != null) {
            messages = messageRepository.findByConversationIdBefore(conversationId, beforeSequence, pageable);
        } else {
            messages = messageRepository.findByConversationId(conversationId, pageable);
        }

        boolean hasMore = messages.size() > limit;
        if (hasMore) {
            messages = messages.subList(0, limit);
        }

        // ARCH FIX (§9): Batch-load recipient keys for all messages in one query
        // to avoid N+1 when building responses.
        Map<UUID, Map<String, String>> keysByMessageId = loadRecipientKeysForMessages(messages);

        List<MessageResponse> messageResponses = messages.stream()
                .map(msg -> MessageResponse.from(msg, keysByMessageId.get(msg.getId())))
                .toList();

        Long nextCursor = hasMore && !messages.isEmpty()
                ? messages.get(messages.size() - 1).getSequenceNumber()
                : null;

        return new MessagePage(messageResponses, nextCursor, hasMore);
    }

    @Transactional
    public MessageResponse editMessage(UserPrincipal principal, UUID messageId, String newContent) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> ApiException.notFound("Message", messageId));

        if (!message.getSender().getId().equals(principal.getId())) {
            throw ApiException.forbidden("You can only edit your own messages");
        }

        if (message.isDeleted()) {
            throw ApiException.badRequest("Cannot edit a deleted message");
        }

        message.setContent(newContent);
        return toResponseWithKeys(messageRepository.save(message));
    }

    @Transactional
    public void deleteMessage(UserPrincipal principal, UUID messageId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> ApiException.notFound("Message", messageId));

        if (!message.getSender().getId().equals(principal.getId())) {
            throw ApiException.forbidden("You can only delete your own messages");
        }

        message.setDeletedAt(Instant.now());
        messageRepository.save(message);
        log.info("Message soft-deleted: {}", messageId);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /** Loads recipient keys for a single message and builds the response. */
    private MessageResponse toResponseWithKeys(Message msg) {
        List<MessageRecipientKey> keys = recipientKeyRepository.findByMessageId(msg.getId());
        Map<String, String> keyMap = keys.isEmpty() ? null : keys.stream()
                .collect(Collectors.toMap(k -> k.getUserId().toString(), MessageRecipientKey::getWrappedKey));
        return MessageResponse.from(msg, keyMap);
    }

    /** Batch-loads recipient keys for a list of messages into a map keyed by message ID. */
    private Map<UUID, Map<String, String>> loadRecipientKeysForMessages(List<Message> messages) {
        if (messages.isEmpty()) return Map.of();

        List<UUID> messageIds = messages.stream().map(Message::getId).toList();
        List<MessageRecipientKey> allKeys = recipientKeyRepository.findByMessageIdIn(messageIds);

        return allKeys.stream().collect(Collectors.groupingBy(
                MessageRecipientKey::getMessageId,
                Collectors.toMap(k -> k.getUserId().toString(), MessageRecipientKey::getWrappedKey)
        ));
    }
}

