package com.example.payproof.dto.request;

import com.example.payproof.enums.RequirementReviewStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ReviewRequirementRequest {

    @NotNull
    private Integer requirementPosition;

    @NotNull
    private RequirementReviewStatus status;

    @Size(max = 10000)
    private String feedback;
}