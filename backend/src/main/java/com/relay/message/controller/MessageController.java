package com.relay.message.controller;

import com.relay.auth.security.UserPrincipal;
import com.relay.message.dto.EditMessageRequest;
import com.relay.message.dto.MessagePage;
import com.relay.message.dto.MessageResponse;
import com.relay.message.dto.SendMessageRequest;
import com.relay.message.service.MessageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class MessageController {

    private final MessageService messageService;

    @PostMapping("/conversations/{conversationId}/messages")
    public ResponseEntity<MessageResponse> sendMessage(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID conversationId,
            @Valid @RequestBody SendMessageRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(messageService.sendMessage(principal, conversationId, request));
    }

    @GetMapping("/conversations/{conversationId}/messages")
    public ResponseEntity<MessagePage> getMessages(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID conversationId,
            @RequestParam(required = false) Long before,
            @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(messageService.getMessages(principal, conversationId, before, limit));
    }

    @PatchMapping("/messages/{messageId}")
    public ResponseEntity<MessageResponse> editMessage(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID messageId,
            @Valid @RequestBody EditMessageRequest request) {
        return ResponseEntity.ok(messageService.editMessage(principal, messageId, request.content()));
    }

    @DeleteMapping("/messages/{messageId}")
    public ResponseEntity<Void> deleteMessage(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID messageId) {
        messageService.deleteMessage(principal, messageId);
        return ResponseEntity.noContent().build();
    }

    // ARCH FIX (§7): GET /conversations/{id}/messages/search REMOVED.
    //
    // Message content is AES-GCM-256 ciphertext with a random IV per message.
    // LOWER(content) LIKE LOWER('%query%') can never match — this endpoint was
    // dead code.  Worse, if it ever *did* match something, that would indicate
    // plaintext had leaked to the server, which is a more serious problem.
    //
    // Message search is implemented client-side: the React ChatView already loads
    // and decrypts messages locally via useInfiniteQuery; filter the decrypted text
    // in-memory there.  The limitation (search covers only already-loaded history)
    // should be documented in the UI if a search feature is surfaced to users.
}
