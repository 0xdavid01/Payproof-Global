package com.example.payproof_admin.repository;

import com.example.payproof_admin.model.DisputeProposalEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DisputeProposalEventRepository extends JpaRepository<DisputeProposalEvent, String> {
    List<DisputeProposalEvent> findByEscrowIdOrderByCreatedAtDesc(String escrowId);
    long countByEventIdStartingWith(String prefix);
}