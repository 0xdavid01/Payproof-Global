package com.example.payproof.repository;

import com.example.payproof.model.EscrowDisputeCase;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface EscrowDisputeCaseRepository
        extends JpaRepository<EscrowDisputeCase, UUID> {

    Optional<EscrowDisputeCase> findByJob_JobId(String jobId);
}
