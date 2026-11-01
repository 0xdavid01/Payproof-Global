package com.example.payproof.controller;

import com.example.payproof.enums.UserRole;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class GoogleAuthController {

    @GetMapping("/google")
    public ResponseEntity<?> googleLogin(
            @RequestParam UserRole role,
            HttpSession session) {

        if (role != UserRole.CLIENT && role != UserRole.FREELANCER) {
            return ResponseEntity.badRequest().body(
                    Map.of("message", "Invalid account type")
            );
        }

        session.setAttribute("OAUTH2_REGISTER_ROLE", role);

        return ResponseEntity.ok(Map.of(
                "authorizationUrl", "/oauth2/authorization/google"
        ));
    }
}