
package com.example.payproof.controller;

import com.example.payproof.dto.request.ConfirmEscrowRequest;
import com.example.payproof.dto.request.ConfirmSplitActionRequest;
import com.example.payproof.dto.request.CreateEscrowCaseRequest;
import com.example.payproof.dto.request.CreateEscrowRequest;
import com.example.payproof.dto.response.CreateEscrowResponse;
import com.example.payproof.dto.response.DisputeProposalResponse;
import com.example.payproof.dto.response.EscrowDetailsResponse;
import com.example.payproof.dto.response.EscrowDisputeCaseResponse;
import com.example.payproof.enums.EscrowCaseType;
import com.example.payproof.model.JobModel;
import com.example.payproof.model.UserModel;
import com.example.payproof.repository.JobRepository;
import com.example.payproof.repository.UserRepository;
import com.example.payproof.security.CustomUserPrincipal;
import com.example.payproof.service.EscrowCreationService;
import com.example.payproof.service.EscrowDisputeCaseService;
import com.example.payproof.service.EscrowQueryService;
import com.example.payproof.service.NearTransactionVerifier;
import com.example.payproof.service.SubmissionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/escrows")
@RequiredArgsConstructor
public class EscrowController {

    private final EscrowCreationService escrowCreationService;
    private final NearTransactionVerifier nearTransactionVerifier;
    private final SubmissionService submissionService;
    private final EscrowDisputeCaseService escrowDisputeCaseService;
    private final EscrowQueryService escrowQueryService;
    private final UserRepository userRepository;
    private final JobRepository jobRepository;

    @PostMapping
    public ResponseEntity<CreateEscrowResponse> createEscrow(
            @Valid @RequestBody CreateEscrowRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        UserModel user = authenticatedUser(principal);

        return ResponseEntity.ok(
                escrowCreationService.prepareEscrow(request, user)
        );
    }

    @Transactional
    @PostMapping("/{escrowId}/confirm")
    public ResponseEntity<?> confirmEscrow(
            @PathVariable String escrowId,
            @Valid @RequestBody ConfirmEscrowRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        UserModel user = authenticatedUser(principal);

        JobModel job = jobRepository.findByIdForUpdate(request.getJobId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Job not found"
                ));

        if (!job.getClient().getUserId().equals(user.getUserId())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "You do not own this job"
            );
        }

        if (job.getEscrowCreationId() == null
                || !job.getEscrowCreationId().equals(escrowId)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Escrow reservation does not match"
            );
        }

        escrowCreationService.recordSubmission(
                request.getJobId(),
                escrowId,
                request.getTransactionHash(),
                user
        );

        JobModel reservedJob = jobRepository.findById(request.getJobId())
                .orElseThrow();

        nearTransactionVerifier.verify(
                reservedJob,
                request.getTransactionHash()
        );

        escrowCreationService.confirmVerifiedEscrow(
                request.getJobId(),
                escrowId
        );

        return ResponseEntity.ok().body(
                java.util.Map.of(
                        "escrowId", escrowId,
                        "jobId", request.getJobId(),
                        "status", "Funded",
                        "isFunded", true
                )
        );
    }

    @GetMapping("/job/{jobId}")
    public ResponseEntity<EscrowDetailsResponse> getEscrowForJob(
            @PathVariable String jobId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        UserModel user = authenticatedUser(principal);
        return ResponseEntity.ok(escrowQueryService.getEscrowForJob(jobId, user));
    }

    @PostMapping("/jobs/{jobId}/reconcile-release")
    public ResponseEntity<Map<String, Boolean>> reconcileRelease(
            @PathVariable String jobId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        UserModel user = authenticatedUser(principal);
        boolean released = submissionService.reconcileReleasedEscrow(jobId, user);
        return ResponseEntity.ok(Map.of("released", released));
    }

    @PostMapping("/jobs/{jobId}/disputes")
    public ResponseEntity<EscrowDisputeCaseResponse> raiseDispute(
            @PathVariable String jobId,
            @Valid @RequestBody CreateEscrowCaseRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        UserModel user = authenticatedUser(principal);
        return ResponseEntity.ok(escrowDisputeCaseService.createCase(
                jobId,
                EscrowCaseType.DISPUTE,
                request,
                user
        ));
    }

    @PostMapping("/jobs/{jobId}/refund-requests")
    public ResponseEntity<EscrowDisputeCaseResponse> requestRefund(
            @PathVariable String jobId,
            @Valid @RequestBody CreateEscrowCaseRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        UserModel user = authenticatedUser(principal);
        return ResponseEntity.ok(escrowDisputeCaseService.createCase(
                jobId,
                EscrowCaseType.REFUND_REQUEST,
                request,
                user
        ));
    }

    @GetMapping("/jobs/{jobId}/dispute-case")
    public ResponseEntity<EscrowDisputeCaseResponse> getDisputeCase(
            @PathVariable String jobId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        UserModel user = authenticatedUser(principal);
        EscrowDisputeCaseResponse response =
                escrowDisputeCaseService.getCase(jobId, user);
        return response == null
                ? ResponseEntity.<EscrowDisputeCaseResponse>noContent().build()
                : ResponseEntity.ok(response);
    }

    private UserModel authenticatedUser(CustomUserPrincipal principal) {
        if (principal == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "Authentication required"
            );
        }

        return userRepository.findById(principal.getUserId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Authenticated user not found"
                ));
    }

    @GetMapping("/jobs/{jobId}/dispute-proposal")
    public ResponseEntity<DisputeProposalResponse> getDisputeProposal(
            @PathVariable String jobId,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        UserModel user = authenticatedUser(principal);
        DisputeProposalResponse p = escrowQueryService.getDisputeProposal(jobId, user);
        return p == null
                ? ResponseEntity.<DisputeProposalResponse>noContent().build()
                : ResponseEntity.ok(p);
    }

    @PostMapping("/jobs/{jobId}/dispute-proposal/accept")
    public ResponseEntity<?> acceptSplit(
            @PathVariable String jobId,
            @Valid @RequestBody ConfirmSplitActionRequest req,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        UserModel user = authenticatedUser(principal);
        submissionService.confirmSplitAcceptance(jobId, user, req.transactionHash());
        return ResponseEntity.ok(Map.of("status", "accepted"));
    }

    @PostMapping("/jobs/{jobId}/dispute-proposal/reject")
    public ResponseEntity<?> rejectSplit(
            @PathVariable String jobId,
            @Valid @RequestBody ConfirmSplitActionRequest req,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        UserModel user = authenticatedUser(principal);
        submissionService.confirmSplitRejection(jobId, user, req.transactionHash(), req.reason());
        return ResponseEntity.ok(Map.of("status", "rejected"));
    }

    @PostMapping("/jobs/{jobId}/dispute-proposal/revoke")
    public ResponseEntity<?> revokeSplit(
            @PathVariable String jobId,
            @Valid @RequestBody ConfirmSplitActionRequest req,
            @AuthenticationPrincipal CustomUserPrincipal principal) {
        UserModel user = authenticatedUser(principal);
        submissionService.confirmSplitRevoke(jobId, user, req.transactionHash());
        return ResponseEntity.ok(Map.of("status", "revoked"));
    }
}
