package com.example.payproof_admin.repository;

import com.example.payproof_admin.model.EscrowDisputeCase;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EscrowDisputeCaseRepository extends JpaRepository<EscrowDisputeCase, UUID> {
    Optional<EscrowDisputeCase> findByEscrowId(String escrowId);
    Optional<EscrowDisputeCase> findByJobId(String jobId);
    List<EscrowDisputeCase> findByStatusOrderByCreatedAtDesc(String status);
}