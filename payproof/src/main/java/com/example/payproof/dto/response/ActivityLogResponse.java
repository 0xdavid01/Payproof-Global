package com.example.payproof.dto.response;

import java.time.LocalDateTime;
import java.util.UUID;

public record ActivityLogResponse(
        UUID id,
        String jobId,
        String projectTitle,
        String action,
        String summary,
        String actorName,
        String actorRole,
        LocalDateTime occurredAt
) {
}
