package com.example.payproof.dto.request;

import com.example.payproof.enums.SubmissionReviewStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class ReviewSubmissionRequest {

    @NotNull
    private SubmissionReviewStatus status;

    @Size(max = 10000)
    private String feedback;

    @Size(max = 128)
    private String transactionHash;

    @Valid
    private List<ReviewRequirementRequest> requirements;
}