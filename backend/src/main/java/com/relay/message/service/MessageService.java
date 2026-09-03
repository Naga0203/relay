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
import com.relay.message.repository.MessageRepository;
import com.relay.user.entity.User;
import com.relay.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class MessageService {

    private final MessageRepository messageRepository;
    private final ConversationRepository conversationRepository;
    private final ConversationMemberRepository memberRepository;
    private final UserRepository userRepository;

    @Transactional
    public MessageResponse sendMessage(UserPrincipal principal, UUID conversationId, SendMessageRequest request) {
        // Idempotency check
        if (request.idempotencyKey() != null) {
            var existing = messageRepository.findByIdempotencyKey(request.idempotencyKey());
            if (existing.isPresent()) {
                log.debug("Idempotent message detected: {}", request.idempotencyKey());
                return MessageResponse.from(existing.get());
            }
        }

        Conversation conversation = conversationRepository.findById(conversationId)
                .orElseThrow(() -> ApiException.notFound("Conversation", conversationId));

        if (!memberRepository.existsByConversationIdAndUserId(conversationId, principal.getId())) {
            throw ApiException.forbidden("You are not a member of this conversation");
        }

        User sender = userRepository.findById(principal.getId())
                .orElseThrow(() -> ApiException.notFound("User", principal.getId()));

        // Generate next sequence number (pessimistic lock prevents race condition)
        Long nextSequence = messageRepository.findMaxSequenceNumberForUpdate(conversationId) + 1;

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

        message = messageRepository.saveAndFlush(message);

        // Update conversation's updatedAt
        conversation.setUpdatedAt(Instant.now());
        conversationRepository.saveAndFlush(conversation);

        log.debug("Message sent: {} in conversation {}", message.getId(), conversationId);
        return MessageResponse.from(message);
    }

    @Transactional(readOnly = true)
    public MessagePage getMessages(UserPrincipal principal, UUID conversationId, Long beforeSequence, int limit) {
        if (!memberRepository.existsByConversationIdAndUserId(conversationId, principal.getId())) {
            throw ApiException.forbidden("You are not a member of this conversation");
        }

        limit = Math.min(limit, 100); // Cap at 100
        PageRequest pageable = PageRequest.of(0, limit + 1); // Fetch one extra to determine hasMore

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

        List<MessageResponse> messageResponses = messages.stream()
                .map(MessageResponse::from)
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
        message = messageRepository.save(message);

        return MessageResponse.from(message);
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

    @Transactional(readOnly = true)
    public List<MessageResponse> searchMessages(UserPrincipal principal, UUID conversationId, String query) {
        if (!memberRepository.existsByConversationIdAndUserId(conversationId, principal.getId())) {
            throw ApiException.forbidden("You are not a member of this conversation");
        }

        return messageRepository.searchInConversation(conversationId, query, PageRequest.of(0, 50))
                .stream()
                .map(MessageResponse::from)
                .toList();
    }
}
