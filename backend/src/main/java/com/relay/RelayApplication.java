package com.relay;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

// ARCH FIX (§2): @EnableScheduling activates Spring's task scheduler, used by
// RateLimitFilter to periodically evict stale in-memory fallback rate-limit buckets.
@SpringBootApplication
@EnableScheduling
public class RelayApplication {

    public static void main(String[] args) {
        loadEnvFile();
        SpringApplication.run(RelayApplication.class, args);
    }

    private static void loadEnvFile() {
        Path[] searchPaths = {
            Paths.get(".env"),
            Paths.get("backend/.env"),
            Paths.get("../.env")
        };

        for (Path envPath : searchPaths) {
            if (Files.exists(envPath)) {
                try {
                    List<String> lines = Files.readAllLines(envPath);
                    for (String line : lines) {
                        line = line.trim();
                        if (line.isEmpty() || line.startsWith("#")) continue;
                        int eqIndex = line.indexOf('=');
                        if (eqIndex > 0) {
                            String key = line.substring(0, eqIndex).trim();
                            String value = line.substring(eqIndex + 1).trim();
                            if (value.startsWith("\"") && value.endsWith("\"") && value.length() >= 2) {
                                value = value.substring(1, value.length() - 1);
                            } else if (value.startsWith("'") && value.endsWith("'") && value.length() >= 2) {
                                value = value.substring(1, value.length() - 1);
                            }
                            if (System.getProperty(key) == null && System.getenv(key) == null) {
                                System.setProperty(key, value);
                            }
                        }
                    }
                    break;
                } catch (IOException e) {
                    System.err.println("Notice: Could not read .env file at " + envPath + ": " + e.getMessage());
                }
            }
        }
    }
}
