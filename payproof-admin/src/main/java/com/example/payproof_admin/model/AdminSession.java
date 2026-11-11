package com.example.payproof_admin.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "admin_sessions",
        indexes = {
                @Index(name = "idx_admin_sessions_token", columnList = "token"),
                @Index(name = "idx_admin_sessions_expires", columnList = "expires_at")
        }
)
@Getter
@Setter
public class AdminSession {

    @Id
    @Column(name = "session_id", nullable = false, updatable = false, length = 64)
    private String sessionId;

    @Column(name = "admin_user_id", nullable = false, length = 64)
    private String adminUserId;

    @Column(name = "token", nullable = false, unique = true, length = 128)
    private String token;

    @Column(name = "issued_at", nullable = false, updatable = false)
    private LocalDateTime issuedAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Column(name = "user_agent", length = 255)
    private String userAgent;

    @Column(name = "ip_address", length = 64)
    private String ipAddress;

    @PrePersist
    void onCreate() {
        if (sessionId == null) {
            sessionId = java.util.UUID.randomUUID().toString();
        }
        if (issuedAt == null) {
            issuedAt = LocalDateTime.now();
        }
    }

    public boolean isActive() {
        return revokedAt == null && expiresAt.isAfter(LocalDateTime.now());
    }
}