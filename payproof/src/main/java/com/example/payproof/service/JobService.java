package com.example.payproof.service;

import com.example.payproof.components.IDGenerator;
import com.example.payproof.dto.JobRequirement;
import com.example.payproof.dto.request.ApproveChecklistRequest;
import com.example.payproof.dto.request.CreateJobRequest;
import com.example.payproof.dto.request.RequestContractChangesRequest;
import com.example.payproof.enums.ContractStatus;
import com.example.payproof.enums.InvitationStatus;
import com.example.payproof.enums.JobStatus;
import com.example.payproof.enums.UserRole;
import com.example.payproof.model.JobModel;
import com.example.payproof.model.UserModel;
import com.example.payproof.repository.JobRepository;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;

@Service
public class JobService {

    private final JobRepository jobRepository;
    private final IDGenerator idGenerator;

    public JobService(
            JobRepository jobRepository,
            IDGenerator idGenerator
    ) {
        this.jobRepository = jobRepository;
        this.idGenerator = idGenerator;
    }

    @Transactional
    public JobModel createJob(
            CreateJobRequest request,
            UserModel client
    ) {
        requireRole(client, UserRole.CLIENT);

        JobModel job = new JobModel();

        job.setJobId(idGenerator.generateJobId());
        job.setTitle(request.getTitle());
        job.setDescription(request.getDescription());
        job.setPrdUrl(request.getPrdUrl());
        job.setBudget(request.getBudget());
        job.setCurrency(request.getCurrency().trim().toUpperCase());
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

        return jobRepository.save(job);
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
                .toList();

        job.setRequirements(requirements);
        job.setChecklistApproved(true);
        job.setStatus(JobStatus.PENDING_FREELANCER_ACCEPTANCE);

        return jobRepository.save(job);
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

        return jobRepository.save(job);
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

        return jobRepository.save(job);
    }

    @Transactional
    public JobModel uploadContract(
            String jobId,
            String storageId,
            String url,
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

        if (storageId == null || storageId.isBlank()
                || url == null || url.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Contract storage ID and URL are required"
            );
        }

        if (job.getContractStatus() == ContractStatus.APPROVED) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "An approved contract cannot be replaced"
            );
        }

        if (job.getContractStatus() == ContractStatus.PENDING_CLIENT_REVIEW) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The current contract is awaiting client review"
            );
        }

        if (job.getContractStatus() == ContractStatus.PENDING_APPROVAL) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The current contract is awaiting final approval"
            );
        }

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

        return jobRepository.save(job);
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

        return jobRepository.save(job);
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

            if (!Integer.valueOf(currentVersion).equals(
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

        boolean clientApproved =
                Integer.valueOf(currentVersion).equals(
                        job.getClientApprovedContractVersion()
                );

        boolean freelancerApproved =
                Integer.valueOf(currentVersion).equals(
                        job.getFreelancerApprovedContractVersion()
                );

        if (clientApproved && freelancerApproved) {
            job.setContractApproved(true);
            job.setContractStatus(ContractStatus.APPROVED);
            job.setStatus(JobStatus.AGREEMENT_APPROVED);
        } else {
            job.setContractStatus(ContractStatus.PENDING_APPROVAL);
        }

        return jobRepository.save(job);
    }

    public List<JobModel> getClientJobs(UserModel client) {
        requireRole(client, UserRole.CLIENT);
        return jobRepository.findByClient(client);
    }

    public List<JobModel> getFreelancerJobs(UserModel freelancer) {
        requireRole(freelancer, UserRole.FREELANCER);
        return jobRepository.findByFreelancer(freelancer);
    }

    public JobModel getJob(
            String jobId,
            UserModel user
    ) {
        return getAccessibleJob(jobId, user);
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
                .equalsIgnoreCase(user.getEmail());

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
}