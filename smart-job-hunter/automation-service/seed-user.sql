-- Seed: Test User Profile (Aryan Tomar)
-- Matches users table schema from migrations 001 + 002 + 005

INSERT INTO users (id, email, full_name, skills, experience_years, preferred_locations, target_locations, expected_salary_min, expected_salary_max, target_roles, min_experience)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'aryan@example.com',
  'Aryan Tomar',
  '["Java", "Spring Boot", "React", "Next.js", "Node.js", "TypeScript", "JavaScript", "PostgreSQL", "SQL", "REST API", "Git", "Docker", "Redis", "MongoDB", "HTML", "CSS", "Tailwind CSS", "AWS", "Playwright", "Microservices"]'::jsonb,
  2,
  ARRAY['Delhi NCR', 'Bangalore', 'Remote', 'Noida', 'Gurgaon'],
  ARRAY['Delhi NCR', 'Bangalore', 'Remote', 'Noida', 'Gurgaon'],
  800000,
  1500000,
  ARRAY['Software Engineer', 'Java Developer', 'Full Stack Developer', 'Backend Developer', 'SDE'],
  1
)
ON CONFLICT (id) DO UPDATE SET
  skills = EXCLUDED.skills,
  experience_years = EXCLUDED.experience_years,
  preferred_locations = EXCLUDED.preferred_locations,
  target_locations = EXCLUDED.target_locations,
  expected_salary_min = EXCLUDED.expected_salary_min,
  expected_salary_max = EXCLUDED.expected_salary_max,
  target_roles = EXCLUDED.target_roles;
