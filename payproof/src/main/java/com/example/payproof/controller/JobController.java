
package com.example.payproof.controller;

import com.example.payproof.dto.request.*;
import com.example.payproof.dto.response.ContractDownloadUrlResponse;
import com.example.payproof.model.JobModel;
import com.example.payproof.model.UserModel;
import com.example.payproof.repository.UserRepository;
import com.example.payproof.security.CustomUserPrincipal;
import com.example.payproof.service.JobService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/jobs")
public class JobController {

    private final JobService jobService;
    private final UserRepository userRepository;

    public JobController(
            JobService jobService,
            UserRepository userRepository
    ) {
        this.jobService = jobService;
        this.userRepository = userRepository;
    }

    private UserModel getAuthenticatedUser(CustomUserPrincipal principal) {
        if (principal == null) {
            throw new org.springframework.security.authentication.AuthenticationCredentialsNotFoundException(
                    "Authentication is required"
            );
        }

        return userRepository.findById(principal.getUserId())
                .orElseThrow(() ->
                        new org.springframework.security.core.userdetails.UsernameNotFoundException(
                                "Authenticated user account was not found"
                        )
                );
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public JobModel createJob(
            @Valid @RequestBody CreateJobRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return jobService.createJob(request, getAuthenticatedUser(principal));
    }

    @PostMapping(
            value = "/{jobId}/prd",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public JobModel uploadPrd(
            @PathVariable String jobId,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return jobService.uploadPrd(
                jobId, file, getAuthenticatedUser(principal)
        );
    }

    @PutMapping("/{jobId}/checklist/approve")
    public JobModel approveChecklist(
            @PathVariable String jobId,
            @Valid @RequestBody ApproveChecklistRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return jobService.approveChecklist(
                jobId, request, getAuthenticatedUser(principal)
        );
    }

    @PostMapping("/{jobId}/invitation/accept")
    public JobModel acceptInvitation(
            @PathVariable String jobId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return jobService.acceptInvitation(
                jobId, getAuthenticatedUser(principal)
        );
    }

    @PostMapping("/{jobId}/invitation/decline")
    public JobModel declineInvitation(
            @PathVariable String jobId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return jobService.declineInvitation(
                jobId, getAuthenticatedUser(principal)
        );
    }

    @PostMapping(
            value = "/{jobId}/contract",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public JobModel uploadContract(
            @PathVariable String jobId,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return jobService.uploadContract(
                jobId, file, getAuthenticatedUser(principal)
        );
    }

    @PostMapping("/{jobId}/contract/request-changes")
    public JobModel requestContractChanges(
            @PathVariable String jobId,
            @Valid @RequestBody RequestContractChangesRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return jobService.requestContractChanges(
                jobId, request, getAuthenticatedUser(principal)
        );
    }

    @PostMapping("/{jobId}/contract/approve")
    public JobModel approveContract(
            @PathVariable String jobId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return jobService.approveContract(
                jobId, getAuthenticatedUser(principal)
        );
    }

    @GetMapping("/client")
    public List<JobModel> getClientJobs(
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return jobService.getClientJobs(getAuthenticatedUser(principal));
    }

    @GetMapping("/freelancer")
    public List<JobModel> getFreelancerJobs(
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return jobService.getFreelancerJobs(getAuthenticatedUser(principal));
    }

    @GetMapping("/{jobId}")
    public JobModel getJob(
            @PathVariable String jobId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return jobService.getJob(
                jobId, getAuthenticatedUser(principal)
        );
    }

    @GetMapping("/{jobId}/contract/download-url")
    public ContractDownloadUrlResponse getContractDownloadUrl(
            @PathVariable String jobId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return jobService.getContractDownloadUrl(
                jobId, getAuthenticatedUser(principal)
        );
    }

    @PutMapping("/{jobId}/financial-terms")
    public ResponseEntity<JobModel> updateFinancialTerms(
            @PathVariable String jobId,
            @Valid @RequestBody UpdateJobFinancialTermsRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        UserModel client = getAuthenticatedUser(principal);

        JobModel updatedJob = jobService.updateJobFinancialTerms(
                jobId,
                request.getBudget(),
                request.getCurrency(),
                client
        );

        return ResponseEntity.ok(updatedJob);
    }
    @PutMapping("/{jobId}/checklist/progress")
    public JobModel updateChecklistProgress(
            @PathVariable String jobId,
            @Valid @RequestBody UpdateChecklistProgressRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return jobService.updateChecklistProgress(
                jobId,
                request,
                getAuthenticatedUser(principal)
        );
    }
}
