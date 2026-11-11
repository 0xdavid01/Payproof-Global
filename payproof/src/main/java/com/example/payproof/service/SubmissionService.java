
package com.example.payproof.service;

import com.example.payproof.dto.JobRequirement;
import com.example.payproof.dto.request.ReviewRequirementRequest;
import com.example.payproof.dto.request.ReviewSubmissionRequest;
import com.example.payproof.dto.response.SubmissionVersionResponse;
import com.example.payproof.enums.*;
import com.example.payproof.model.*;
import com.example.payproof.repository.*;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class SubmissionService {

    private final JobRepository jobRepository;
    private final JobSubmissionRepository jobSubmissionRepository;
    private final SubmissionVersionRepository submissionVersionRepository;
    private final SubmissionRequirementSnapshotRepository snapshotRepository;
    private final RequirementReviewRepository requirementReviewRepository;
    private final SubmissionReviewRepository submissionReviewRepository;
    private final R2StorageService storageService;
    private final NearTransactionVerifier nearTransactionVerifier;
    private final ActivityLogService activityLogService;
    private final ProjectEmailNotificationService emailNotificationService;

    public SubmissionService(
            JobRepository jobRepository,
            JobSubmissionRepository jobSubmissionRepository,
            SubmissionVersionRepository submissionVersionRepository,
            SubmissionRequirementSnapshotRepository snapshotRepository,
            RequirementReviewRepository requirementReviewRepository,
            SubmissionReviewRepository submissionReviewRepository,
            R2StorageService storageService,
            NearTransactionVerifier nearTransactionVerifier,
            ActivityLogService activityLogService,
            ProjectEmailNotificationService emailNotificationService
    ) {
        this.jobRepository = jobRepository;
        this.jobSubmissionRepository = jobSubmissionRepository;
        this.submissionVersionRepository = submissionVersionRepository;
        this.snapshotRepository = snapshotRepository;
        this.requirementReviewRepository = requirementReviewRepository;
        this.submissionReviewRepository = submissionReviewRepository;
        this.storageService = storageService;
        this.nearTransactionVerifier = nearTransactionVerifier;
        this.activityLogService = activityLogService;
        this.emailNotificationService = emailNotificationService;
    }

    @Transactional
    public SubmissionVersion submitWork(
            String jobId,
            MultipartFile file,
            String externalUrl,
            String notes,
            UserModel freelancer
    ) {
        requireRole(freelancer, UserRole.FREELANCER);

        JobModel job = getJob(jobId);

        if (job.getFreelancer() == null
                || !job.getFreelancer().getUserId()
                .equals(freelancer.getUserId())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "You are not assigned to this job"
            );
        }

        if (!job.isContractApproved()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The job contract has not been approved"
            );
        }

        if (job.getEscrowId() == null
                || job.getEscrowId().isBlank()
                || job.getEscrowCreationStatus() != EscrowCreationStatus.CONFIRMED) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The job escrow has not been confirmed"
            );
        }

        if (!job.isChecklistApproved()
                || job.getRequirements() == null
                || job.getRequirements().isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The approved checklist is unavailable"
            );
        }

        boolean hasFile = file != null && !file.isEmpty();
        boolean hasExternalUrl = externalUrl != null && !externalUrl.isBlank();

        if (!hasFile && !hasExternalUrl) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Upload a file or provide an external delivery URL"
            );
        }

        JobSubmission submission = jobSubmissionRepository
                .findByJob_JobId(jobId)
                .orElseGet(() -> {
                    JobSubmission created = new JobSubmission();
                    created.setJob(job);
                    created.setStatus(SubmissionStatus.NOT_SUBMITTED);
                    created.setCurrentVersionNumber(0);
                    return jobSubmissionRepository.save(created);
                });

        if (submission.getStatus() == SubmissionStatus.ACCEPTED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This job's submission has already been accepted"
            );
        }

        if (submission.getStatus() != SubmissionStatus.NOT_SUBMITTED
                && submission.getStatus() != SubmissionStatus.CHANGES_REQUESTED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "A submission is currently awaiting review"
            );
        }

        String storageId = null;

        try {
            if (hasFile) {
                storageId = storageService.uploadSubmissionFile(
                        file,
                        "jobs/" + jobId + "/submissions"
                );
            }

            int nextVersion = submission.getCurrentVersionNumber() + 1;

            SubmissionVersion version = new SubmissionVersion();
            version.setSubmission(submission);
            version.setVersionNumber(nextVersion);
            version.setStorageId(storageId);
            version.setFileName(hasFile ? file.getOriginalFilename() : null);
            version.setContentType(hasFile ? file.getContentType() : null);
            version.setFileSizeBytes(hasFile ? file.getSize() : null);
            version.setExternalUrl(
                    hasExternalUrl ? externalUrl.trim() : null
            );
            version.setNotes(notes);
            version.setStatus(SubmissionVersionStatus.SUBMITTED);

            List<SubmissionRequirementSnapshot> snapshots = new ArrayList<>();
            List<JobRequirement> requirements = job.getRequirements();

            for (int i = 0; i < requirements.size(); i++) {
                JobRequirement requirement = requirements.get(i);

                SubmissionRequirementSnapshot snapshot =
                        new SubmissionRequirementSnapshot();

                snapshot.setSubmissionVersion(version);
                snapshot.setRequirementPosition(i);
                snapshot.setCondition(requirement.getCondition());
                snapshot.setCompleted(requirement.isDone());

                snapshots.add(snapshot);
            }

            version.setRequirementSnapshots(snapshots);

            submission.setCurrentVersionNumber(nextVersion);
            submission.setStatus(SubmissionStatus.SUBMITTED);
            submission.getVersions().add(version);

            SubmissionVersion saved = submissionVersionRepository.save(version);
            activityLogService.record(
                    job,
                    freelancer,
                    "WORK_SUBMITTED",
                    "Submitted work version " + nextVersion + "."
            );
            emailNotificationService.notifyClientOfSubmission(job, saved);
            return saved;

        } catch (RuntimeException exception) {
            if (storageId != null) {
                try {
                    storageService.deleteFile(storageId);
                } catch (Exception cleanupException) {
                    exception.addSuppressed(cleanupException);
                }
            }

            throw exception;
        }
    }

    @Transactional
    public SubmissionReview reviewSubmission(
            String jobId,
            UUID versionId,
            ReviewSubmissionRequest request,
            UserModel client
    ) {
        requireRole(client, UserRole.CLIENT);

        JobModel job = getJobForUpdate(jobId);

        if (!job.getClient().getUserId().equals(client.getUserId())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Only the job client can review submissions"
            );
        }

        SubmissionVersion version = submissionVersionRepository
                .findByIdAndSubmission_Job_JobId(versionId, jobId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Submission version not found"
                ));

        if (version.getStatus() != SubmissionVersionStatus.SUBMITTED
                && version.getStatus() != SubmissionVersionStatus.UNDER_REVIEW) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This submission version is no longer available for review"
            );
        }

        if (request == null || request.getStatus() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "A review decision is required"
            );
        }

        List<SubmissionRequirementSnapshot> snapshots =
                snapshotRepository
                        .findBySubmissionVersion_IdOrderByRequirementPositionAsc(
                                versionId
                        );

        validateRequirementReviews(snapshots, request.getRequirements());

        boolean requirementReviewChanged = false;
        for (ReviewRequirementRequest item : request.getRequirements()) {
            SubmissionRequirementSnapshot snapshot = snapshots.stream()
                    .filter(s -> s.getRequirementPosition()
                            .equals(item.getRequirementPosition()))
                    .findFirst()
                    .orElseThrow();

            RequirementReview review = requirementReviewRepository
                    .findByRequirementSnapshot_Id(snapshot.getId())
                    .orElseGet(RequirementReview::new);

            if (review.getStatus() != item.getStatus()) {
                requirementReviewChanged = true;
            }
            review.setRequirementSnapshot(snapshot);
            review.setReviewer(client);
            review.setStatus(item.getStatus());
            review.setFeedback(item.getFeedback());
            review.setReviewedAt(LocalDateTime.now());

            requirementReviewRepository.save(review);
        }

        if (request.getStatus() == SubmissionReviewStatus.PENDING
                && requirementReviewChanged) {
            activityLogService.record(
                    job,
                    client,
                    "DELIVERY_REQUIREMENTS_REVIEWED",
                    "Updated delivery requirement review progress."
            );
        }

        if (request.getStatus() == SubmissionReviewStatus.ACCEPTED) {
            nearTransactionVerifier.verifyRelease(job, request.getTransactionHash());

            boolean allRequirementsAccepted = snapshots.stream()
                    .allMatch(snapshot ->
                            request.getRequirements().stream()
                                    .anyMatch(item ->
                                            item.getRequirementPosition()
                                                    .equals(snapshot.getRequirementPosition())
                                                    && item.getStatus()
                                                    == RequirementReviewStatus.ACCEPTED
                                    )
                    );

            if (!allRequirementsAccepted) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Every requirement must be accepted before approving the submission"
                );
            }
        }

        SubmissionReview review = submissionReviewRepository
                .findBySubmissionVersion_Id(versionId)
                .orElseGet(SubmissionReview::new);

        review.setSubmissionVersion(version);
        review.setReviewer(client);
        review.setStatus(request.getStatus());
        review.setFeedback(request.getFeedback());
        if (request.getStatus() == SubmissionReviewStatus.ACCEPTED) {
            review.setTransactionHash(request.getTransactionHash());
        }
        review.setReviewedAt(LocalDateTime.now());

        if (request.getStatus() == SubmissionReviewStatus.ACCEPTED) {
            version.setStatus(SubmissionVersionStatus.ACCEPTED);
            version.getSubmission().setStatus(SubmissionStatus.ACCEPTED);
            job.setStatus(JobStatus.COMPLETED);
            jobRepository.save(job);
        } else if (request.getStatus()
                == SubmissionReviewStatus.CHANGES_REQUESTED) {
            version.setStatus(SubmissionVersionStatus.CHANGES_REQUESTED);
            version.getSubmission().setStatus(SubmissionStatus.CHANGES_REQUESTED);
        }

        submissionVersionRepository.save(version);

        SubmissionReview savedReview = submissionReviewRepository.save(review);
        if (request.getStatus() == SubmissionReviewStatus.ACCEPTED) {
            activityLogService.record(
                    job,
                    client,
                    "DELIVERY_APPROVED",
                    "Approved delivery version " + version.getVersionNumber()
                            + " and confirmed payment release on NEAR."
            );
            emailNotificationService.notifyFreelancerOfPayout(job, version);
        } else if (request.getStatus()
                == SubmissionReviewStatus.CHANGES_REQUESTED) {
            activityLogService.record(
                    job,
                    client,
                    "DELIVERY_CHANGES_REQUESTED",
                    "Requested changes to delivery version " + version.getVersionNumber() + "."
            );
            emailNotificationService.notifyFreelancerOfRequestedChanges(
                    job,
                    request.getFeedback()
            );
        }
        return savedReview;
    }

    @Transactional
    public boolean reconcileReleasedEscrow(String jobId, UserModel user) {
        JobModel job = getJobForUpdate(jobId);
        boolean isClient = user != null
                && user.getRole() == UserRole.CLIENT
                && job.getClient().getUserId().equals(user.getUserId());
        boolean isFreelancer = user != null
                && user.getRole() == UserRole.FREELANCER
                && job.getFreelancer() != null
                && job.getFreelancer().getUserId().equals(user.getUserId());
        if (!isClient && !isFreelancer) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Only a job participant can reconcile its escrow"
            );
        }
        if (job.getStatus() == JobStatus.COMPLETED) {
            return true;
        }
        if (job.getEscrowId() == null
                || job.getEscrowId().isBlank()) {
            return false;
        }
        if (!nearTransactionVerifier.isEscrowReleased(job.getEscrowId())) {
            return false;
        }

        JobSubmission submission = jobSubmissionRepository
                .findByJob_JobId(jobId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "A released escrow has no saved work submission to complete"
                ));
        List<SubmissionVersion> versions =
                submissionVersionRepository
                        .findBySubmission_IdOrderByVersionNumberDesc(submission.getId());
        if (versions.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "A released escrow has no saved submission version to complete"
            );
        }

        SubmissionVersion version = versions.get(0);
        LocalDateTime reviewedAt = LocalDateTime.now();
        version.setStatus(SubmissionVersionStatus.ACCEPTED);
        submission.setStatus(SubmissionStatus.ACCEPTED);
        job.setStatus(JobStatus.COMPLETED);

        SubmissionReview review = submissionReviewRepository
                .findBySubmissionVersion_Id(version.getId())
                .orElseGet(SubmissionReview::new);
        review.setSubmissionVersion(version);
        review.setReviewer(job.getClient());
        review.setStatus(SubmissionReviewStatus.ACCEPTED);
        review.setReviewedAt(reviewedAt);

        List<SubmissionRequirementSnapshot> snapshots =
                snapshotRepository
                        .findBySubmissionVersion_IdOrderByRequirementPositionAsc(
                                version.getId()
                        );
        for (SubmissionRequirementSnapshot snapshot : snapshots) {
            RequirementReview requirementReview =
                    requirementReviewRepository
                            .findByRequirementSnapshot_Id(snapshot.getId())
                            .orElseGet(RequirementReview::new);
            requirementReview.setRequirementSnapshot(snapshot);
            requirementReview.setReviewer(job.getClient());
            requirementReview.setStatus(RequirementReviewStatus.ACCEPTED);
            requirementReview.setReviewedAt(reviewedAt);
            requirementReviewRepository.save(requirementReview);
        }

        jobRepository.save(job);
        jobSubmissionRepository.save(submission);
        submissionVersionRepository.save(version);
        submissionReviewRepository.save(review);
        activityLogService.record(
                job,
                job.getClient(),
                "DELIVERY_APPROVED",
                "Confirmed delivery version " + version.getVersionNumber()
                        + " and payment release on NEAR."
        );
        emailNotificationService.notifyFreelancerOfPayout(job, version);
        return true;
    }

    @Transactional
    public List<SubmissionVersionResponse> getSubmissions(
            String jobId,
            UserModel user
    ) {
        JobModel job = getJob(jobId);

        boolean isClient = user != null
                && user.getRole() == UserRole.CLIENT
                && job.getClient() != null
                && job.getClient().getUserId().equals(user.getUserId());
        boolean isFreelancer = user != null
                && user.getRole() == UserRole.FREELANCER
                && job.getFreelancer() != null
                && job.getFreelancer().getUserId().equals(user.getUserId());

        if (!isClient && !isFreelancer) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Only the client or assigned freelancer can view submissions"
            );
        }

        return jobSubmissionRepository.findByJob_JobId(jobId)
                .map(submission ->
                        submissionVersionRepository
                                .findBySubmission_IdOrderByVersionNumberDesc(
                                        submission.getId()
                                )
                )
                .orElseGet(List::of)
                .stream()
                .map(version -> new SubmissionVersionResponse(
                        version.getId(),
                        version.getVersionNumber(),
                        version.getStatus(),
                        version.getFileName(),
                        version.getFileSizeBytes(),
                        version.getStorageId() == null
                                ? null
                                : storageService.generateDownloadUrl(
                                        version.getStorageId()
                                ),
                        version.getExternalUrl(),
                        version.getNotes(),
                        version.getSubmittedAt(),
                        version.getReview() == null
                                ? null
                                : version.getReview().getFeedback(),
                        version.getReview() == null
                                ? null
                                : version.getReview().getReviewedAt(),
                        version.getReview() == null
                                ? null
                                : version.getReview().getTransactionHash(),
                        version.getRequirementSnapshots().stream()
                                .sorted(Comparator.comparing(
                                        SubmissionRequirementSnapshot::getRequirementPosition
                                ))
                                .map(snapshot ->
                                        new SubmissionVersionResponse.Requirement(
                                                snapshot.getRequirementPosition(),
                                                snapshot.getCondition(),
                                                snapshot.isCompleted(),
                                                snapshot.getReview() == null
                                                        ? RequirementReviewStatus.PENDING
                                                        : snapshot.getReview().getStatus()
                                        )
                                )
                                .toList()
                ))
                .toList();
    }

    private void validateRequirementReviews(
            List<SubmissionRequirementSnapshot> snapshots,
            List<ReviewRequirementRequest> reviews
    ) {
        if (reviews == null || reviews.size() != snapshots.size()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Every submitted requirement must be reviewed"
            );
        }

        Set<Integer> positions = new HashSet<>();

        for (ReviewRequirementRequest review : reviews) {
            if (review.getRequirementPosition() == null
                    || !positions.add(review.getRequirementPosition())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Requirement positions must be unique"
                );
            }

            boolean exists = snapshots.stream()
                    .anyMatch(snapshot ->
                            snapshot.getRequirementPosition()
                                    .equals(review.getRequirementPosition())
                    );

            if (!exists) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "An invalid requirement position was supplied"
                );
            }

            if (review.getStatus() == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "A review status is required for every requirement"
                );
            }

            if (review.getStatus() == RequirementReviewStatus.CHANGES_REQUESTED
                    && (review.getFeedback() == null
                    || review.getFeedback().isBlank())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Feedback is required when requesting changes"
                );
            }
        }
    }

    private JobModel getJob(String jobId) {
        return jobRepository.findById(jobId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Job not found"
                ));
    }

    private JobModel getJobForUpdate(String jobId) {
        return jobRepository.findByIdForUpdate(jobId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Job not found"
                ));
    }

    private void requireRole(UserModel user, UserRole role) {
        if (user == null || user.getRole() != role) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "You are not authorized to perform this action"
            );
        }
    }
    @Transactional
    public void confirmSplitAcceptance(String jobId, UserModel requester, String transactionHash) {
        JobModel job = jobRepository.findByIdForUpdate(jobId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found"));
        requireParticipant(job, requester);
        nearTransactionVerifier.verifySplitAcceptance(job, requester, transactionHash);
        activityLogService.record(job, requester, "SPLIT_ACCEPTED",
                "Accepted the dispute split proposal on NEAR.");
    }

    @Transactional
    public void confirmSplitRejection(String jobId, UserModel requester,
                                      String transactionHash, String reason) {
        JobModel job = jobRepository.findByIdForUpdate(jobId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found"));
        requireParticipant(job, requester);
        nearTransactionVerifier.verifySplitRejection(job, requester, transactionHash, reason);
        activityLogService.record(job, requester, "SPLIT_REJECTED",
                "Rejected the dispute split proposal on NEAR.");
    }

    @Transactional
    public void confirmSplitRevoke(String jobId, UserModel requester, String transactionHash) {
        JobModel job = jobRepository.findByIdForUpdate(jobId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Job not found"));
        requireParticipant(job, requester);
        nearTransactionVerifier.verifySplitRevoke(job, requester, transactionHash);
        activityLogService.record(job, requester, "SPLIT_ACCEPTANCE_REVOKED",
                "Revoked acceptance of the split proposal.");
    }

    private void requireParticipant(JobModel job, UserModel requester) {
        boolean isClient = job.getClient().getUserId().equals(requester.getUserId());
        boolean isFreelancer = job.getFreelancer() != null
                && job.getFreelancer().getUserId().equals(requester.getUserId());
        if (!isClient && !isFreelancer) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only project participants can perform this action");
        }
    }
}
