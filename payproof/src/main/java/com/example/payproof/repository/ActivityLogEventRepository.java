package com.example.payproof.repository;

import com.example.payproof.model.ActivityLogEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ActivityLogEventRepository
        extends JpaRepository<ActivityLogEvent, UUID> {

    @Query("""
            select event
            from ActivityLogEvent event
            join fetch event.job job
            join fetch event.actor actor
            left join job.freelancer freelancer
            where event.actor.userId = :userId
               or job.client.userId = :userId
               or freelancer.userId = :userId
               or lower(job.participantEmail) = lower(:email)
            order by event.createdAt desc
            """)
    List<ActivityLogEvent> findAllVisibleToParticipant(
            @Param("userId") String userId,
            @Param("email") String email
    );
}
