package com.example.payproof.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateSubmissionRequest {

    private String externalUrl;

    @Size(max = 10000)
    private String notes;
}