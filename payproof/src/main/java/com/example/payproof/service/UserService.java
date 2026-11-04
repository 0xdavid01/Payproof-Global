package com.example.payproof.service;

import com.example.payproof.components.IDGenerator;
import com.example.payproof.dto.request.UserRegistrationRequest;
import com.example.payproof.dto.response.UserResponse;
import com.example.payproof.enums.UserStatus;
import com.example.payproof.enums.UserRole;
import com.example.payproof.model.UserModel;
import com.example.payproof.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final IDGenerator idGenerator;
    private final PasswordEncoder passwordEncoder;

    public UserService(
            UserRepository userRepository,
            IDGenerator idGenerator,
            PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.idGenerator = idGenerator;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public UserResponse registerUser(UserRegistrationRequest request) {

        if (userRepository.existsByEmail(request.email())) {
            throw new IllegalArgumentException("Email is already registered");
        }

        UserModel user = new UserModel();

        user.setUserId(idGenerator.generateUserId(request.role()));
        user.setFirstName(request.firstName());
        user.setLastName(request.lastName());
        user.setDisplayName(request.firstName() + " " + request.lastName());
        user.setEmail(request.email());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(request.role());
        user.setStatus(UserStatus.ACTIVE);

        return toResponse(userRepository.save(user));
    }

    @Transactional(readOnly = true)
    public UserResponse getUserResponse(String userId) {
        UserModel user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "User not found"
                ));
        return toResponse(user);
    }

    @Transactional
    public UserModel registerGoogleUser(
            String googleId,
            String email,
            String firstName,
            String lastName,
            UserRole role,
            String profilePictureUrl) {

        return userRepository.findByGoogleId(googleId)
                .orElseGet(() -> linkOrCreateGoogleUser(
                        googleId,
                        email,
                        firstName,
                        lastName,
                        role,
                        profilePictureUrl
                ));
    }

    private UserModel linkOrCreateGoogleUser(
            String googleId,
            String email,
            String firstName,
            String lastName,
            UserRole role,
            String profilePictureUrl) {

        return userRepository.findByEmail(email)
                .map(existingUser -> {

                    if (existingUser.getGoogleId() != null &&
                            !existingUser.getGoogleId().equals(googleId)) {
                        throw new IllegalArgumentException(
                                "This email is linked to another Google account"
                        );
                    }

                    existingUser.setGoogleId(googleId);

                    if (existingUser.getProfilePictureUrl() == null) {
                        existingUser.setProfilePictureUrl(profilePictureUrl);
                    }

                    return userRepository.save(existingUser);
                })
                .orElseGet(() -> {

                    UserModel user = new UserModel();

                    user.setUserId(idGenerator.generateUserId(role));
                    user.setFirstName(firstName);
                    user.setLastName(lastName);
                    user.setDisplayName(firstName + " " + lastName);
                    user.setEmail(email);
                    user.setGoogleId(googleId);
                    user.setProfilePictureUrl(profilePictureUrl);
                    user.setRole(role);
                    user.setStatus(UserStatus.ACTIVE);

                    return userRepository.save(user);
                });
    }

    private UserResponse toResponse(UserModel user) {
        return new UserResponse(
                user.getUserId(),
                user.getFirstName(),
                user.getLastName(),
                user.getDisplayName(),
                user.getEmail(),
                user.getProfilePictureUrl(),
                user.getRole(),
                user.getStatus(),
                user.getCreatedAt()
        );
    }
}