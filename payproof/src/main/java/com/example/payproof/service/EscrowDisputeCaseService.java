package com.example.payproof.service;

import com.example.payproof.dto.request.CreateEscrowCaseRequest;
import com.example.payproof.dto.response.EscrowDisputeCaseResponse;
import com.example.payproof.enums.EscrowCaseType;
import com.example.payproof.enums.EscrowCreationStatus;
import com.example.payproof.enums.JobStatus;
import com.example.payproof.enums.UserRole;
import com.example.payproof.model.EscrowDisputeCase;
import com.example.payproof.model.JobModel;
import com.example.payproof.model.UserModel;
import com.example.payproof.repository.EscrowDisputeCaseRepository;
import com.example.payproof.repository.JobRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class EscrowDisputeCaseService {

    private final JobRepository jobRepository;
    private final EscrowDisputeCaseRepository caseRepository;
    private final NearTransactionVerifier nearTransactionVerifier;
    private final ActivityLogService activityLogService;

    @Transactional
    public EscrowDisputeCaseResponse createCase(
            String jobId,
            EscrowCaseType type,
            CreateEscrowCaseRequest request,
            UserModel requester
    ) {
        JobModel job = jobRepository.findByIdForUpdate(jobId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Project not found"
                ));

        requireParticipant(job, requester);
        String escrowId = job.getEscrowId();
        if (escrowId == null || escrowId.isBlank()
                || job.getEscrowCreationStatus() != EscrowCreationStatus.CONFIRMED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "The project does not have confirmed escrow"
            );
        }
        if (job.getStatus() == JobStatus.COMPLETED
                || job.getStatus() == JobStatus.CANCELLED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "A completed or cancelled project cannot be disputed"
            );
        }

        String reason = request.getReason().trim();
        String transactionHash = request.getTransactionHash().trim();

        var existing = caseRepository.findByJob_JobId(jobId);
        if (existing.isPresent()) {
            EscrowDisputeCase savedCase = existing.get();
            if (savedCase.getType() == type
                    && savedCase.getRequestedBy().getUserId().equals(requester.getUserId())
                    && savedCase.getTransactionHash().equals(transactionHash)
                    && savedCase.getReason().equals(reason)) {
                return toResponse(savedCase);
            }
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "A dispute or refund request is already recorded for this escrow"
            );
        }

        if (type == EscrowCaseType.REFUND_REQUEST) {
            if (requester.getRole() != UserRole.CLIENT
                    || !job.getClient().getUserId().equals(requester.getUserId())) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN, "Only the client can request a refund"
                );
            }
            if (job.getDeadline() == null || !LocalDateTime.now().isAfter(job.getDeadline())) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT, "A refund can only be requested after the project deadline"
                );
            }
        }

        nearTransactionVerifier.verifyDisputeRequest(
                job,
                requester,
                transactionHash,
                reason,
                type == EscrowCaseType.REFUND_REQUEST
        );

        EscrowDisputeCase disputeCase = new EscrowDisputeCase();
        disputeCase.setJob(job);
        disputeCase.setEscrowId(escrowId);
        disputeCase.setRequestedBy(requester);
        disputeCase.setType(type);
        disputeCase.setReason(reason);
        disputeCase.setTransactionHash(transactionHash);
        EscrowDisputeCase savedCase = caseRepository.save(disputeCase);

        job.setStatus(JobStatus.DISPUTED);
        jobRepository.save(job);

        String summary = type == EscrowCaseType.REFUND_REQUEST
                ? "The client requested a refund; the escrow is disputed and awaiting resolver review."
                : "A project participant raised a dispute; the escrow is awaiting resolver review.";
        activityLogService.record(
                job,
                requester,
                type == EscrowCaseType.REFUND_REQUEST
                        ? "REFUND_REQUESTED"
                        : "DISPUTE_RAISED",
                summary
        );

        return toResponse(savedCase);
    }

    @Transactional(readOnly = true)
    public EscrowDisputeCaseResponse getCase(String jobId, UserModel requester) {
        JobModel job = jobRepository.findById(jobId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Project not found"
                ));
        requireParticipant(job, requester);
        return caseRepository.findByJob_JobId(jobId)
                .map(this::toResponse)
                .orElse(null);
    }

    private void requireParticipant(JobModel job, UserModel requester) {
        boolean isClient = job.getClient().getUserId().equals(requester.getUserId());
        boolean isFreelancer = job.getFreelancer() != null
                && job.getFreelancer().getUserId().equals(requester.getUserId());
        if (!isClient && !isFreelancer) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Only project participants can access this dispute"
            );
        }
    }

    private EscrowDisputeCaseResponse toResponse(EscrowDisputeCase disputeCase) {
        UserModel requester = disputeCase.getRequestedBy();
        String name = requester.getDisplayName();
        if (name == null || name.isBlank()) {
            name = String.join(
                    " ",
                    requester.getFirstName() == null ? "" : requester.getFirstName(),
                    requester.getLastName() == null ? "" : requester.getLastName()
            ).trim();
        }
        if (name.isBlank()) {
            name = requester.getEmail();
        }

        return new EscrowDisputeCaseResponse(
                disputeCase.getId(),
                disputeCase.getJob().getJobId(),
                disputeCase.getEscrowId(),
                disputeCase.getType(),
                disputeCase.getStatus(),
                disputeCase.getReason(),
                disputeCase.getTransactionHash(),
                name,
                requester.getRole().name(),
                disputeCase.getCreatedAt()
        );
    }
}
