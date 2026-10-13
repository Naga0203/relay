package com.relay.integration;

import com.relay.auth.dto.LoginRequest;
import com.relay.auth.dto.RegisterRequest;
import com.relay.auth.service.AuthService;
import com.relay.common.exception.ApiException;
import com.relay.conversation.dto.ConversationResponse;
import com.relay.conversation.service.ConversationService;
import com.relay.file.service.FileStorageService;
import com.relay.message.dto.SendMessageRequest;
import com.relay.message.service.MessageService;
import com.relay.user.dto.UpdateProfileRequest;
import com.relay.user.dto.UserResponse;
import com.relay.user.entity.User;
import com.relay.user.repository.UserRepository;
import com.relay.user.service.UserService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class RelayComprehensiveFlowTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ConversationService conversationService;

    @Autowired
    private MessageService messageService;

    @Autowired
    private FileStorageService fileStorageService;

    @Test
    @DisplayName("Registration: Derives MINOR for age < 18 and MAJOR for age >= 18")
    void testRegistrationAgeClassification() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);

        // Minor account
        var minorAuth = authService.register(new RegisterRequest(
                "Young Alice",
                "young_alice_" + suffix,
                "young_alice_" + suffix + "@example.com",
                16,
                "Female",
                "Password123!",
                "Password123!"
        ));
        assertThat(minorAuth.user().accountType()).isEqualTo("MINOR");
        assertThat(minorAuth.user().age()).isEqualTo(16);

        // Adult account
        var adultAuth = authService.register(new RegisterRequest(
                "Adult Bob",
                "adult_bob_" + suffix,
                "adult_bob_" + suffix + "@example.com",
                25,
                "Male",
                "Password123!",
                "Password123!"
        ));
        assertThat(adultAuth.user().accountType()).isEqualTo("MAJOR");
        assertThat(adultAuth.user().age()).isEqualTo(25);
    }

    @Test
    @DisplayName("Registration: Enforces unique usernames and password confirmation")
    void testRegistrationValidation() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String username = "unique_user_" + suffix;

        authService.register(new RegisterRequest(
                "First User",
                username,
                "first_" + suffix + "@example.com",
                22,
                "Non-binary",
                "Password123!",
                "Password123!"
        ));

        // Duplicate username (case-insensitive) should throw 409
        assertThatThrownBy(() ->
                authService.register(new RegisterRequest(
                        "Second User",
                        username.toUpperCase(),
                        "second_" + suffix + "@example.com",
                        22,
                        "Non-binary",
                        "Password123!",
                        "Password123!"
                ))
        ).isInstanceOf(ApiException.class)
         .satisfies(ex -> assertThat(((ApiException) ex).getStatus().value()).isEqualTo(409));

        // Password mismatch should throw 400
        assertThatThrownBy(() ->
                authService.register(new RegisterRequest(
                        "Mismatch User",
                        "mismatch_" + suffix,
                        "mismatch_" + suffix + "@example.com",
                        22,
                        "Non-binary",
                        "Password123!",
                        "DifferentPassword123!"
                ))
        ).isInstanceOf(ApiException.class)
         .satisfies(ex -> assertThat(((ApiException) ex).getStatus().value()).isEqualTo(400));
    }

    @Test
    @DisplayName("Authentication: Allows login with email OR username")
    void testLoginWithEmailOrUsername() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String username = "logintest_" + suffix;
        String email = "logintest_" + suffix + "@example.com";
        String password = "Password123!";

        authService.register(new RegisterRequest(
                "Login User",
                username,
                email,
                26,
                "Female",
                password,
                password
        ));

        // Login via email
        var emailAuth = authService.login(new LoginRequest(email, password));
        assertThat(emailAuth).isNotNull();
        assertThat(emailAuth.user().email()).isEqualTo(email);

        // Login via username
        var usernameAuth = authService.login(new LoginRequest(username, password));
        assertThat(usernameAuth).isNotNull();
        assertThat(usernameAuth.user().username()).isEqualTo(username);
    }

    @Test
    @DisplayName("Profile Management: Editable display name and unique username enforcement")
    void testProfileManagement() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        var authA = authService.register(new RegisterRequest(
                "Alice Original",
                "alice_prof_" + suffix,
                "alice_prof_" + suffix + "@example.com",
                28,
                "Female",
                "Password123!",
                "Password123!"
        ));

        var authB = authService.register(new RegisterRequest(
                "Bob Original",
                "bob_prof_" + suffix,
                "bob_prof_" + suffix + "@example.com",
                30,
                "Male",
                "Password123!",
                "Password123!"
        ));

        com.relay.auth.security.UserPrincipal principalA = new com.relay.auth.security.UserPrincipal(
                authA.user().id(),
                authA.user().name(),
                authA.user().email(),
                "Password123!"
        );

        // Alice updates display name to "Alice J"
        UserResponse updatedAlice = userService.updateProfile(principalA, new UpdateProfileRequest(
                "Alice J",
                null,
                null,
                null
        ));
        assertThat(updatedAlice.name()).isEqualTo("Alice J");

        // Alice cannot take Bob's username
        assertThatThrownBy(() ->
                userService.updateProfile(principalA, new UpdateProfileRequest(
                        "Alice J",
                        "bob_prof_" + suffix,
                        null,
                        null
                ))
        ).isInstanceOf(ApiException.class)
         .satisfies(ex -> assertThat(((ApiException) ex).getStatus().value()).isEqualTo(409));
    }

    @Test
    @DisplayName("Profile Picture: Enforces 2MB maximum limit and validates image formats")
    void testAvatarUploadLimits() {
        // 1. File exceeding 2MB limit
        byte[] oversizedBytes = new byte[3 * 1024 * 1024]; // 3MB
        MockMultipartFile oversizedFile = new MockMultipartFile(
                "file", "large_avatar.png", "image/png", oversizedBytes);

        assertThatThrownBy(() -> fileStorageService.storeAvatar(oversizedFile))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getStatus().value()).isEqualTo(400));

        // 2. Unsupported format
        MockMultipartFile textFile = new MockMultipartFile(
                "file", "script.sh", "text/plain", "echo hello".getBytes());

        assertThatThrownBy(() -> fileStorageService.storeAvatar(textFile))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getStatus().value()).isEqualTo(400));
    }

    @Test
    @DisplayName("File Storage: Preserves double extension for E2EE .enc attachments (e.g. photo.png.enc)")
    void testDoubleExtensionPreservation() {
        byte[] encBytes = new byte[128]; // arbitrary ciphertext
        MockMultipartFile encFile = new MockMultipartFile(
                "file", "sample_image.png.enc", "application/octet-stream", encBytes);

        String stored = fileStorageService.storeFile(encFile);
        assertThat(stored).endsWith(".png.enc");
    }

    @Test
    @DisplayName("Unread Message Tracking: Increments on new incoming message, resets to 0 on markAsRead")
    void testUnreadTrackingFlow() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        var authAlice = authService.register(new RegisterRequest(
                "Alice Chat",
                "alice_chat_" + suffix,
                "alice_chat_" + suffix + "@example.com",
                27,
                "Female",
                "Password123!",
                "Password123!"
        ));

        var authBob = authService.register(new RegisterRequest(
                "Bob Chat",
                "bob_chat_" + suffix,
                "bob_chat_" + suffix + "@example.com",
                29,
                "Male",
                "Password123!",
                "Password123!"
        ));

        com.relay.auth.security.UserPrincipal principalAlice = new com.relay.auth.security.UserPrincipal(
                authAlice.user().id(),
                authAlice.user().name(),
                authAlice.user().email(),
                "Password123!"
        );

        com.relay.auth.security.UserPrincipal principalBob = new com.relay.auth.security.UserPrincipal(
                authBob.user().id(),
                authBob.user().name(),
                authBob.user().email(),
                "Password123!"
        );

        // Create direct conversation
        ConversationResponse conv = conversationService.createConversation(
                principalAlice,
                new com.relay.conversation.dto.CreateConversationRequest(
                        com.relay.conversation.entity.Conversation.ConversationType.DIRECT,
                        null,
                        List.of(authBob.user().id())
                )
        );

        // Initially, Bob has 0 unread
        ConversationResponse bobConvInit = conversationService.getConversation(principalBob, conv.id());
        assertThat(bobConvInit.unreadCount()).isEqualTo(0);

        // Alice sends message 1 to Bob
        messageService.sendMessage(principalAlice, conv.id(), new SendMessageRequest(
                "e2e:v2:encrypted_content_1",
                com.relay.message.entity.Message.MessageType.TEXT,
                null,
                UUID.randomUUID().toString(),
                null
        ));

        // Alice sends message 2 to Bob
        messageService.sendMessage(principalAlice, conv.id(), new SendMessageRequest(
                "e2e:v2:encrypted_content_2",
                com.relay.message.entity.Message.MessageType.TEXT,
                null,
                UUID.randomUUID().toString(),
                null
        ));

        // Alice sends message 3 to Bob
        messageService.sendMessage(principalAlice, conv.id(), new SendMessageRequest(
                "e2e:v2:encrypted_content_3",
                com.relay.message.entity.Message.MessageType.TEXT,
                null,
                UUID.randomUUID().toString(),
                null
        ));

        // Bob checks conversation list: unreadCount should be exactly 3
        List<ConversationResponse> bobConvs = conversationService.getUserConversations(principalBob);
        ConversationResponse bobConv = bobConvs.stream()
                .filter(c -> c.id().equals(conv.id()))
                .findFirst()
                .orElseThrow();
        assertThat(bobConv.unreadCount()).isEqualTo(3);

        // Alice's own conversation shows unreadCount = 0 (own sent messages don't count as unread)
        ConversationResponse aliceConv = conversationService.getConversation(principalAlice, conv.id());
        assertThat(aliceConv.unreadCount()).isEqualTo(0);

        // Bob opens conversation (calls markAsRead)
        conversationService.markAsRead(principalBob, conv.id());

        // Bob's unread count is now 0!
        ConversationResponse bobConvAfterRead = conversationService.getConversation(principalBob, conv.id());
        assertThat(bobConvAfterRead.unreadCount()).isEqualTo(0);
    }

    @Test
    @DisplayName("User Search: Search by exact email, email prefix, username, @username, and display name")
    void testSearchUsersByEmailAndUsername() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String username = "searchtarget_" + suffix;
        String email = "targetuser_" + suffix + "@searchdomain.com";
        String displayName = "Target Search User " + suffix;

        authService.register(new RegisterRequest(
                displayName,
                username,
                email,
                24,
                "Non-binary",
                "Password123!",
                "Password123!"
        ));

        // 1. Search by full email
        var resultsByEmail = userService.searchUsers(email);
        assertThat(resultsByEmail).anyMatch(u -> u.username().equals(username) && u.email().equals(email));

        // 2. Search by email prefix
        var resultsByEmailPrefix = userService.searchUsers("targetuser_" + suffix);
        assertThat(resultsByEmailPrefix).anyMatch(u -> u.username().equals(username));

        // 3. Search by username without @
        var resultsByUsername = userService.searchUsers(username);
        assertThat(resultsByUsername).anyMatch(u -> u.username().equals(username));

        // 4. Search by username with @ prefix
        var resultsByAtUsername = userService.searchUsers("@" + username);
        assertThat(resultsByAtUsername).anyMatch(u -> u.username().equals(username));

        // 5. Search by display name
        var resultsByName = userService.searchUsers("Target Search User");
        assertThat(resultsByName).anyMatch(u -> u.username().equals(username));
    }
}
