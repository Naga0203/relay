package com.relay.common.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HomeController {

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    @Value("${app.h2-console-url:http://localhost:8080/h2-console}")
    private String h2ConsoleUrl;

    @GetMapping("/")
    public ResponseEntity<Map<String, String>> home() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "message", "Relay Chat Backend API is running successfully!",
                "frontendUrl", frontendUrl,
                "h2ConsoleUrl", h2ConsoleUrl
        ));
    }
}
