package com.example.payproof.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ConfirmEscrowRequest {

    @NotBlank
    private String jobId;

    @NotBlank
    private String transactionHash;
}