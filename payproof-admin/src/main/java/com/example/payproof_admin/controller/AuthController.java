package com.example.payproof_admin.controller;

import com.example.payproof_admin.dto.LoginRequest;
import com.example.payproof_admin.dto.LoginResponse;
import com.example.payproof_admin.dto.MeResponse;
import com.example.payproof_admin.model.AdminSession;
import com.example.payproof_admin.model.AdminUsers;
import com.example.payproof_admin.repository.AdminUsersRepository;
import com.example.payproof_admin.security.AdminPrincipal;
import com.example.payproof_admin.service.SessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final String COOKIE_NAME = "SESSION";

    private final AuthenticationManager authenticationManager;
    private final SessionService sessionService;
    private final AdminUsersRepository adminUsersRepository;

    @Value("${payproof.cookie.secure:false}")
    private boolean cookieSecure;

    public AuthController(AuthenticationManager am, SessionService ss, AdminUsersRepository repo) {
        this.authenticationManager = am;
        this.sessionService = ss;
        this.adminUsersRepository = repo;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {

        Authentication auth = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.email(), request.password())
        );

        AdminPrincipal principal = (AdminPrincipal) auth.getPrincipal();

        AdminSession session = sessionService.create(
                principal.getId(),
                httpRequest.getHeader("User-Agent"),
                httpRequest.getRemoteAddr()
        );

        ResponseCookie cookie = ResponseCookie
                .from(COOKIE_NAME, session.getToken())
                .httpOnly(true)
                .path("/")
                .sameSite("Lax")
                .secure(cookieSecure)
                .maxAge(Duration.ofMinutes(30))
                .build();
        httpResponse.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());

        AdminUsers user = adminUsersRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Admin not found"));

        return ResponseEntity.ok(new LoginResponse(
                session.getToken(),
                session.getExpiresAt(),
                toMe(user)
        ));
    }

    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal AdminPrincipal principal) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }
        AdminUsers user = adminUsersRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Admin not found"));
        return toMe(user);
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(
            HttpServletRequest request,
            HttpServletResponse response) {

        String token = extractSessionToken(request);
        if (token != null) {
            sessionService.revoke(token);
        }

        // Expire the cookie
        ResponseCookie clear = ResponseCookie
                .from(COOKIE_NAME, "")
                .httpOnly(true)
                .path("/")
                .sameSite("Lax")
                .secure(cookieSecure)
                .maxAge(0)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, clear.toString());

        return ResponseEntity.ok(Map.of("message", "Logout successful"));
    }

    private String extractSessionToken(HttpServletRequest request) {
        if (request.getCookies() != null) {
            for (var c : request.getCookies()) {
                if (COOKIE_NAME.equals(c.getName())) {
                    return c.getValue();
                }
            }
        }
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }

    private MeResponse toMe(AdminUsers u) {
        return new MeResponse(u.getId(), u.getEmail(), u.getFirstName(), u.getLastName(),
                u.getAccountType(), u.getAccountStatus());
    }
}