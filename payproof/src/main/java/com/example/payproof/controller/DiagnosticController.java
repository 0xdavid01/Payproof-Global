
package com.example.payproof.controller;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class DiagnosticController {

    @GetMapping("/api/whoami")
    public Map<String, Object> whoami(Authentication authentication) {

        if (authentication == null) {
            return Map.of("authenticated", false);
        }

        return Map.of(
                "authenticated", authentication.isAuthenticated(),
                "name", authentication.getName(),
                "principalType",
                authentication.getPrincipal().getClass().getName()
        );
    }
}
