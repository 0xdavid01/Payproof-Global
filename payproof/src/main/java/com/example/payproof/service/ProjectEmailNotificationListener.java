package com.example.payproof.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Slf4j
@Component
@RequiredArgsConstructor
public class ProjectEmailNotificationListener {

    private final ResendEmailService emailService;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void send(ProjectEmailNotification notification) {
        if (notification.recipientEmail() == null
                || notification.recipientEmail().isBlank()) {
            log.warn(
                    "Email notification was not sent because the recipient address is empty. subject={}",
                    notification.subject()
            );
            return;
        }

        String text = "Hello " + notification.recipientName() + ",\n\n"
                        + notification.message()
                        + "\n\n" + notification.actionLabel() + ":\n"
                        + notification.actionUrl()
                        + "\n\nPayProof";

        try {
            emailService.send(
                    notification.recipientEmail(),
                    notification.subject(),
                    text,
                    null
            );
            log.info(
                    "Project email notification sent. recipient={}, subject={}",
                    notification.recipientEmail(),
                    notification.subject()
            );
        } catch (RestClientException | IllegalStateException exception) {
            log.error(
                    "Could not send project email notification. recipient={}, subject={}",
                    notification.recipientEmail(),
                    notification.subject(),
                    exception
            );
        }
    }
}
