
package com.example.payproof.service;

import com.example.payproof.components.IDGenerator;
import com.example.payproof.dto.JobRequirement;
import com.example.payproof.dto.request.ApproveChecklistRequest;
import com.example.payproof.dto.request.CreateJobRequest;
import com.example.payproof.dto.request.RequestContractChangesRequest;
import com.example.payproof.dto.request.UpdateChecklistProgressRequest;
import com.example.payproof.dto.response.ContractDownloadUrlResponse;
import com.example.payproof.enums.ContractStatus;
import com.example.payproof.enums.InvitationStatus;
import com.example.payproof.enums.JobStatus;
import com.example.payproof.enums.PaymentCurrency;
import com.example.payproof.enums.UserRole;
import com.example.payproof.model.JobModel;
import com.example.payproof.model.UserModel;
import com.example.payproof.repository.JobRepository;
import jakarta.transaction.Transactional;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
public class JobService {

    private static final Logger log =
            LoggerFactory.getLogger(JobService.class);

    private final JobRepository jobRepository;
    private final IDGenerator idGenerator;
    private final R2StorageService r2StorageService;
    private final DeepSeekService deepSeekService;
    private final ActivityLogService activityLogService;

    public JobService(
            JobRepository jobRepository,
            IDGenerator idGenerator,
            R2StorageService r2StorageService,
            DeepSeekService deepSeekService,
            ActivityLogService activityLogService
    ) {
        this.jobRepository = jobRepository;
        this.idGenerator = idGenerator;
        this.r2StorageService = r2StorageService;
        this.deepSeekService = deepSeekService;
        this.activityLogService = activityLogService;
    }

    @Transactional
    public JobModel createJob(
            CreateJobRequest request,
            UserModel client
    ) {
        requireRole(client, UserRole.CLIENT);

        if (request.getBudget() == null
                || request.getBudget().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Job budget must be greater than zero"
            );
        }

