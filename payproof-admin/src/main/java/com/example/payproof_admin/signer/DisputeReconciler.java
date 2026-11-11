package com.example.payproof_admin.service;

import com.example.payproof_admin.enums.ProposalStatus;
import com.example.payproof_admin.enums.TransactionStatus;
import com.example.payproof_admin.model.DisputeProposal;
import com.example.payproof_admin.model.DisputeProposalEvent;
import com.example.payproof_admin.model.TransactionRecord;
import com.example.payproof_admin.near.NearRpcClient;
import com.example.payproof_admin.repository.DisputeProposalEventRepository;
import com.example.payproof_admin.repository.DisputeProposalRepository;
import com.example.payproof_admin.repository.TransactionRecordRepository;
import tools.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class DisputeReconciler {

    private static final Logger log = LoggerFactory.getLogger(DisputeReconciler.class);

    private final DisputeProposalRepository proposalRepository;
    private final DisputeProposalEventRepository eventRepository;
    private final TransactionRecordRepository transactionRepository;
    private final NearRpcClient nearRpcClient;

    @Scheduled(fixedDelayString = "${payproof.reconciler.interval-ms:10000}")
    @Transactional
    public void reconcile() {
        List<DisputeProposal> open = proposalRepository.findByStatus(ProposalStatus.OPEN);
        if (open.isEmpty()) return;

        log.debug("Reconciler: checking {} open proposals", open.size());
        for (DisputeProposal proposal : open) {
            try {
                reconcileOne(proposal);
            } catch (Exception e) {
                log.warn("Reconciler: failed to reconcile escrow {}", proposal.getEscrowId(), e);
            }
        }
    }

    private void reconcileOne(DisputeProposal proposal) {
        JsonNode chainProposal;
        JsonNode escrow;
        try {
            chainProposal = nearRpcClient.getDisputeProposal(proposal.getEscrowId());
            escrow = nearRpcClient.getEscrow(proposal.getEscrowId());
        } catch (Exception e) {
            log.warn("Reconciler: chain read failed for {}", proposal.getEscrowId(), e);
            return;
        }

        boolean changed = false;

        // 1) chain flags
        if (chainProposal != null && chainProposal.isObject()) {
            boolean clientAcc = chainProposal.path("client_accepted").asBoolean(false);
            boolean freelancerAcc = chainProposal.path("freelancer_accepted").asBoolean(false);

            if (clientAcc && !proposal.isChainClientAccepted()) {
                proposal.setChainClientAccepted(true);
                changed = true;
                recordEvent(proposal.getEscrowId(), "CHAIN_CLIENT_ACCEPTED", null, "{}");
            }
            if (freelancerAcc && !proposal.isChainFreelancerAccepted()) {
                proposal.setChainFreelancerAccepted(true);
                changed = true;
                recordEvent(proposal.getEscrowId(), "CHAIN_FREELANCER_ACCEPTED", null, "{}");
            }
        }

        // 2) status from escrow
        String chainStatus = escrow != null ? escrow.path("status").asText() : null;
        if (chainStatus != null) {
            switch (chainStatus) {
                case "Released" -> {
                    if (proposal.getStatus() != ProposalStatus.EXECUTED) {
                        proposal.setStatus(ProposalStatus.EXECUTED);
                        proposal.setChainClientAccepted(true);
                        proposal.setChainFreelancerAccepted(true);
                        changed = true;
                        recordEvent(proposal.getEscrowId(), "SPLIT_EXECUTED", null, "{}");
                    }
                }
                case "SettlementFailed" -> {
                    if (proposal.getStatus() != ProposalStatus.FAILED) {
                        proposal.setStatus(ProposalStatus.FAILED);
                        changed = true;
                        recordEvent(proposal.getEscrowId(), "SPLIT_FAILED", null, "{}");
                    }
                }
                case "Disputed" -> {
                    // Proposal no longer on chain: rejected (by party) or cancelled (by resolver).
                    if (chainProposal == null || chainProposal.isNull()) {
                        // We can't distinguish reject vs cancel from chain alone; check event log.
                        boolean rejected = eventRepository
                                .findByEscrowIdOrderByCreatedAtDesc(proposal.getEscrowId())
                                .stream()
                                .anyMatch(e -> "DISPUTE_SPLIT_REJECTED".equals(e.getEventType()));
                        boolean cancelledLocally = proposal.getStatus() == ProposalStatus.CANCELLED;

                        if (!cancelledLocally && proposal.getStatus() != ProposalStatus.REJECTED) {
                            proposal.setStatus(rejected
                                    ? ProposalStatus.REJECTED
                                    : ProposalStatus.CANCELLED);
                            changed = true;
                            recordEvent(proposal.getEscrowId(),
                                    rejected ? "SPLIT_REJECTED" : "SPLIT_DISAPPEARED", null, "{}");
                        }
                    }
                }
                default -> { /* Funded, Releasing, etc. — no transition */ }
            }
        }

        if (changed) {
            proposal.setLastSyncedAt(LocalDateTime.now());
            proposalRepository.save(proposal);
            refreshTransactionStatus(proposal.getEscrowId());
        }
    }

    private void refreshTransactionStatus(String escrowId) {
        // For the propose tx, mark SUCCESS once chain proposal exists.
        JsonNode chainProposal;
        try {
            chainProposal = nearRpcClient.getDisputeProposal(escrowId);
        } catch (Exception e) {
            return;
        }
        if (chainProposal == null || !chainProposal.isObject()) return;

        proposalRepository.findByEscrowId(escrowId).ifPresent(p -> {
            if (p.getProposeTxHash() == null) return;
            Optional<TransactionRecord> tx = transactionRepository.findByTxHash(p.getProposeTxHash());
            tx.ifPresent(t -> {
                if (t.getStatus() != TransactionStatus.SUCCESS) {
                    t.setStatus(TransactionStatus.SUCCESS);
                    transactionRepository.save(t);
                }
            });
        });
    }

    private void recordEvent(String escrowId, String type, String txHash, String payload) {
        DisputeProposalEvent e = new DisputeProposalEvent();
        e.setEventId(UUID.randomUUID().toString());
        e.setEscrowId(escrowId);
        e.setEventType(type);
        e.setTxHash(txHash);
        e.setPayloadJson(payload);
        eventRepository.save(e);
    }
}