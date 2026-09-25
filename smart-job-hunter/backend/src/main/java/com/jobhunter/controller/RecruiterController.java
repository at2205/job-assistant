package com.jobhunter.controller;

import com.jobhunter.entity.*;
import com.jobhunter.repository.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.OffsetDateTime;
import java.util.*;

@RestController
@RequestMapping("/recruiters")
@RequiredArgsConstructor
@Tag(name = "Recruiters", description = "Recruiter intelligence APIs")
public class RecruiterController {

    private final RecruiterRepository recruiterRepo;
    private final RecruiterInteractionRepository interactionRepo;

    @GetMapping
    @Operation(summary = "Get recruiters for a user")
    public List<Recruiter> getRecruiters(@RequestParam UUID userId) {
        return recruiterRepo.findByUserId(userId);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get recruiter detail")
    public ResponseEntity<Map<String, Object>> getRecruiterDetail(@PathVariable UUID id) {
        return recruiterRepo.findById(id).map(r -> {
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("recruiter", r);
            detail.put("interactions", interactionRepo.findByRecruiterId(id));
            return ResponseEntity.ok(detail);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @Operation(summary = "Create a recruiter")
    public Recruiter createRecruiter(@RequestBody Map<String, Object> body) {
        Recruiter r = Recruiter.builder()
                .userId(UUID.fromString((String) body.get("userId")))
                .name((String) body.get("name"))
                .email((String) body.get("email"))
                .company((String) body.get("company"))
                .title((String) body.get("title"))
                .source((String) body.get("source"))
                .createdAt(OffsetDateTime.now())
                .updatedAt(OffsetDateTime.now())
                .build();
        return recruiterRepo.save(r);
    }

    @PostMapping("/{id}/interactions")
    @Operation(summary = "Add recruiter interaction")
    public RecruiterInteraction addInteraction(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        RecruiterInteraction i = RecruiterInteraction.builder()
                .recruiterId(id)
                .userId(UUID.fromString((String) body.get("userId")))
                .interactionType((String) body.get("type"))
                .channel((String) body.get("channel"))
                .content((String) body.get("content"))
                .sentiment((String) body.get("sentiment"))
                .createdAt(OffsetDateTime.now())
                .build();
        return interactionRepo.save(i);
    }
}
