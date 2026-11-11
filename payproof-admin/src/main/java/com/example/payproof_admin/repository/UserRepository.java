package com.example.payproof_admin.repository;

import com.example.payproof_admin.enums.UserStatus;
import com.example.payproof_admin.model.UserModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<UserModel, String> {
    Optional<UserModel> findByEmail(String email);
    List<UserModel> findByStatus(UserStatus status);
}