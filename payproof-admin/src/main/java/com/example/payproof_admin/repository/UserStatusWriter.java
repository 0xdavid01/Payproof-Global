package com.example.payproof_admin.repository;

import com.example.payproof_admin.enums.UserStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
public class UserStatusWriter {

    private final JdbcTemplate jdbc;

    public int setStatus(String userId, UserStatus status) {
        return jdbc.update(
                "UPDATE users SET status = ?, updated_at = ? WHERE user_id = ?",
                status.name(), LocalDateTime.now(), userId);
    }
}