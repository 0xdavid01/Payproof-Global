package com.example.payproof_admin.model;

import com.example.payproof_admin.enums.ProposalStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "dispute_proposals",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_proposal_escrow", columnNames = "escrow_id")
        }
)
@Getter
@Setter
public class DisputeProposal {

    @Id
    @Column(name = "dispute_id", nullable = false, updatable = false, length = 64)
    private String disputeId;

    @Column(name = "escrow_id", nullable = false, length = 100)
    private String escrowId;

    @Column(name = "freelancer_amount_yocto", nullable = false, length = 80)
    private String freelancerAmountYocto;

    @Column(name = "client_amount_yocto", nullable = false, length = 80)
    private String clientAmountYocto;

    @Column(name = "fee_yocto", nullable = false, length = 80)
    private String feeYocto;

    @Column(name = "reason", nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Column(name = "proposed_by_account_id", nullable = false, length = 128)
    private String proposedByAccountId;

    @Column(name = "propose_tx_hash", length = 128)
    private String proposeTxHash;

    @Column(name = "chain_client_accepted", nullable = false)
    private boolean chainClientAccepted = false;

    @Column(name = "chain_freelancer_accepted", nullable = false)
    private boolean chainFreelancerAccepted = false;

    @Column(name = "proposed_at", nullable = false, updatable = false)
    private LocalDateTime proposedAt;

    @Column(name = "last_synced_at")
    private LocalDateTime lastSyncedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private ProposalStatus status;

    @Version
    private Long version;

    @PrePersist
    void onCreate() {

        if (proposedAt == null) {
            proposedAt = LocalDateTime.now();
        }
        if (status == null) {
            status = ProposalStatus.OPEN;
        }
    }
}