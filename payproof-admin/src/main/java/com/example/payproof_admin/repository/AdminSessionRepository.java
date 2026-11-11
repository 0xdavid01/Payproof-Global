package com.example.payproof_admin.repository;

import com.example.payproof_admin.model.AdminSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

public interface AdminSessionRepository extends JpaRepository<AdminSession, String> {

    Optional<AdminSession> findByToken(String token);

    @Modifying
    @Transactional
    @Query("UPDATE AdminSession s SET s.revokedAt = :now WHERE s.token = :token")
    void revokeByToken(@Param("token") String token, @Param("now") LocalDateTime now);

    @Modifying
    @Transactional
    @Query("DELETE FROM AdminSession s WHERE s.expiresAt < :now")
    void deleteExpired(@Param("now") LocalDateTime now);
}