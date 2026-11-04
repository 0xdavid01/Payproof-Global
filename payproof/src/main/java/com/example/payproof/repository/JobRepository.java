
package com.example.payproof.repository;

import com.example.payproof.enums.JobStatus;
import com.example.payproof.model.JobModel;
import com.example.payproof.model.UserModel;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface JobRepository extends JpaRepository<JobModel, String> {

    List<JobModel> findByClient(UserModel client);

    List<JobModel> findByFreelancer(UserModel freelancer);

    List<JobModel> findByFreelancerOrParticipantEmailIgnoreCase(
            UserModel freelancer,
            String participantEmail
    );

    Optional<JobModel> findByJobIdAndClient(
            String jobId,
            UserModel client
    );

    Optional<JobModel> findByJobIdAndParticipantEmailIgnoreCase(
            String jobId,
            String participantEmail
    );

    List<JobModel> findByStatus(JobStatus status);


    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT j FROM JobModel j WHERE j.jobId = :jobId")
    Optional<JobModel> findByIdForUpdate(@Param("jobId") String jobId);

    long countByJobIdStartingWith(String prefix);
}
