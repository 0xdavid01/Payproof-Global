package com.example.payproof_admin.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "banned_accounts")
@Getter
@Setter
public class BannedAccount {

    @Id
    @Column(nullable = false, updatable = false)
    private String id;

    @Column(name = "account_id", nullable = false, unique = true, length = 128)
    private String accountId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Column(name = "banned_by_admin_id", nullable = false, length = 64)
    private String bannedByAdminId;

    @Column(name = "banned_at", nullable = false, updatable = false)
    private LocalDateTime bannedAt;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "lifted_at")
    private LocalDateTime liftedAt;

    @Column(name = "lifted_by_admin_id", length = 64)
    private String liftedByAdminId;

    @Version
    private Long version;

    @PrePersist
    void onCreate() {
        if (id == null) {
            id = UUID.randomUUID().toString();
        }
        if (bannedAt == null) {
            bannedAt = LocalDateTime.now();
        }
    }

    public boolean isActive() {
        if (liftedAt != null) return false;
        return expiresAt == null || expiresAt.isAfter(LocalDateTime.now());
    }
}