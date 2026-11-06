package com.example.payproof.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateEscrowCaseRequest {

    @NotBlank
    private String transactionHash;

    @NotBlank
    @Size(max = 500)
    private String reason;
}
