
package com.example.payproof.controller;

import com.example.payproof.dto.request.ReviewSubmissionRequest;
import com.example.payproof.dto.response.SubmissionVersionResponse;
import com.example.payproof.model.SubmissionReview;
import com.example.payproof.model.SubmissionVersion;
import com.example.payproof.model.UserModel;
import com.example.payproof.repository.UserRepository;
import com.example.payproof.security.CustomUserPrincipal;
import com.example.payproof.service.SubmissionService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/jobs/{jobId}/submissions")
public class SubmissionController {

    private final SubmissionService submissionService;
    private final UserRepository userRepository;

    public SubmissionController(
            SubmissionService submissionService,
            UserRepository userRepository
    ) {
        this.submissionService = submissionService;
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

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public SubmissionVersion submitWork(
            @PathVariable String jobId,
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "externalUrl", required = false) String externalUrl,
            @RequestParam(value = "notes", required = false) String notes,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return submissionService.submitWork(
                jobId,
                file,
                externalUrl,
                notes,
                getAuthenticatedUser(principal)
        );
    }

    @GetMapping
    public List<SubmissionVersionResponse> getSubmissions(
            @PathVariable String jobId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return submissionService.getSubmissions(
                jobId,
                getAuthenticatedUser(principal)
        );
    }

    @PostMapping(
            value = "/{versionId}/review",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public SubmissionReview reviewSubmission(
            @PathVariable String jobId,
            @PathVariable UUID versionId,
            @Valid @RequestBody ReviewSubmissionRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return submissionService.reviewSubmission(
                jobId,
                versionId,
                request,
                getAuthenticatedUser(principal)
        );
    }
}
