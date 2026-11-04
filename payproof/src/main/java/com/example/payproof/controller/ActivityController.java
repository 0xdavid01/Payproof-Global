package com.example.payproof.controller;

import com.example.payproof.dto.response.ActivityLogResponse;
import com.example.payproof.model.UserModel;
import com.example.payproof.repository.UserRepository;
import com.example.payproof.security.CustomUserPrincipal;
import com.example.payproof.service.ActivityLogService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/activity")
@RequiredArgsConstructor
public class ActivityController {

    private final ActivityLogService activityLogService;
    private final UserRepository userRepository;

    @GetMapping
    public List<ActivityLogResponse> getActivity(
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        if (principal == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Authentication required"
            );
        }

        UserModel user = userRepository.findById(principal.getUserId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Authenticated user not found"
                ));
        return activityLogService.getForParticipant(user);
    }
}
