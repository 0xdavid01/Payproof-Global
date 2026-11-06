package com.example.payproof.model;

import com.example.payproof.enums.EscrowCaseType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(
        name = "escrow_dispute_cases",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_escrow_dispute_case_job",
                        columnNames = "job_id"
                ),
                @UniqueConstraint(
                        name = "uk_escrow_dispute_case_tx",
                        columnNames = "transaction_hash"
                )
        }
)
@Getter
@Setter
public class EscrowDisputeCase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "job_id", nullable = false, unique = true)
    private JobModel job;

    @Column(name = "escrow_id", nullable = false, unique = true, length = 100)
    private String escrowId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requested_by", nullable = false)
    private UserModel requestedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "case_type", nullable = false, length = 30)
    private EscrowCaseType type;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Column(name = "transaction_hash", nullable = false, unique = true, length = 128)
    private String transactionHash;

    @Column(name = "case_status", nullable = false, length = 30)
    private String status = "OPEN";

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (status == null) {
            status = "OPEN";
        }
    }
}
