package com.relay;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// ARCH FIX (§2): @EnableScheduling activates Spring's task scheduler, used by
// RateLimitFilter to periodically evict stale in-memory fallback rate-limit buckets.
@SpringBootApplication
@EnableScheduling
public class RelayApplication {

    public static void main(String[] args) {
        SpringApplication.run(RelayApplication.class, args);
    }
}
