package com.example.payproof.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateEscrowRequest {

    @NotBlank(message = "Job ID is required")
    private String jobId;
}