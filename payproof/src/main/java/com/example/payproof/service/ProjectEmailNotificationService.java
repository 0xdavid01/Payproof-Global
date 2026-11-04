package com.example.payproof.service;

import com.example.payproof.model.JobModel;
import com.example.payproof.model.SubmissionVersion;
import com.example.payproof.model.UserModel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectEmailNotificationService {

    private final ApplicationEventPublisher eventPublisher;

    @Value("${payproof.app-url:http://localhost:5173}")
    private String appUrl;

    public void notifyClientOfSubmission(
            JobModel job,
            SubmissionVersion version
    ) {
        publish(
                job.getClient(),
                "Work submitted: " + job.getTitle(),
                "A new version of the work for \"" + job.getTitle()
                        + "\" has been submitted and is ready for your review.",
                "Review submission",
                "/projects/" + job.getJobId() + "/submissions/" + version.getId()
        );
    }

    public void notifyFreelancerOfRequestedChanges(
            JobModel job,
            String feedback
    ) {
        UserModel freelancer = job.getFreelancer();
        if (freelancer == null) {
            log.warn(
                    "Cannot notify freelancer of requested changes because the job has no assigned freelancer. jobId={}",
                    job.getJobId()
            );
            return;
        }

        String message = "The client requested changes to the submission for \""
                + job.getTitle() + "\".";
        if (feedback != null && !feedback.isBlank()) {
            message += "\n\nClient feedback:\n" + feedback.trim();
        }

        publish(
                freelancer,
                "Changes requested: " + job.getTitle(),
                message,
                "Open project",
                "/projects/" + job.getJobId() + "/submission"
        );
    }

    public void notifyFreelancerOfPayout(
            JobModel job,
            SubmissionVersion version
    ) {
        UserModel freelancer = job.getFreelancer();
        if (freelancer == null) {
            log.warn(
                    "Cannot notify freelancer of payout because the job has no assigned freelancer. jobId={}",
                    job.getJobId()
            );
            return;
        }

        publish(
                freelancer,
                "Payment released: " + job.getTitle(),
                "The client approved version " + version.getVersionNumber()
                        + " of \"" + job.getTitle()
                        + "\" and the escrow payout has been confirmed on NEAR.",
                "View payment receipt",
                "/projects/" + job.getJobId() + "/receipt"
        );
    }

    private void publish(
            UserModel recipient,
            String subject,
            String message,
            String actionLabel,
            String actionPath
    ) {
        String baseUrl = appUrl == null ? "" : appUrl.replaceAll("/+$", "");
        eventPublisher.publishEvent(new ProjectEmailNotification(
                recipient.getEmail(),
                recipientName(recipient),
                subject,
                message,
                actionLabel,
                baseUrl + actionPath
        ));
    }

    private String recipientName(UserModel user) {
        if (user.getDisplayName() != null && !user.getDisplayName().isBlank()) {
            return user.getDisplayName();
        }

        String fullName = String.join(
                " ",
                user.getFirstName() == null ? "" : user.getFirstName(),
                user.getLastName() == null ? "" : user.getLastName()
        ).trim();
        return fullName.isBlank() ? "there" : fullName;
    }
}
