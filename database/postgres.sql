-- PostgreSQL 16+ / Neon. Objects live in the isolated gradebook schema.
BEGIN;

CREATE SCHEMA IF NOT EXISTS gradebook;
CREATE TABLE IF NOT EXISTS gradebook.schema_version (
  version integer PRIMARY KEY, installed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gradebook.staff_users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name varchar(120) NOT NULL,
  email varchar(190) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gradebook.sessions (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES gradebook.staff_users(id) ON DELETE CASCADE,
  csrf text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON gradebook.sessions(expires_at);
CREATE TABLE IF NOT EXISTS gradebook.students (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id bigint NOT NULL REFERENCES gradebook.staff_users(id),
  matric_number varchar(40) NOT NULL,
  full_name varchar(120) NOT NULL,
  UNIQUE(owner_id, matric_number), UNIQUE(id, owner_id)
);
CREATE TABLE IF NOT EXISTS gradebook.subjects (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id bigint NOT NULL REFERENCES gradebook.staff_users(id),
  code varchar(30) NOT NULL,
  name varchar(120) NOT NULL,
  UNIQUE(owner_id, code), UNIQUE(id, owner_id)
);
CREATE TABLE IF NOT EXISTS gradebook.grade_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id bigint NOT NULL REFERENCES gradebook.staff_users(id),
  student_id bigint NOT NULL,
  subject_id bigint NOT NULL,
  academic_term varchar(80) NOT NULL,
  test_1 numeric(5,2) CHECK(test_1 BETWEEN 0 AND 100),
  test_2 numeric(5,2) CHECK(test_2 BETWEEN 0 AND 100),
  final_exam numeric(5,2) CHECK(final_exam BETWEEN 0 AND 100),
  total_marks numeric(5,2) GENERATED ALWAYS AS (round(test_1*0.20 + test_2*0.30 + final_exam*0.50,2)) STORED,
  feedback text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(student_id,owner_id) REFERENCES gradebook.students(id,owner_id),
  FOREIGN KEY(subject_id,owner_id) REFERENCES gradebook.subjects(id,owner_id),
  UNIQUE(student_id,subject_id,academic_term)
);
CREATE INDEX IF NOT EXISTS records_owner_idx ON gradebook.grade_records(owner_id,updated_at);
CREATE OR REPLACE VIEW gradebook.student_subject_performance AS
SELECT r.*, s.full_name AS student_name, s.matric_number, sub.code AS subject_code, sub.name AS subject_name,
  CASE WHEN total_marks>=80 THEN 'A' WHEN total_marks>=65 THEN 'B' WHEN total_marks>=50 THEN 'C'
       WHEN total_marks>=40 THEN 'D' WHEN total_marks IS NOT NULL THEN 'E' END AS final_grade
FROM gradebook.grade_records r
JOIN gradebook.students s ON s.id=r.student_id AND s.owner_id=r.owner_id
JOIN gradebook.subjects sub ON sub.id=r.subject_id AND sub.owner_id=r.owner_id;
CREATE OR REPLACE VIEW gradebook.subject_performance AS
SELECT owner_id,subject_id,academic_term,count(*) AS result_count,count(total_marks) AS completed_count,
  round(avg(total_marks),2) AS average_marks,min(total_marks) AS lowest_marks,max(total_marks) AS highest_marks
FROM gradebook.grade_records GROUP BY owner_id,subject_id,academic_term;
CREATE OR REPLACE VIEW gradebook.student_term_performance AS
SELECT owner_id,student_id,academic_term,count(*) AS subject_count,count(total_marks) AS completed_count,
  round(avg(total_marks),2) AS average_marks
FROM gradebook.grade_records GROUP BY owner_id,student_id,academic_term;
INSERT INTO gradebook.schema_version(version) VALUES (1) ON CONFLICT DO NOTHING;

COMMIT;
