package com.example.payproof_admin.model;

import com.example.payproof_admin.enums.EscrowCaseType;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Immutable
@Table(name = "escrow_dispute_cases")
@Getter
public class EscrowDisputeCase {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "job_id", nullable = false, unique = true)
    private String jobId;

    @Column(name = "escrow_id", nullable = false, unique = true, length = 100)
    private String escrowId;

    @Column(name = "requested_by", nullable = false)
    private String requestedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "case_type", nullable = false, length = 30)
    private EscrowCaseType type;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Column(name = "transaction_hash", nullable = false, unique = true, length = 128)
    private String transactionHash;

    @Column(name = "case_status", nullable = false, length = 30)
    private String status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}