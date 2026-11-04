package com.example.payproof.service;

import com.example.payproof.dto.response.ActivityLogResponse;
import com.example.payproof.model.ActivityLogEvent;
import com.example.payproof.model.JobModel;
import com.example.payproof.model.UserModel;
import com.example.payproof.repository.ActivityLogEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ActivityLogService {

    private final ActivityLogEventRepository activityLogEventRepository;

    @Transactional
    public void record(
            JobModel job,
            UserModel actor,
            String action,
            String summary
    ) {
        ActivityLogEvent event = new ActivityLogEvent();
        event.setJob(job);
        event.setActor(actor);
        event.setAction(action);
        event.setSummary(summary);
        activityLogEventRepository.save(event);
    }

    @Transactional(readOnly = true)
    public List<ActivityLogResponse> getForParticipant(UserModel participant) {
        return activityLogEventRepository
                .findAllVisibleToParticipant(
                        participant.getUserId(),
                        participant.getEmail()
                )
                .stream()
                .map(event -> new ActivityLogResponse(
                        event.getId(),
                        event.getJob().getJobId(),
                        event.getJob().getTitle(),
                        event.getAction(),
                        event.getSummary(),
                        displayName(event.getActor()),
                        event.getActor().getRole().name(),
                        event.getCreatedAt()
                ))
                .toList();
    }

    private String displayName(UserModel user) {
        if (user.getDisplayName() != null && !user.getDisplayName().isBlank()) {
            return user.getDisplayName();
        }

        String name = String.join(
                " ",
                user.getFirstName() == null ? "" : user.getFirstName(),
                user.getLastName() == null ? "" : user.getLastName()
        ).trim();
        return name.isBlank() ? user.getEmail() : name;
    }
}
