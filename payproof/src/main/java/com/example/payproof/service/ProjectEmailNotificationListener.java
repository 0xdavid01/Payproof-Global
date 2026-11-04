package com.example.payproof.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Slf4j
@Component
@RequiredArgsConstructor
public class ProjectEmailNotificationListener {

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username:}")
    private String senderAddress;

    @Value("${spring.mail.password:}")
    private String senderPassword;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void send(ProjectEmailNotification notification) {
        if (senderAddress == null || senderAddress.isBlank()
                || senderPassword == null || senderPassword.isBlank()) {
            log.warn(
                    "Email notification was not sent because Gmail is not configured. Set MAIL_USERNAME and MAIL_APP_PASSWORD. recipient={}, subject={}",
                    notification.recipientEmail(),
                    notification.subject()
            );
            return;
        }

        if (notification.recipientEmail() == null
                || notification.recipientEmail().isBlank()) {
            log.warn(
                    "Email notification was not sent because the recipient address is empty. subject={}",
                    notification.subject()
            );
            return;
        }

        SimpleMailMessage email = new SimpleMailMessage();
        email.setFrom(senderAddress);
        email.setTo(notification.recipientEmail());
        email.setSubject(notification.subject());
        email.setText(
                "Hello " + notification.recipientName() + ",\n\n"
                        + notification.message()
                        + "\n\n" + notification.actionLabel() + ":\n"
                        + notification.actionUrl()
                        + "\n\nPayProof"
        );

        try {
            mailSender.send(email);
            log.info(
                    "Project email notification sent. recipient={}, subject={}",
                    notification.recipientEmail(),
                    notification.subject()
            );
        } catch (MailException exception) {
            log.error(
                    "Could not send project email notification. recipient={}, subject={}",
                    notification.recipientEmail(),
                    notification.subject(),
                    exception
            );
        }
    }
}
