package com.example.payproof_admin.model;

import com.example.payproof_admin.enums.TransactionKind;
import com.example.payproof_admin.enums.TransactionStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "transactions")
@Getter
@Setter
public class TransactionRecord {

    @Id
    @Column(name = "transaction_id", nullable = false, updatable = false, length = 64)
    private String transactionId;

    @Column(name = "tx_hash", nullable = false, unique = true, length = 128)
    private String txHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private TransactionKind kind;

    @Column(name = "escrow_id", length = 100)
    private String escrowId;

    @Column(name = "account_id", length = 128)
    private String accountId;

    @Column(length = 80)
    private String method;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private TransactionStatus status;

    @Column(name = "block_height")
    private Long blockHeight;

    @Column(name = "triggered_by_admin_id", length = 64)
    private String triggeredByAdminId;

    @Column(name = "payload_json", columnDefinition = "TEXT")
    private String payloadJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        if (transactionId == null) {
            transactionId = UUID.randomUUID().toString();
        }
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
        if (status == null) status = TransactionStatus.PENDING;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}