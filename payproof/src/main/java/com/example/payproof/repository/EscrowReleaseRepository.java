package com.example.payproof.repository;

import com.example.payproof.enums.EscrowReleaseStatus;
import com.example.payproof.model.EscrowRelease;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface EscrowReleaseRepository
        extends JpaRepository<EscrowRelease, UUID> {

    Optional<EscrowRelease> findByJob_JobId(String jobId);

    Optional<EscrowRelease> findByEscrowId(String escrowId);

    Optional<EscrowRelease> findByIdempotencyKey(String idempotencyKey);

    boolean existsByJob_JobIdAndStatus(
            String jobId,
            EscrowReleaseStatus status
    );
}