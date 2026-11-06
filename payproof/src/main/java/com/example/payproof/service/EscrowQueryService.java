package com.example.payproof.service;

import com.example.payproof.dto.response.EscrowDetailsResponse;
import com.example.payproof.enums.EscrowCreationStatus;
import com.example.payproof.enums.SubmissionReviewStatus;
import com.example.payproof.model.JobModel;
import com.example.payproof.model.UserModel;
import com.example.payproof.repository.EscrowDisputeCaseRepository;
import com.example.payproof.repository.JobRepository;
import com.example.payproof.repository.SubmissionReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

import java.math.BigInteger;
import java.time.Instant;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class EscrowQueryService {

    private final JobRepository jobRepository;
    private final NearTransactionVerifier nearTransactionVerifier;
    private final SubmissionReviewRepository submissionReviewRepository;
    private final EscrowDisputeCaseRepository disputeCaseRepository;

    @Value("${near.escrow-contract-id}")
    private String escrowContractId;

    @Value("${near.network:testnet}")
    private String nearNetwork;

    @Transactional(readOnly = true)
    public EscrowDetailsResponse getEscrowForJob(String jobId, UserModel requester) {
        JobModel job = jobRepository.findById(jobId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Job not found"
                ));

        boolean isClient = job.getClient().getUserId().equals(requester.getUserId());
        boolean isFreelancer = job.getFreelancer() != null
                && job.getFreelancer().getUserId().equals(requester.getUserId());
        if (!isClient && !isFreelancer) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Only project participants can view this escrow"
            );
        }

        String escrowId = job.getEscrowId();
        if (escrowId == null || escrowId.isBlank()
                || job.getEscrowCreationStatus() != EscrowCreationStatus.CONFIRMED) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Confirmed escrow not found for this project"
            );
        }

        JsonNode escrow = nearTransactionVerifier.getEscrowState(escrowId);
        if (escrow == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Escrow not found on NEAR"
            );
        }
        if (!escrow.isObject()
                || !escrowId.equals(escrow.path("escrow_id").asText())
                || !Objects.equals(
                        job.getEscrowCreationClientWallet(),
                        escrow.path("client").asText())
                || !Objects.equals(
                        job.getEscrowCreationFreelancerWallet(),
                        escrow.path("freelancer").asText())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "On-chain escrow participants do not match this project"
            );
        }

        String status = escrow.path("status").asText();
        String amount = escrow.path("amount").asText();
        String fundedAmount = escrow.path("funded_amount").asText();
        if (status.isBlank() || amount.isBlank() || fundedAmount.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "The escrow contract returned incomplete escrow details"
            );
        }
        String platformFee = escrow.path("platform_fee").asText();
        if (platformFee.isBlank()) {
            platformFee = new BigInteger(fundedAmount)
                    .subtract(new BigInteger(amount))
                    .toString();
            if (platformFee.startsWith("-")) {
                throw new ResponseStatusException(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        "The escrow contract returned inconsistent funding amounts"
                );
            }
        }

        String releaseTransactionHash = submissionReviewRepository
                .findFirstBySubmissionVersion_Submission_Job_JobIdAndStatusOrderByReviewedAtDesc(
                        jobId,
                        SubmissionReviewStatus.ACCEPTED
                )
                .map(review -> review.getTransactionHash())
                .orElse(null);

        var disputeCaseId = disputeCaseRepository.findByJob_JobId(jobId)
                .map(disputeCase -> disputeCase.getId())
                .orElse(null);

        return new EscrowDetailsResponse(
                escrowId,
                jobId,
                status,
                !"AwaitingFunding".equalsIgnoreCase(status),
                escrow.path("asset").asText(),
                amount,
                platformFee,
                fundedAmount,
                escrow.path("client").asText(),
                escrow.path("freelancer").asText(),
                escrowContractId,
                nearNetwork,
                timestampToIso(escrow.path("created_at").asText()),
                timestampToIso(escrow.path("updated_at").asText()),
                releaseTransactionHash,
                disputeCaseId
        );
    }

    private String timestampToIso(String nanoseconds) {
        if (nanoseconds == null || nanoseconds.isBlank()) {
            return null;
        }
        BigInteger epochNanos = new BigInteger(nanoseconds);
        BigInteger[] secondsAndNanos = epochNanos.divideAndRemainder(
                BigInteger.valueOf(1_000_000_000)
        );
        return Instant.ofEpochSecond(
                secondsAndNanos[0].longValueExact(),
                secondsAndNanos[1].longValueExact()
        ).toString();
    }
}
