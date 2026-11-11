package com.example.payproof_admin.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(
        name = "ban_audit",
        indexes = {
                @Index(name = "idx_ban_audit_account", columnList = "account_id"),
                @Index(name = "idx_ban_audit_performed", columnList = "performed_at")
        }
)
@Getter
@Setter
public class BanAudit {

    @Id
    @Column(name = "audit_id", nullable = false, updatable = false, length = 64)
    private String auditId;

    @Column(name = "account_id", nullable = false, length = 128)
    private String accountId;

    @Column(nullable = false, length = 30)
    private String action;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Column(name = "performed_by_admin_id", nullable = false, length = 64)
    private String performedByAdminId;

    @Column(name = "performed_at", nullable = false, updatable = false)
    private LocalDateTime performedAt;

    @PrePersist
    void onCreate() {
        if (auditId == null) {
            auditId = UUID.randomUUID().toString();
        }
        if (performedAt == null) {
            performedAt = LocalDateTime.now();
        }
    }
}
