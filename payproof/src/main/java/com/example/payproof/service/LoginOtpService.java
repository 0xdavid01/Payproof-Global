package com.example.payproof.service;

import jakarta.servlet.http.HttpSession;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;

@Service
@Slf4j
public class LoginOtpService {

    private static final String EMAIL_KEY = "loginOtp.email";
    private static final String HASH_KEY = "loginOtp.hash";
    private static final String EXPIRES_AT_KEY = "loginOtp.expiresAt";
    private static final String STARTED_AT_KEY = "loginOtp.startedAt";
    private static final String LAST_SENT_AT_KEY = "loginOtp.lastSentAt";
    private static final String RESEND_COUNT_KEY = "loginOtp.resendCount";
    private static final String FAILED_ATTEMPTS_KEY = "loginOtp.failedAttempts";
    private static final int OTP_LENGTH = 6;
    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int MAX_RESENDS = 5;
    private static final Duration CODE_LIFETIME = Duration.ofMinutes(5);
    private static final Duration CHALLENGE_LIFETIME = Duration.ofMinutes(15);
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);

    private final ResendEmailService emailService;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom secureRandom = new SecureRandom();

    public LoginOtpService(
            ResendEmailService emailService,
            PasswordEncoder passwordEncoder) {
        this.emailService = emailService;
        this.passwordEncoder = passwordEncoder;
    }

    public void issueCode(String email, HttpSession session) {
        String code = generateCode();
        sendCodeEmail(email, code);

        Instant now = Instant.now();
        session.setAttribute(EMAIL_KEY, email);
        session.setAttribute(HASH_KEY, passwordEncoder.encode(code));
        session.setAttribute(EXPIRES_AT_KEY, now.plus(CODE_LIFETIME).toEpochMilli());
        session.setAttribute(STARTED_AT_KEY, now.toEpochMilli());
        session.setAttribute(LAST_SENT_AT_KEY, now.toEpochMilli());
        session.setAttribute(RESEND_COUNT_KEY, 0);
        session.setAttribute(FAILED_ATTEMPTS_KEY, 0);
    }

    public void verifyCode(String email, String code, HttpSession session) {
        if (session == null || !email.equals(session.getAttribute(EMAIL_KEY))) {
            throw invalidCode();
        }

        Long expiresAt = (Long) session.getAttribute(EXPIRES_AT_KEY);
        String hash = (String) session.getAttribute(HASH_KEY);
        if (expiresAt == null || hash == null || Instant.now().toEpochMilli() >= expiresAt) {
            clearChallenge(session);
            throw invalidCode();
        }

        if (!passwordEncoder.matches(code, hash)) {
            int failedAttempts = getIntAttribute(session, FAILED_ATTEMPTS_KEY) + 1;
            if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                clearChallenge(session);
            } else {
                session.setAttribute(FAILED_ATTEMPTS_KEY, failedAttempts);
            }
            throw invalidCode();
        }

        clearChallenge(session);
    }

    public void resendCode(String email, HttpSession session) {
        if (session == null || !email.equals(session.getAttribute(EMAIL_KEY))) {
            return;
        }

        long now = System.currentTimeMillis();
        Long startedAt = (Long) session.getAttribute(STARTED_AT_KEY);
        Long lastSentAt = (Long) session.getAttribute(LAST_SENT_AT_KEY);
        if (startedAt == null || now - startedAt >= CHALLENGE_LIFETIME.toMillis()) {
            clearChallenge(session);
            return;
        }
        if (lastSentAt != null && now - lastSentAt < RESEND_COOLDOWN.toMillis()) {
            throw new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "Please wait before requesting another code."
            );
        }

        int resendCount = getIntAttribute(session, RESEND_COUNT_KEY);
        if (resendCount >= MAX_RESENDS) {
            throw new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "The code resend limit has been reached. Please sign in again."
            );
        }

        String code = generateCode();
        sendCodeEmail(email, code);
        session.setAttribute(HASH_KEY, passwordEncoder.encode(code));
        session.setAttribute(EXPIRES_AT_KEY, now + CODE_LIFETIME.toMillis());
        session.setAttribute(LAST_SENT_AT_KEY, now);
        session.setAttribute(RESEND_COUNT_KEY, resendCount + 1);
    }

    private void sendCodeEmail(String email, String code) {
        try {
            String template = new String(
                    new ClassPathResource("templates/login-otp.html")
                            .getInputStream()
                            .readAllBytes(),
                    StandardCharsets.UTF_8
            );
            String html = template
                    .replace("{{otp}}", code)
                    .replace("{{expiresInMinutes}}", "5");

            emailService.send(
                    email,
                    "Your PayProof sign-in code",
                    "Your PayProof sign-in code is " + code
                            + ". It expires in 5 minutes. Never share this code.",
                    html
            );
        } catch (IOException | RestClientException | IllegalStateException exception) {
            log.error("Could not send verification email via Resend.", exception);
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Could not send a verification email. Please try again later.",
                    exception
            );
        }
    }

    private String generateCode() {
        return String.format("%0" + OTP_LENGTH + "d", secureRandom.nextInt(1_000_000));
    }

    private int getIntAttribute(HttpSession session, String key) {
        Object value = session.getAttribute(key);
        return value instanceof Integer number ? number : 0;
    }

    private void clearChallenge(HttpSession session) {
        session.removeAttribute(EMAIL_KEY);
        session.removeAttribute(HASH_KEY);
        session.removeAttribute(EXPIRES_AT_KEY);
        session.removeAttribute(STARTED_AT_KEY);
        session.removeAttribute(LAST_SENT_AT_KEY);
        session.removeAttribute(RESEND_COUNT_KEY);
        session.removeAttribute(FAILED_ATTEMPTS_KEY);
    }

    private ResponseStatusException invalidCode() {
        return new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "Invalid or expired verification code."
        );
    }
}