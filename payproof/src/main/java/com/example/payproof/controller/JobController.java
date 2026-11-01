package com.example.payproof.controller;

import com.example.payproof.dto.request.ApproveChecklistRequest;
import com.example.payproof.dto.request.CreateJobRequest;
import com.example.payproof.model.JobModel;
import com.example.payproof.model.UserModel;
import com.example.payproof.service.JobService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/jobs")
public class JobController {

    private final JobService jobService;

    public JobController(JobService jobService) {
        this.jobService = jobService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public JobModel createJob(
            @Valid @RequestBody CreateJobRequest request,
            @AuthenticationPrincipal UserModel client
    ) {
        return jobService.createJob(request, client);
    }

    @PutMapping("/{jobId}/checklist/approve")
    public JobModel approveChecklist(
            @PathVariable String jobId,
            @Valid @RequestBody ApproveChecklistRequest request,
            @AuthenticationPrincipal UserModel client
    ) {
        return jobService.approveChecklist(
                jobId,
                request,
                client
        );
    }

    @PostMapping("/{jobId}/invitation/accept")
    public JobModel acceptInvitation(
            @PathVariable String jobId,
            @AuthenticationPrincipal UserModel freelancer
    ) {
        return jobService.acceptInvitation(jobId, freelancer);
    }

    @PostMapping("/{jobId}/invitation/decline")
    public JobModel declineInvitation(
            @PathVariable String jobId,
            @AuthenticationPrincipal UserModel freelancer
    ) {
        return jobService.declineInvitation(jobId, freelancer);
    }

    @GetMapping("/client")
    public List<JobModel> getClientJobs(
            @AuthenticationPrincipal UserModel client
    ) {
        return jobService.getClientJobs(client);
    }

    @GetMapping("/freelancer")
    public List<JobModel> getFreelancerJobs(
            @AuthenticationPrincipal UserModel freelancer
    ) {
        return jobService.getFreelancerJobs(freelancer);
    }

    @GetMapping("/{jobId}")
    public JobModel getJob(
            @PathVariable String jobId,
            @AuthenticationPrincipal UserModel user
    ) {
        return jobService.getJob(jobId, user);
    }
}