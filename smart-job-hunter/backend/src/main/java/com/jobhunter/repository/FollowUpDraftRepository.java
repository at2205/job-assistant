package com.jobhunter.repository;

import com.jobhunter.entity.FollowUpDraft;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface FollowUpDraftRepository extends JpaRepository<FollowUpDraft, UUID> {
    List<FollowUpDraft> findByUserId(UUID userId);
    List<FollowUpDraft> findByUserIdAndStatus(UUID userId, String status);
}
