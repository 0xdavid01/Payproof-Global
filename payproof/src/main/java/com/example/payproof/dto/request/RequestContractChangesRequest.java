package com.example.payproof.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class RequestContractChangesRequest {

    @NotBlank(message = "A reason for requesting contract changes is required")
    @Size(max = 2000, message = "Reason cannot exceed 2000 characters")
    private String reason;
}