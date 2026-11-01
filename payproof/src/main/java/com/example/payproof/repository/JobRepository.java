package com.example.payproof.repository;

import com.example.payproof.enums.JobStatus;
import com.example.payproof.model.JobModel;
import com.example.payproof.model.UserModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface JobRepository extends JpaRepository<JobModel, String> {

    List<JobModel> findByClient(UserModel client);

    List<JobModel> findByFreelancer(UserModel freelancer);

    Optional<JobModel> findByJobIdAndClient(
            String jobId,
            UserModel client
    );

    Optional<JobModel> findByJobIdAndParticipantEmailIgnoreCase(
            String jobId,
            String participantEmail
    );

    List<JobModel> findByStatus(JobStatus status);

    long countByJobIdStartingWith(String prefix);
}