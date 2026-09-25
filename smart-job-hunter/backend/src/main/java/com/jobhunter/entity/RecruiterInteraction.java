package com.jobhunter.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "recruiter_interactions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RecruiterInteraction {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "recruiter_id", nullable = false)
    private UUID recruiterId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "job_id")
    private UUID jobId;

    @Column(name = "application_id")
    private UUID applicationId;

    @Column(name = "interaction_type", length = 50)
    private String interactionType;

    @Column(length = 50)
    private String channel;

    @Column(columnDefinition = "text")
    private String content;

    @Column(length = 50)
    private String sentiment;

    @Column(name = "follow_up_needed")
    private Boolean followUpNeeded;

    @Column(name = "follow_up_date")
    private OffsetDateTime followUpDate;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
