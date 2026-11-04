package com.example.payproof.dto.request;

import com.example.payproof.dto.JobRequirement;
import jakarta.validation.constraints.NotEmpty;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class UpdateChecklistProgressRequest {

    @NotEmpty(message = "The checklist cannot be empty")
    private List<JobRequirement> requirements;
}