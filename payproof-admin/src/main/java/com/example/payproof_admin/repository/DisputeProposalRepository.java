package com.example.payproof_admin.repository;

import com.example.payproof_admin.enums.ProposalStatus;
import com.example.payproof_admin.model.DisputeProposal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DisputeProposalRepository extends JpaRepository<DisputeProposal, String> {
    Optional<DisputeProposal> findByEscrowId(String escrowId);
    List<DisputeProposal> findByStatus(ProposalStatus status);
    long countByDisputeIdStartingWith(String prefix);
}