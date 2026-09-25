package com.jobhunter.repository;

import com.jobhunter.entity.GeneratedContent;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface GeneratedContentRepository extends JpaRepository<GeneratedContent, UUID> {
    List<GeneratedContent> findByUserIdAndJobId(UUID userId, UUID jobId);
    List<GeneratedContent> findByUserIdAndJobIdAndContentType(UUID userId, UUID jobId, String contentType);
}
