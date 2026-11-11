package com.example.payproof_admin.service;

import com.example.payproof_admin.components.AdminIDGenerator;
import com.example.payproof_admin.dto.DisputedEscrowView;
import com.example.payproof_admin.model.EscrowDisputeCase;
import com.example.payproof_admin.model.JobModel;
import com.example.payproof_admin.model.UserModel;
import com.example.payproof_admin.near.NearRpcClient;
import com.example.payproof_admin.repository.DisputeProposalRepository;
import com.example.payproof_admin.repository.EscrowDisputeCaseRepository;
import com.example.payproof_admin.repository.JobRepository;
import tools.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@RequiredArgsConstructor
public class DisputeQueryService {

    private final EscrowDisputeCaseRepository caseRepository;
    private final JobRepository jobRepository;
    private final DisputeProposalRepository proposalRepository;
    private final NearRpcClient nearRpcClient;
    private final AdminIDGenerator idGenerator;

    public List<DisputedEscrowView> listDisputedEscrows() {
        return caseRepository.findByStatusOrderByCreatedAtDesc("OPEN")
                .stream()
                .map(this::toView)
                .toList();
    }

    public DisputedEscrowView getDispute(String escrowId) {
        EscrowDisputeCase c = caseRepository.findByEscrowId(escrowId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "No dispute for escrow " + escrowId));
        return toView(c);
    }

    private DisputedEscrowView toView(EscrowDisputeCase c) {
        JobModel job = jobRepository.findById(c.getJobId()).orElse(null);

        UserModel client = job != null ? job.getClient() : null;
        UserModel freelancer = job != null ? job.getFreelancer() : null;

        JsonNode escrow = safe(() -> nearRpcClient.getEscrow(c.getEscrowId()));
        JsonNode proposal = safe(() -> nearRpcClient.getDisputeProposal(c.getEscrowId()));
        JsonNode split = safe(() -> nearRpcClient.getSplitSettlement(c.getEscrowId()));

        String localStatus = proposalRepository
                .findByEscrowId(c.getEscrowId())
                .map(p -> p.getStatus().name())
                .orElse(null);

        return new DisputedEscrowView(
                c.getId(),
                c.getEscrowId(),
                c.getJobId(),
                job != null ? job.getTitle() : null,
                c.getType() != null ? c.getType().name() : null,
                c.getStatus(),
                c.getReason(),
                c.getTransactionHash(),
                c.getCreatedAt(),
                client != null ? client.getUserId() : null,
                client != null ? client.getEmail() : null,
                freelancer != null ? freelancer.getUserId() : null,
                freelancer != null ? freelancer.getEmail() : null,
                job != null && job.getCurrency() != null ? job.getCurrency().name() : null,
                job != null && job.getBudget() != null ? job.getBudget().toPlainString() : null,
                escrow,
                proposal,
                split,
                localStatus
        );
    }

    private JsonNode safe(java.util.function.Supplier<JsonNode> s) {
        try {
            return s.get();
        } catch (ResponseStatusException e) {
            return null;
        }
    }
}