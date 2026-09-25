package com.jobhunter.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "selector_failures")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SelectorFailure {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(length = 50, nullable = false)
    private String platform;

    @Column(name = "page_url", columnDefinition = "text")
    private String pageUrl;

    @Column(nullable = false, columnDefinition = "text")
    private String selector;

    @Column(name = "expected_action", length = 100)
    private String expectedAction;

    @Column(name = "error_message", columnDefinition = "text")
    private String errorMessage;

    @Column(name = "screenshot_path", columnDefinition = "text")
    private String screenshotPath;

    @Column
    private Boolean resolved;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
