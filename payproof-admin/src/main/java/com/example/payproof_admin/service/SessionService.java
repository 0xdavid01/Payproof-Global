package com.example.payproof_admin.service;

import com.example.payproof_admin.model.AdminSession;
import com.example.payproof_admin.repository.AdminSessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;

@Service
public class SessionService {

    private static final int TOKEN_BYTES = 32;
    private static final long TTL_MINUTES = 30;

    private final AdminSessionRepository repository;
    private final SecureRandom random = new SecureRandom();

    public SessionService(AdminSessionRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public AdminSession create(String adminUserId, String userAgent, String ipAddress) {
        AdminSession session = new AdminSession();
        session.setAdminUserId(adminUserId);
        session.setToken(generateToken());
        session.setExpiresAt(LocalDateTime.now().plusMinutes(TTL_MINUTES));
        session.setUserAgent(userAgent);
        session.setIpAddress(ipAddress);
        return repository.save(session);
    }

    public AdminSession findActiveByToken(String token) {
        return repository.findByToken(token)
                .filter(AdminSession::isActive)
                .orElse(null);
    }

    @Transactional
    public void revoke(String token) {
        repository.revokeByToken(token, LocalDateTime.now());
    }

    @Transactional
    public void purgeExpired() {
        repository.deleteExpired(LocalDateTime.now());
    }

    private String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}