        if (request.getCurrency() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Job currency is required"
            );
        }

        if (request.getDeadline() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Job deadline is required"
            );
        }

        if (request.getParticipantEmail() == null
                || request.getParticipantEmail().isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Freelancer email is required"
            );
        }

        JobModel job = new JobModel();

        job.setJobId(idGenerator.generateJobId());
        job.setTitle(request.getTitle());
        job.setDescription(request.getDescription());
        job.setPrdUrl(null);
        job.setBudget(request.getBudget());
        job.setCurrency(request.getCurrency());
        job.setDeadline(request.getDeadline());

        job.setParticipantEmail(
                request.getParticipantEmail().trim().toLowerCase()
        );

        job.setInvitationStatus(InvitationStatus.PENDING);
        job.setChecklistApproved(false);
        job.setRequirements(new ArrayList<>());
        job.setStatus(JobStatus.OPEN);
        job.setContractStatus(ContractStatus.NOT_UPLOADED);
        job.setContractVersion(0);
        job.setContractApproved(false);
        job.setClient(client);

        JobModel saved = jobRepository.save(job);
        activityLogService.record(
                saved, client, "PROJECT_CREATED", "Created the project and invited a freelancer."
        );
        return saved;
    }

    @Transactional
    public JobModel uploadPrd(
            String jobId,
            MultipartFile file,
            UserModel client
    ) {
        requireRole(client, UserRole.CLIENT);

        JobModel job = getClientJob(jobId, client);

        if (job.getStatus() != JobStatus.OPEN) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "PRD can only be uploaded while the job is open"
            );
        }

        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Please upload a PRD PDF"
            );
        }

        String storageId = null;

        try {
            storageId = r2StorageService.uploadPdf(
                    file,
                    "jobs/" + jobId + "/prd"
            );

            byte[] pdfBytes = r2StorageService.downloadFile(storageId);

            String prdText = extractPdfText(pdfBytes);

            if (prdText.isBlank()) {
                throw new IllegalArgumentException(
                        "No readable text was found in the PRD PDF"
                );
            }

            List<JobRequirement> requirements =
                    deepSeekService.generateChecklist(prdText);

            job.setPrdStorageId(storageId);
            job.setPrdUrl(r2StorageService.getFileUrl(storageId));
            job.setRequirements(requirements);
            job.setChecklistApproved(false);

            JobModel saved = jobRepository.save(job);
            activityLogService.record(
                    saved, client, "PRD_UPLOADED", "Uploaded the project brief and generated its requirements checklist."
            );
            return saved;

        } catch (Exception exception) {

            log.error(
                    "PRD upload or checklist generation failed for job {}",
                    jobId,
                    exception
            );

            if (storageId != null) {
                try {
                    r2StorageService.deleteFile(storageId);
                } catch (Exception cleanupException) {
                    log.warn(
                            "Failed to clean up R2 object {} after PRD upload failure",
                            storageId,
                            cleanupException
                    );
                    exception.addSuppressed(cleanupException);
                }
            }

            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "PRD upload or automatic checklist generation failed. Please try again.",
                    exception
            );
        }
    }

    private String extractPdfText(byte[] pdfBytes) throws IOException {

        try (PDDocument document = Loader.loadPDF(pdfBytes)) {

            if (document.isEncrypted()) {
                throw new IllegalArgumentException(
                        "Encrypted PRD PDFs are not supported"
                );
            }

            PDFTextStripper stripper = new PDFTextStripper();
            return stripper.getText(document).trim();
        }
    }

    @Transactional
    public JobModel approveChecklist(
            String jobId,
            ApproveChecklistRequest request,
            UserModel client
    ) {
        requireRole(client, UserRole.CLIENT);

        JobModel job = getClientJob(jobId, client);

        if (job.getStatus() != JobStatus.OPEN) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Checklist cannot be changed at this stage"
            );
        }

        if (request.getRequirements() == null
                || request.getRequirements().isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The checklist cannot be empty"
            );
        }

        List<JobRequirement> requirements = request.getRequirements()
                .stream()
                .map(requirement -> {
                    if (requirement.getCondition() == null
                            || requirement.getCondition().isBlank()) {
                        throw new ResponseStatusException(
                                HttpStatus.BAD_REQUEST,
                                "Every requirement must have a condition"
                        );
                    }

                    return new JobRequirement(
                            false,
                            requirement.getCondition().trim()
                    );
                })
                .collect(Collectors.toCollection(ArrayList::new));

        job.setRequirements(requirements);
        job.setChecklistApproved(true);
        job.setStatus(JobStatus.PENDING_FREELANCER_ACCEPTANCE);

        JobModel saved = jobRepository.save(job);
        activityLogService.record(
                saved, client, "CHECKLIST_APPROVED", "Approved the project requirements checklist."
        );
        return saved;
    }

    @Transactional
    public JobModel acceptInvitation(
            String jobId,
            UserModel freelancer
    ) {
        requireRole(freelancer, UserRole.FREELANCER);

        JobModel job = getInvitedJob(jobId, freelancer);

        if (job.getInvitationStatus() != InvitationStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "This invitation is no longer pending"
            );
        }

        if (!job.isChecklistApproved()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The client has not approved the checklist"
            );
        }

        job.setFreelancer(freelancer);
        job.setInvitationStatus(InvitationStatus.ACCEPTED);
        job.setStatus(JobStatus.PENDING_AGREEMENT);

        JobModel saved = jobRepository.save(job);
        activityLogService.record(
                saved, freelancer, "INVITATION_ACCEPTED", "Accepted the project invitation."
        );
        return saved;
    }

    @Transactional
    public JobModel declineInvitation(
            String jobId,
            UserModel freelancer
    ) {
        requireRole(freelancer, UserRole.FREELANCER);

        JobModel job = getInvitedJob(jobId, freelancer);

        if (job.getInvitationStatus() != InvitationStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "This invitation is no longer pending"
            );
        }

        job.setInvitationStatus(InvitationStatus.DECLINED);

        JobModel saved = jobRepository.save(job);
        activityLogService.record(
                saved, freelancer, "INVITATION_DECLINED", "Declined the project invitation."
        );
        return saved;
    }

    @Transactional
    public JobModel uploadContract(
            String jobId,
            MultipartFile file,
            UserModel freelancer
    ) {
        requireRole(freelancer, UserRole.FREELANCER);

        JobModel job = getAssignedJob(jobId, freelancer);

        if (job.getStatus() != JobStatus.PENDING_AGREEMENT) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Contract cannot be uploaded at this stage"
            );
        }

        if (job.getContractStatus() == ContractStatus.APPROVED
                || job.getContractStatus() == ContractStatus.PENDING_CLIENT_REVIEW
                || job.getContractStatus() == ContractStatus.PENDING_APPROVAL) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The current contract cannot be replaced at this stage"
            );
        }

        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Please upload a contract PDF"
            );
        }

        String storageId = r2StorageService.uploadPdf(
                file,
                "jobs/" + jobId + "/contracts"
        );

        String url = r2StorageService.getFileUrl(storageId);

        int nextVersion = job.getContractVersion() == null
                ? 1
                : job.getContractVersion() + 1;

        job.setContractStorageId(storageId);
        job.setContractUrl(url);
        job.setContractVersion(nextVersion);

        job.setContractApproved(false);
        job.setClientApprovedContractVersion(null);
        job.setFreelancerApprovedContractVersion(null);

        job.setContractChangeReason(null);
        job.setContractStatus(ContractStatus.PENDING_CLIENT_REVIEW);

        JobModel saved = jobRepository.save(job);
        activityLogService.record(
                saved,
                freelancer,
                "AGREEMENT_UPLOADED",
                "Uploaded agreement version " + nextVersion + "."
        );
        return saved;
    }

    @Transactional
    public JobModel requestContractChanges(
            String jobId,
            RequestContractChangesRequest request,
            UserModel client
    ) {
        requireRole(client, UserRole.CLIENT);

        JobModel job = getClientJob(jobId, client);

        if (job.getContractStorageId() == null
                || job.getContractVersion() == null
                || job.getContractVersion() < 1) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "No contract has been uploaded yet"
            );
        }

        if (job.getContractStatus() != ContractStatus.PENDING_CLIENT_REVIEW) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Contract changes cannot be requested at this stage"
            );
        }

        if (request == null
                || request.getReason() == null
                || request.getReason().isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "A reason for requesting contract changes is required"
            );
        }

        job.setContractChangeReason(request.getReason().trim());
        job.setClientApprovedContractVersion(null);
        job.setFreelancerApprovedContractVersion(null);
        job.setContractApproved(false);
        job.setContractStatus(ContractStatus.CHANGES_REQUESTED);

        JobModel saved = jobRepository.save(job);
        activityLogService.record(
                saved, client, "AGREEMENT_CHANGES_REQUESTED", "Requested changes to the agreement."
        );
        return saved;
    }

    @Transactional
    public JobModel approveContract(
            String jobId,
            UserModel user
    ) {
        JobModel job = getAccessibleJob(jobId, user);

        if (job.getStatus() != JobStatus.PENDING_AGREEMENT) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Contract approval is not available at this stage"
            );
        }

        if (job.getContractStorageId() == null
                || job.getContractVersion() == null
                || job.getContractVersion() < 1) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The freelancer has not uploaded a contract"
            );
        }

        if (job.getContractStatus() != ContractStatus.PENDING_CLIENT_REVIEW
                && job.getContractStatus() != ContractStatus.PENDING_APPROVAL) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The contract is not available for approval"
            );
        }

        int currentVersion = job.getContractVersion();

        if (isClient(job, user)) {

            job.setClientApprovedContractVersion(currentVersion);

        } else if (isFreelancer(job, user)) {

            if (!Objects.equals(
                    currentVersion,
                    job.getClientApprovedContractVersion())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "The client must review and accept the contract first"
                );
            }

            job.setFreelancerApprovedContractVersion(currentVersion);

        } else {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "You are not a participant in this job"
            );
        }

        boolean clientApproved = Objects.equals(
                currentVersion,
                job.getClientApprovedContractVersion()
        );

        boolean freelancerApproved = Objects.equals(
                currentVersion,
                job.getFreelancerApprovedContractVersion()
        );

        if (clientApproved && freelancerApproved) {
            job.setContractApproved(true);
            job.setContractStatus(ContractStatus.APPROVED);
            job.setStatus(JobStatus.AGREEMENT_APPROVED);
        } else {
            job.setContractStatus(ContractStatus.PENDING_APPROVAL);
        }

        JobModel saved = jobRepository.save(job);
        activityLogService.record(
                saved, user, "AGREEMENT_APPROVED", "Approved agreement version " + currentVersion + "."
        );
        return saved;
    }

    public List<JobModel> getClientJobs(UserModel client) {
        requireRole(client, UserRole.CLIENT);
        return jobRepository.findByClient(client);
    }

    public List<JobModel> getFreelancerJobs(UserModel freelancer) {
        requireRole(freelancer, UserRole.FREELANCER);

        return jobRepository
                .findByFreelancerOrParticipantEmailIgnoreCase(
                        freelancer,
                        freelancer.getEmail()
                )
                .stream()
                .filter(job ->
                        job.getInvitationStatus() != InvitationStatus.DECLINED
                                && job.getInvitationStatus() != InvitationStatus.EXPIRED
                )
                .toList();
    }

    public JobModel getJob(
            String jobId,
            UserModel user
    ) {
        return getAccessibleJob(jobId, user);
    }

    public ContractDownloadUrlResponse getContractDownloadUrl(
            String jobId,
            UserModel user
    ) {
        JobModel job = getAccessibleJob(jobId, user);

        if (job.getContractStorageId() == null
                || job.getContractStorageId().isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Agreement PDF not found"
            );
        }

        return new ContractDownloadUrlResponse(
                r2StorageService.generateDownloadUrl(job.getContractStorageId())
        );
    }

    private JobModel getAccessibleJob(
            String jobId,
            UserModel user
    ) {
        JobModel job = jobRepository.findById(jobId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Job not found"
                ));

        boolean client = isClient(job, user);
        boolean freelancer = isFreelancer(job, user);

        boolean invited = job.getParticipantEmail() != null
                && user != null
                && job.getParticipantEmail()
                .equalsIgnoreCase(user.getEmail())
                && job.getInvitationStatus() == InvitationStatus.PENDING;

        if (!client && !freelancer && !invited) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "You do not have access to this job"
            );
        }

        return job;
    }

    private JobModel getClientJob(
            String jobId,
            UserModel client
    ) {
        return jobRepository.findByJobIdAndClient(jobId, client)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Job not found"
                ));
    }

    private JobModel getInvitedJob(
            String jobId,
            UserModel freelancer
    ) {
        return jobRepository
                .findByJobIdAndParticipantEmailIgnoreCase(
                        jobId,
                        freelancer.getEmail()
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Invitation not found for this account"
                ));
    }

    private JobModel getAssignedJob(
            String jobId,
            UserModel freelancer
    ) {
        JobModel job = jobRepository.findById(jobId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Job not found"
                ));

        if (!isFreelancer(job, freelancer)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "You are not assigned to this job"
            );
        }

        return job;
    }

    private boolean isClient(
            JobModel job,
            UserModel user
    ) {
        return user != null
                && job.getClient().getUserId().equals(user.getUserId());
    }

    private boolean isFreelancer(
            JobModel job,
            UserModel user
    ) {
        return user != null
                && job.getFreelancer() != null
                && job.getFreelancer().getUserId()
                .equals(user.getUserId());
    }

    private void requireRole(
            UserModel user,
            UserRole role
    ) {
        if (user == null || user.getRole() != role) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "You are not authorized to perform this action"
            );
        }
    }

    @Transactional
    public JobModel updateJobFinancialTerms(
            String jobId,
            BigDecimal budget,
            PaymentCurrency currency,
            UserModel client
    ) {
        requireRole(client, UserRole.CLIENT);

        JobModel job = getClientJob(jobId, client);

        if (job.isContractApproved()
                || job.getStatus() == JobStatus.AGREEMENT_APPROVED) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Job financial terms cannot be changed after both parties approve the contract"
            );
        }

        if (budget == null || budget.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Budget must be greater than zero"
            );
        }

        if (currency == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Currency is required"
            );
        }

        job.setBudget(budget);
        job.setCurrency(currency);

        // A changed financial agreement requires a fresh contract approval.
        if (job.getContractVersion() != null
                && job.getContractVersion() > 0) {

            job.setClientApprovedContractVersion(null);
            job.setFreelancerApprovedContractVersion(null);
            job.setContractApproved(false);

            job.setContractStatus(ContractStatus.CHANGES_REQUESTED);
            job.setContractChangeReason(
                    "Financial terms have changed. Please upload and approve an updated contract."
            );

            job.setStatus(JobStatus.PENDING_AGREEMENT);
        }

        JobModel saved = jobRepository.save(job);
        activityLogService.record(
                saved,
                client,
                "FINANCIAL_TERMS_UPDATED",
                "Updated the project budget to " + budget.toPlainString() + " " + currency.name() + "."
        );
        return saved;
    }

    @Transactional
    public JobModel updateChecklistProgress(
            String jobId,
            UpdateChecklistProgressRequest request,
            UserModel client
    ) {
        requireRole(client, UserRole.CLIENT);

        JobModel job = getClientJob(jobId, client);

        if (!job.isChecklistApproved()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The checklist has not been approved yet"
            );
        }

        List<JobRequirement> current = job.getRequirements();

        if (current == null || current.isEmpty()
                || request == null
                || request.getRequirements() == null
                || request.getRequirements().size() != current.size()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The submitted checklist does not match the approved checklist"
            );
        }

        List<JobRequirement> updated = new ArrayList<>();

        for (int i = 0; i < current.size(); i++) {
            JobRequirement existing = current.get(i);
            JobRequirement submitted = request.getRequirements().get(i);

            if (existing == null
                    || submitted == null
                    || !Objects.equals(
                            existing.getCondition(),
                            submitted.getCondition()
                    )) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "The submitted requirements must match the approved checklist"
                );
            }

            updated.add(new JobRequirement(
                    submitted.isDone(),
                    existing.getCondition()
            ));
        }

        boolean changed = false;
        for (int i = 0; i < current.size(); i++) {
            if (current.get(i).isDone() != updated.get(i).isDone()) {
                changed = true;
                break;
            }
        }

        job.setRequirements(updated);
        JobModel saved = jobRepository.save(job);
        if (changed) {
            activityLogService.record(
                    saved, client, "CHECKLIST_PROGRESS_UPDATED", "Updated project checklist progress."
            );
        }
        return saved;
    }
}
