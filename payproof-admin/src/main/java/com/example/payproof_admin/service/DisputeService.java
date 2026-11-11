package com.example.payproof_admin.service;

import com.example.payproof_admin.components.AdminIDGenerator;
import com.example.payproof_admin.enums.ProposalStatus;
import com.example.payproof_admin.enums.TransactionKind;
import com.example.payproof_admin.enums.TransactionStatus;
import com.example.payproof_admin.model.AdminUsers;
import com.example.payproof_admin.model.DisputeProposal;
import com.example.payproof_admin.model.DisputeProposalEvent;
import com.example.payproof_admin.model.EscrowDisputeCase;
import com.example.payproof_admin.model.TransactionRecord;
import com.example.payproof_admin.near.NearRpcClient;
import com.example.payproof_admin.repository.DisputeProposalEventRepository;
import com.example.payproof_admin.repository.DisputeProposalRepository;
import com.example.payproof_admin.repository.EscrowDisputeCaseRepository;
import com.example.payproof_admin.repository.JobRepository;
import com.example.payproof_admin.repository.TransactionRecordRepository;
import com.example.payproof_admin.signer.CancelSplitRequest;
import com.example.payproof_admin.signer.ProposeSplitRequest;
import com.example.payproof_admin.signer.RetrySplitRequest;
import com.example.payproof_admin.signer.SignerClient;
import com.example.payproof_admin.signer.TxResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigInteger;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DisputeService {

    private static final BigInteger BASIS_POINTS = BigInteger.valueOf(10_000);

    private final EscrowDisputeCaseRepository caseRepository;
    private final JobRepository jobRepository;
    private final DisputeProposalRepository proposalRepository;
    private final DisputeProposalEventRepository eventRepository;
    private final TransactionRecordRepository transactionRepository;
    private final NearRpcClient nearRpcClient;
    private final SignerClient signerClient;
    private final ObjectMapper objectMapper;
    private final AdminIDGenerator idGenerator;

    @Value("${payproof.near.resolver-account}")
    private String resolverAccount;

    @Transactional
    public DisputeProposal propose(String escrowId, String freelancerAmountYocto, String reason, AdminUsers admin) {
        EscrowDisputeCase disputeCase = caseRepository.findByEscrowId(escrowId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "No dispute for escrow " + escrowId));

        if (!"OPEN".equalsIgnoreCase(disputeCase.getStatus())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Dispute is not open: " + disputeCase.getStatus());
        }

        if (proposalRepository.findByEscrowId(escrowId).isPresent()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "A proposal already exists for this escrow");
        }

        JsonNode escrow = nearRpcClient.getEscrow(escrowId);
        if (escrow == null || !"Disputed".equalsIgnoreCase(escrow.path("status").asString())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "On-chain escrow is not in Disputed status (status=" +
                            (escrow == null ? "null" : escrow.path("status").asString()) + ")");
        }

        BigInteger funded = new BigInteger(escrow.path("funded_amount").asString());
        BigInteger freelancerAmount = new BigInteger(freelancerAmountYocto);
        if (freelancerAmount.signum() <= 0 || freelancerAmount.compareTo(funded) > 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "freelancerAmount must be > 0 and <= funded_amount (" + funded + ")");
        }

        JsonNode config = nearRpcClient.getPlatformConfiguration();
        int feeBps = config.path("platform_fee_bps").asInt();
        BigInteger fee = freelancerAmount.multiply(BigInteger.valueOf(feeBps))
                .divide(BASIS_POINTS);
        if (freelancerAmount.compareTo(fee) < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "freelancerAmount must cover the platform fee");
        }
        BigInteger clientAmount = funded.subtract(freelancerAmount);

        // On-chain propose
        TxResult tx = signerClient.proposeSplit(new ProposeSplitRequest(
                escrowId, freelancerAmountYocto, reason));

        // Persist proposal
        DisputeProposal proposal = new DisputeProposal();
        proposal.setDisputeId(idGenerator.generateDisputeId());
        proposal.setEscrowId(escrowId);
        proposal.setFreelancerAmountYocto(freelancerAmountYocto);
        proposal.setClientAmountYocto(clientAmount.toString());
        proposal.setFeeYocto(fee.toString());
        proposal.setReason(reason);
        proposal.setProposedByAccountId(resolverAccount);
        proposal.setProposeTxHash(tx.txHash());
        proposal.setStatus(ProposalStatus.OPEN);
        proposal.setProposedAt(LocalDateTime.now());
        proposalRepository.save(proposal);

        recordTransaction(tx.txHash(), TransactionKind.PROPOSE, escrowId,
                "propose_dispute_split", admin, freelancerAmountYocto, reason);
        recordEvent(escrowId, "DISPUTE_SPLIT_PROPOSED", tx.txHash(),
                "{\"freelancer_amount\":\"" + freelancerAmountYocto +
                        "\",\"client_amount\":\"" + clientAmount +
                        "\",\"fee\":\"" + fee + "\"}");

        return proposal;
    }

    @Transactional
    public void cancel(String escrowId, String reason, AdminUsers admin) {
        DisputeProposal proposal = proposalRepository.findByEscrowId(escrowId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "No proposal for escrow " + escrowId));

        if (proposal.getStatus() != ProposalStatus.OPEN) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Proposal is not open: " + proposal.getStatus());
        }

        TxResult tx = signerClient.cancelSplit(new CancelSplitRequest(escrowId, reason));

        proposal.setStatus(ProposalStatus.CANCELLED);
        proposalRepository.save(proposal);

        recordTransaction(tx.txHash(), TransactionKind.CANCEL, escrowId,
                "cancel_dispute_split", admin, null, reason);
        recordEvent(escrowId, "DISPUTE_SPLIT_CANCELLED", tx.txHash(),
                "{\"reason\":\"" + reason + "\"}");
    }

    @Transactional
    public void retry(String escrowId, AdminUsers admin) {
        DisputeProposal proposal = proposalRepository.findByEscrowId(escrowId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "No proposal for escrow " + escrowId));

        if (proposal.getStatus() != ProposalStatus.FAILED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Only failed splits can be retried (current: " + proposal.getStatus() + ")");
        }

        TxResult tx = signerClient.retrySplit(new RetrySplitRequest(escrowId));
        proposal.setStatus(ProposalStatus.OPEN);
        proposalRepository.save(proposal);

        recordTransaction(tx.txHash(), TransactionKind.RETRY, escrowId,
                "retry_split_settlement", admin, null, null);
        recordEvent(escrowId, "SPLIT_RETRY_INITIATED", tx.txHash(), "{}");
    }

    private void recordTransaction(String txHash, TransactionKind kind, String escrowId,
                                   String method, AdminUsers admin, String amount, String reason) {
        TransactionRecord t = new TransactionRecord();
        t.setTransactionId(idGenerator.generateTransactionId());
        t.setTxHash(txHash);
        t.setKind(kind);
        t.setEscrowId(escrowId);
        t.setAccountId(resolverAccount);
        t.setMethod(method);
        t.setStatus(TransactionStatus.PENDING);
        t.setTriggeredByAdminId(admin != null ? admin.getId() : null);
        try {
            t.setPayloadJson(objectMapper.writeValueAsString(java.util.Map.of(
                    "amount", amount == null ? "" : amount,
                    "reason", reason == null ? "" : reason)));
        } catch (Exception ignored) { }
        transactionRepository.save(t);
    }

    private void recordEvent(String escrowId, String type, String txHash, String payload) {
        DisputeProposalEvent e = new DisputeProposalEvent();
        e.setEventId(idGenerator.generateEventId());
        e.setEscrowId(escrowId);
        e.setEventType(type);
        e.setTxHash(txHash);
        e.setPayloadJson(payload);
        eventRepository.save(e);
    }
}