-- MySQL 8.0.16+ / MariaDB 10.6+. Import into an empty database in phpMyAdmin.
SET NAMES utf8mb4;

CREATE TABLE staff_users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    failed_logins INT UNSIGNED NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE students (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_id BIGINT UNSIGNED NOT NULL,
    matric_number VARCHAR(40) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY student_matric (owner_id, matric_number),
    UNIQUE KEY student_owner (id, owner_id),
    FOREIGN KEY (owner_id) REFERENCES staff_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE subjects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(30) NOT NULL,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY subject_code (owner_id, code),
    UNIQUE KEY subject_owner (id, owner_id),
    FOREIGN KEY (owner_id) REFERENCES staff_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE grade_records (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    subject_id BIGINT UNSIGNED NOT NULL,
    academic_term VARCHAR(80) NOT NULL,
    test_1 DECIMAL(5,2) NULL CHECK (test_1 BETWEEN 0 AND 100),
    test_2 DECIMAL(5,2) NULL CHECK (test_2 BETWEEN 0 AND 100),
    final_exam DECIMAL(5,2) NULL CHECK (final_exam BETWEEN 0 AND 100),
    total_marks DECIMAL(5,2) GENERATED ALWAYS AS
        (ROUND(test_1 * 0.20 + test_2 * 0.30 + final_exam * 0.50, 2)) STORED,
    feedback TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY one_result_per_term (student_id, subject_id, academic_term),
    KEY records_owner (owner_id, updated_at),
    FOREIGN KEY (owner_id) REFERENCES staff_users(id),
    FOREIGN KEY (student_id, owner_id) REFERENCES students(id, owner_id),
    FOREIGN KEY (subject_id, owner_id) REFERENCES subjects(id, owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A null mark means pending. A zero is a recorded zero. Only complete results receive a grade.
CREATE VIEW student_subject_performance AS
SELECT r.*, s.matric_number, s.full_name AS student_name,
       sub.code AS subject_code, sub.name AS subject_name,
       CASE WHEN total_marks >= 80 THEN 'A' WHEN total_marks >= 65 THEN 'B'
            WHEN total_marks >= 50 THEN 'C' WHEN total_marks >= 40 THEN 'D'
            WHEN total_marks IS NOT NULL THEN 'E' ELSE NULL END AS final_grade
FROM grade_records r
JOIN students s ON s.id = r.student_id AND s.owner_id = r.owner_id
JOIN subjects sub ON sub.id = r.subject_id AND sub.owner_id = r.owner_id;

CREATE VIEW subject_performance AS
SELECT owner_id, subject_id, academic_term, COUNT(*) AS record_count,
       COUNT(total_marks) AS completed_count, ROUND(AVG(total_marks), 2) AS average_marks,
       MIN(total_marks) AS lowest_marks, MAX(total_marks) AS highest_marks
FROM grade_records GROUP BY owner_id, subject_id, academic_term;

CREATE VIEW student_term_performance AS
SELECT owner_id, student_id, academic_term, COUNT(*) AS subject_count,
       COUNT(total_marks) AS completed_count, ROUND(AVG(total_marks), 2) AS average_marks
FROM grade_records GROUP BY owner_id, student_id, academic_term;

-- Views do not provide row-level security: applications must always filter by owner_id.
