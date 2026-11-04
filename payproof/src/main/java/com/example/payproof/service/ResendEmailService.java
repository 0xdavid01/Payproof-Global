package com.example.payproof.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class ResendEmailService {

    private final RestClient restClient = RestClient.create("https://api.resend.com");

    @Value("${resend.api-key:}")
    private String apiKey;

    @Value("${resend.from:PayProof <onboarding@resend.dev>}")
    private String senderAddress;

    public void send(String recipient, String subject, String text, String html) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("Resend API key is not configured.");
        }

        Map<String, Object> email = new LinkedHashMap<>();
        email.put("from", senderAddress);
        email.put("to", recipient);
        email.put("subject", subject);
        email.put("text", text);
        if (html != null && !html.isBlank()) {
            email.put("html", html);
        }

        restClient.post()
                .uri("/emails")
                .header("Authorization", "Bearer " + apiKey)
                .body(email)
                .retrieve()
                .toBodilessEntity();
    }
}
