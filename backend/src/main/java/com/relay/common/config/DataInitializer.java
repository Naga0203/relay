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
        if (userRepository.count() > 0) {
            log.info("Database already initialized with users.");
            return;
        }

        log.info("Seeding initial users and conversation...");

        User alice = userRepository.save(User.builder()
                .id(ALICE_ID)
                .name("Alice Johnson")
                .email("alice@example.com")
                .passwordHash(passwordEncoder.encode("password123"))
                .status("AVAILABLE")
                .build());

        User bob = userRepository.save(User.builder()
                .id(BOB_ID)
                .name("Bob Smith")
                .email("bob@example.com")
                .passwordHash(passwordEncoder.encode("password123"))
                .status("AVAILABLE")
                .build());

        // Create initial direct conversation between Alice and Bob
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

        log.info("Seeded users: alice@example.com and bob@example.com");
    }
}
