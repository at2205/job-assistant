package com.jobhunter.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "follow_up_drafts")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class FollowUpDraft {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "job_id")
    private UUID jobId;

    @Column(name = "application_id")
    private UUID applicationId;

    @Column(name = "recruiter_id")
    private UUID recruiterId;

    @Column(name = "follow_up_type", length = 50)
    private String followUpType;

    @Column(columnDefinition = "text")
    private String subject;

    @Column(columnDefinition = "text")
    private String body;

    @Column(length = 50)
    private String status;

    @Column(name = "sent_at")
    private OffsetDateTime sentAt;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
