package com.example.payproof_admin.repository;

import com.example.payproof_admin.model.AdminUsers;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AdminUsersRepository extends JpaRepository<AdminUsers, String> {
    Optional<AdminUsers> findByEmail(String email);
    boolean existsByEmail(String email);
}