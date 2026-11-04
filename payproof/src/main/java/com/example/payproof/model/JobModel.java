package com.example.payproof.model;

import com.example.payproof.dto.JobRequirement;
import com.example.payproof.enums.*;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "jobs")
@Getter
@Setter
public class JobModel {

    @Id
    @Column(name = "job_id", nullable = false, unique = true)
    private String jobId;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(name = "prd_storage_id")
    private String prdStorageId;

    @Column(name = "prd_url", columnDefinition = "TEXT")
    private String prdUrl;

    @Column(name = "contract_storage_id")
    private String contractStorageId;

    @Column(name = "contract_url", columnDefinition = "TEXT")
    private String contractUrl;

    @Column(name = "contract_version", nullable = false)
    private Integer contractVersion = 0;

    @Column(name = "contract_approved", nullable = false)
    private boolean contractApproved = false;

    @Column(name = "client_approved_contract_version")
    private Integer clientApprovedContractVersion;

    @Column(name = "freelancer_approved_contract_version")
    private Integer freelancerApprovedContractVersion;

    @Column(nullable = false, precision = 19, scale = 8)
    private BigDecimal budget;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentCurrency currency;

    private LocalDateTime deadline;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "requirements", columnDefinition = "jsonb")
    private List<JobRequirement> requirements = new ArrayList<>();

    @Column(name = "checklist_approved", nullable = false)
    private boolean checklistApproved = false;

    @Column(name = "participant_email")
    private String participantEmail;

    @Enumerated(EnumType.STRING)
    @Column(name = "invitation_status")
    private InvitationStatus invitationStatus;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private JobStatus status;

    @Column(name = "contract_change_reason", columnDefinition = "TEXT")
    private String contractChangeReason;

    @Enumerated(EnumType.STRING)
    @Column(name = "contract_status", nullable = false)
    private ContractStatus contractStatus = ContractStatus.NOT_UPLOADED;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "client_id", nullable = false)
    private UserModel client;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "freelancer_id")
    private UserModel freelancer;


    @Column(name = "escrow_id", unique = true)
    private String escrowId;

    @Enumerated(EnumType.STRING)
    @Column(name = "escrow_creation_status", length = 20)
    private EscrowCreationStatus escrowCreationStatus;

    @Column(name = "escrow_creation_id", unique = true)
    private String escrowCreationId;

    @Column(name = "escrow_creation_reserved_at")
    private LocalDateTime escrowCreationReservedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "escrow_creation_transaction_hash", length = 128)
    private String escrowCreationTransactionHash;

    @Column(name = "escrow_creation_client_wallet", length = 128)
    private String escrowCreationClientWallet;

    @Column(name = "escrow_creation_freelancer_wallet", length = 128)
    private String escrowCreationFreelancerWallet;

    @Column(name = "escrow_creation_amount", length = 80)
    private String escrowCreationAmount;
    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }

        if (status == null) {
            status = JobStatus.OPEN;
        }

        if (requirements == null) {
            requirements = new ArrayList<>();
        }

        if (contractVersion == null) {
            contractVersion = 0;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}