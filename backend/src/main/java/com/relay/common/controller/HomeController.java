package com.relay.common.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HomeController {

    @GetMapping("/")
    public ResponseEntity<Map<String, String>> home() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "message", "Relay Chat Backend API is running successfully!",
                "frontendUrl", "http://localhost:5173",
                "h2ConsoleUrl", "http://localhost:8080/h2-console"
        ));
    }
}
