package com.example.payproof.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ConfirmSplitActionRequest(
        @NotBlank @Size(max = 128) String transactionHash,
        @Size(max = 500) String reason      // only used for reject
) {}