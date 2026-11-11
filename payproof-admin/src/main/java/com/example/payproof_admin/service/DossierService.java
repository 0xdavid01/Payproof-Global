package com.example.payproof_admin.service;

import com.example.payproof_admin.dto.DisputeDossierView;
import com.example.payproof_admin.dto.JobRequirement;
import com.example.payproof_admin.model.*;
import com.example.payproof_admin.near.NearRpcClient;
import com.example.payproof_admin.repository.*;
import tools.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class DossierService {

    private final EscrowDisputeCaseRepository caseRepository;
    private final JobRepository jobRepository;
    private final DisputeProposalRepository proposalRepository;
    private final JobSubmissionReadRepository submissionRepository;
    private final SubmissionVersionReadRepository versionRepository;
    private final SubmissionReviewReadRepository reviewRepository;
    private final RequirementSnapshotReadRepository snapshotRepository;
    private final RequirementReviewReadRepository requirementReviewRepository;
    private final NearRpcClient nearRpcClient;
    private final R2StorageService r2;

    @Transactional(readOnly = true)
    public DisputeDossierView getDossier(String escrowId) {
        EscrowDisputeCase c = caseRepository.findByEscrowId(escrowId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "No dispute for escrow " + escrowId));

        JobModel job = jobRepository.findById(c.getJobId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Job not found: " + c.getJobId()));

        DisputeDossierView.CaseView caseView = new DisputeDossierView.CaseView(
                c.getId(), c.getEscrowId(), c.getJobId(),
                c.getType() != null ? c.getType().name() : null,
                c.getStatus(), c.getReason(),
                c.getTransactionHash(), c.getCreatedAt());

        DisputeDossierView.JobView jobView = buildJobView(job);
        List<DisputeDossierView.SubmissionView> subs = buildSubmissions(job.getJobId());

        JsonNode escrow = safeRpc(() -> nearRpcClient.getEscrow(escrowId));
        JsonNode proposal = safeRpc(() -> nearRpcClient.getDisputeProposal(escrowId));
        JsonNode split = safeRpc(() -> nearRpcClient.getSplitSettlement(escrowId));

        String localStatus = proposalRepository.findByEscrowId(escrowId)
                .map(p -> p.getStatus().name())
                .orElse(null);

        return new DisputeDossierView(
                caseView, jobView, subs,
                escrow, proposal, split, localStatus);
    }

    private DisputeDossierView.JobView buildJobView(JobModel job) {
        List<DisputeDossierView.RequirementView> reqs = job.getRequirements() == null
                ? List.of()
                : java.util.stream.IntStream.range(0, job.getRequirements().size())
                .mapToObj(i -> {
                    JobRequirement r = job.getRequirements().get(i);
                    return new DisputeDossierView.RequirementView(i, r.isDone(), r.getCondition());
                })
                .toList();

        String prdUrl = job.getPrdUrl();
        String contractUrl = job.getContractStorageId() != null
                ? r2.generateDownloadUrl(job.getContractStorageId())
                : job.getContractUrl();

        return new DisputeDossierView.JobView(
                job.getJobId(),
                job.getTitle(),
                job.getDescription(),
                job.getStatus() != null ? job.getStatus().name() : null,
                job.getBudget() != null ? job.getBudget().toPlainString() : null,
                job.getCurrency() != null ? job.getCurrency().name() : null,
                job.getDeadline(),
                prdUrl,
                contractUrl,
                job.getContractVersion(),
                job.getContractStatus() != null ? job.getContractStatus().name() : null,
                job.getClientApprovedContractVersion(),
                job.getFreelancerApprovedContractVersion(),
                reqs,
                partyView(job.getClient()),
                partyView(job.getFreelancer())
        );
    }

    private DisputeDossierView.PartyView partyView(UserModel u) {
        if (u == null) return null;
        String name = u.getDisplayName();
        if (name == null || name.isBlank()) {
            String n = String.join(" ",
                    u.getFirstName() == null ? "" : u.getFirstName(),
                    u.getLastName() == null ? "" : u.getLastName()).trim();
            name = n.isBlank() ? u.getEmail() : n;
        }
        return new DisputeDossierView.PartyView(u.getUserId(), u.getEmail(), name);
    }

    private List<DisputeDossierView.SubmissionView> buildSubmissions(String jobId) {
        Optional<JobSubmissionReadModel> submission = submissionRepository.findByJobId(jobId);
        if (submission.isEmpty()) return List.of();

        JobSubmissionReadModel sub = submission.get();
        List<SubmissionVersionReadModel> versions =
                versionRepository.findBySubmissionIdOrderByVersionNumberDesc(sub.getId());

        List<DisputeDossierView.VersionView> versionViews = versions.stream()
                .map(v -> buildVersionView(v))
                .toList();

        return List.of(new DisputeDossierView.SubmissionView(
                sub.getId(), sub.getStatus(), sub.getCurrentVersionNumber(), versionViews));
    }

    private DisputeDossierView.VersionView buildVersionView(SubmissionVersionReadModel v) {
        String downloadUrl = v.getStorageId() != null
                ? r2.generateDownloadUrl(v.getStorageId())
                : null;

        SubmissionReviewReadModel review = reviewRepository
                .findBySubmissionVersionId(v.getId()).orElse(null);

        DisputeDossierView.ReviewView reviewView = review == null ? null
                : new DisputeDossierView.ReviewView(
                review.getStatus(), review.getFeedback(),
                review.getReviewerId(), review.getTransactionHash(),
                review.getReviewedAt());

        List<RequirementSnapshotReadModel> snaps =
                snapshotRepository.findBySubmissionVersionIdOrderByRequirementPositionAsc(v.getId());

        List<DisputeDossierView.RequirementSnapshotView> reqViews = snaps.stream()
                .map(s -> {
                    RequirementReviewReadModel rr = requirementReviewRepository
                            .findByRequirementSnapshotId(s.getId()).orElse(null);
                    return new DisputeDossierView.RequirementSnapshotView(
                            s.getRequirementPosition(),
                            s.getCondition(),
                            s.isCompleted(),
                            rr != null ? rr.getStatus() : null,
                            rr != null ? rr.getFeedback() : null);
                })
                .sorted(Comparator.comparing(DisputeDossierView.RequirementSnapshotView::position))
                .toList();

        return new DisputeDossierView.VersionView(
                v.getId(), v.getVersionNumber(), v.getStatus(),
                v.getFileName(), v.getContentType(), v.getFileSizeBytes(),
                downloadUrl, v.getExternalUrl(), v.getNotes(),
                v.getSubmittedAt(), reviewView, reqViews);
    }

    private JsonNode safeRpc(java.util.function.Supplier<JsonNode> s) {
        try { return s.get(); } catch (Exception e) { return null; }
    }
}