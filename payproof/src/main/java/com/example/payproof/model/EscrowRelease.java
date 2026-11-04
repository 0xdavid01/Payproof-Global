package com.example.payproof.model;

import com.example.payproof.enums.EscrowReleaseStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(
        name = "escrow_releases",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_escrow_release_escrow",
                        columnNames = "escrow_id"
                ),
                @UniqueConstraint(
                        name = "uk_escrow_release_idempotency",
                        columnNames = "idempotency_key"
                )
        }
)
@Getter
@Setter
public class EscrowRelease {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "job_id",
            nullable = false,
            unique = true
    )
    private JobModel job;

    @Column(name = "escrow_id", nullable = false, unique = true)
    private String escrowId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requested_by", nullable = false)
    private UserModel requestedBy;

    @Column(name = "operation_id")
    private String operationId;

    @Column(name = "idempotency_key", nullable = false, unique = true)
    private String idempotencyKey;

    @Column(name = "transaction_hash", length = 128)
    private String transactionHash;

    @Column(name = "recipient_account", nullable = false, length = 128)
    private String recipientAccount;

    @Column(name = "amount", nullable = false, length = 80)
    private String amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private EscrowReleaseStatus status =
            EscrowReleaseStatus.REQUESTED;

    @Column(name = "failure_reason", columnDefinition = "TEXT")
    private String failureReason;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    @Column(name = "processing_at")
    private LocalDateTime processingAt;

    @Column(name = "confirmed_at")
    private LocalDateTime confirmedAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Version
    private Long version;

    @PrePersist
    protected void onCreate() {
        requestedAt = LocalDateTime.now();

        if (status == null) {
            status = EscrowReleaseStatus.REQUESTED;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}