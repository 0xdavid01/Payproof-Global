package com.example.payproof.components;

import com.example.payproof.enums.UserRole;
import com.example.payproof.repository.JobRepository;
import com.example.payproof.repository.UserRepository;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

@Component
public class IDGenerator {

    private final UserRepository userRepository;
    private final JobRepository jobRepository;

    public IDGenerator(
            UserRepository userRepository,
            JobRepository jobRepository
    ) {
        this.userRepository = userRepository;
        this.jobRepository = jobRepository;
    }

    public String generateUserId(UserRole role) {
        String prefix = switch (role) {
            case FREELANCER -> "FL";
            case CLIENT -> "CL";
        };

        long count = userRepository.countByRole(role);

        return String.format("%s-%03d", prefix, count + 1);
    }

    public String generateJobId() {
        String date = LocalDate.now().format(
                DateTimeFormatter.ofPattern("yyyyMMdd")
        );

        String prefix = "JOB-" + date;

        long count = jobRepository.countByJobIdStartingWith(prefix);

        return prefix + String.format("%03d", count + 1);
    }
}