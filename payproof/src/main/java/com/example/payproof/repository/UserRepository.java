package com.example.payproof.repository;

import com.example.payproof.enums.UserRole;
import com.example.payproof.model.UserModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<UserModel, String> {

    Optional<UserModel> findByEmail(String email);

    Optional<UserModel> findByGoogleId(String googleId);

    boolean existsByEmail(String email);

    long countByRole(UserRole role);

}