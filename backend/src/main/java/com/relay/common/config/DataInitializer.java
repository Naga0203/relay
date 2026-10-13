package com.relay.common.config;

import com.relay.conversation.entity.Conversation;
import com.relay.conversation.entity.ConversationMember;
import com.relay.conversation.repository.ConversationMemberRepository;
import com.relay.conversation.repository.ConversationRepository;
import com.relay.user.entity.User;
import com.relay.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Slf4j
@Component
@Profile("dev")
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    public static final UUID ALICE_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    public static final UUID BOB_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");
    public static final UUID CONV_ID = UUID.fromString("8960bf7e-4c8a-486c-9696-24822dfbe54a");

    private final UserRepository userRepository;
    private final ConversationRepository conversationRepository;
    private final ConversationMemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(String... args) {
        log.info("Checking and seeding persistent users (Alice and Bob)...");

        // 1. Ensure Alice exists with requested password Test1@234
        User alice = userRepository.findByEmail("alice@example.com").orElse(null);
        if (alice == null) {
            alice = userRepository.save(User.builder()
                    .id(ALICE_ID)
                    .name("Alice Johnson")
                    .username("alice")
                    .email("alice@example.com")
                    .age(28)
                    .gender("Female")
                    .accountType("MAJOR")
                    .passwordHash(passwordEncoder.encode("Test1@234"))
                    .status("AVAILABLE")
                    .build());
            log.info("Created user: alice@example.com");
        } else {
            alice.setPasswordHash(passwordEncoder.encode("Test1@234"));
            userRepository.save(alice);
            log.info("Updated credentials for existing user: alice@example.com");
        }

        // 2. Ensure Bob exists with requested password Test@1234
        User bob = userRepository.findByEmail("bob@example.com").orElse(null);
        if (bob == null) {
            bob = userRepository.save(User.builder()
                    .id(BOB_ID)
                    .name("Bob Smith")
                    .username("bob")
                    .email("bob@example.com")
                    .age(30)
                    .gender("Male")
                    .accountType("MAJOR")
                    .passwordHash(passwordEncoder.encode("Test@1234"))
                    .status("AVAILABLE")
                    .build());
            log.info("Created user: bob@example.com");
        } else {
            bob.setPasswordHash(passwordEncoder.encode("Test@1234"));
            userRepository.save(bob);
            log.info("Updated credentials for existing user: bob@example.com");
        }

        // 3. Ensure Direct Conversation between Alice and Bob exists
        List<Conversation> existingDirect = conversationRepository.findDirectConversation(alice.getId(), bob.getId());
        if (existingDirect.isEmpty()) {
            Conversation conv = conversationRepository.save(Conversation.builder()
                    .id(CONV_ID)
                    .type(Conversation.ConversationType.DIRECT)
                    .createdBy(alice)
                    .build());

            memberRepository.save(ConversationMember.builder()
                    .conversationId(conv.getId())
                    .userId(alice.getId())
                    .conversation(conv)
                    .user(alice)
                    .role(ConversationMember.MemberRole.ADMIN)
                    .build());

            memberRepository.save(ConversationMember.builder()
                    .conversationId(conv.getId())
                    .userId(bob.getId())
                    .conversation(conv)
                    .user(bob)
                    .role(ConversationMember.MemberRole.MEMBER)
                    .build());

            log.info("Created direct conversation between Alice and Bob.");
        }
    }
}
