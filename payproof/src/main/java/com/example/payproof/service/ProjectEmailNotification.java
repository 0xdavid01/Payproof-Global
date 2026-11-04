package com.example.payproof.service;

public record ProjectEmailNotification(
        String recipientEmail,
        String recipientName,
        String subject,
        String message,
        String actionLabel,
        String actionUrl
) {
}
