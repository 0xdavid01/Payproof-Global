package com.example.payproof_admin.model;

import com.example.payproof_admin.dto.JobRequirement;
import com.example.payproof_admin.enums.*;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Immutable
@Table(name = "jobs")
@Getter
public class JobModel {

    @Id
    @Column(name = "job_id", nullable = false, unique = true)
    private String jobId;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(name = "contract_version", nullable = false)
    private Integer contractVersion;

    @Column(name = "contract_approved", nullable = false)
    private boolean contractApproved;

    @Column(nullable = false, precision = 19, scale = 8)
    private BigDecimal budget;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentCurrency currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private JobStatus status;

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

    @Column(name = "escrow_creation_client_wallet", length = 128)
    private String escrowCreationClientWallet;

    @Column(name = "escrow_creation_freelancer_wallet", length = 128)
    private String escrowCreationFreelancerWallet;

    @Column(name = "escrow_creation_amount", length = 80)
    private String escrowCreationAmount;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "prd_url", columnDefinition = "TEXT")
    private String prdUrl;

    @Column(name = "contract_url", columnDefinition = "TEXT")
    private String contractUrl;

    @Column(name = "contract_storage_id")
    private String contractStorageId;

    @Enumerated(EnumType.STRING)
    @Column(name = "contract_status")
    private ContractStatus contractStatus;

    @Column(name = "client_approved_contract_version")
    private Integer clientApprovedContractVersion;

    @Column(name = "freelancer_approved_contract_version")
    private Integer freelancerApprovedContractVersion;

    @Column(name = "deadline")
    private LocalDateTime deadline;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "requirements", columnDefinition = "jsonb")
    private List<JobRequirement> requirements;
}