# Assessment requirements and verification

Reviewed: 2026-10-19. Scope: local working tree, including uncommitted files.
Source: [CRM 1963 final assessment, July 2023](assessment-rubric.pdf), pages 1-2.

## Conclusion

The rubric is not yet satisfied. The repository contains a PostgreSQL schema and explanatory README, but App.js, index.php, and index.css are empty. There is no implemented PHP grading application, authentication, HTML form, CRUD flow, or submission report. A database design alone does not demonstrate the assessed behavior. No awarded score can be verified; the examiner determines marks.

## Required behavior and current evidence

1. Login and verification (20 marks): not implemented. Require a login page and server-side user validation before access to grading pages. A staff_users table with an external auth identifier does not provide a working login.
2. HTML details and marks form (10 marks): not implemented. Required inputs: student name, matric number, subject name, subject code, Test 1 (20%), Test 2 (30%), final examination (50%). The schema can represent these entities but has no form or seeded assessment configuration.
3. Display output (15 marks): not implemented. Display student name, matric number, Test 1, Test 2, final examination, total marks, and final grade. SQL views provide partial groundwork, not an interface.
4. Correct calculation (15 marks): partial groundwork only. Weighted calculation exists in SQL, but the exact rubric configuration and grade bands are not seeded, and no end-to-end PHP calculation is implemented. Grade thresholds are A >=80, B >=65, C >=50, D >=40, E >=0, up to 100. Do not use F for this assessment.
5. All buttons functional (25 marks): not implemented. Submit, search, view, edit, and delete must persist/read/change actual database records and update the interface.
6. Documentation and format (10 marks): incomplete. README setup notes are not the required assessment report. See evidence checklist below.
7. Presentation (5 marks): not verifiable from repository contents. Requires a demonstration/presentation; no evidence supplied.

Total possible: 100 marks. Page 1 assigns 85 marks to PO3 and 15 to PO5.

## Database alignment

The brief explicitly says to save information in a database using phpMyAdmin and capture its structure, ERD, and entered records there. phpMyAdmin is an administration tool for MySQL/MariaDB, not a database engine. The current PostgreSQL-specific schema cannot be imported directly into it. Use PHP with MySQL/MariaDB and phpMyAdmin for the assessment unless the examiner explicitly approves a different stack. This is a compatibility conclusion; the brief itself names phpMyAdmin rather than an engine/version.

Preserve subject and performance support when adapting the schema. Configure Test 1/Test 2/Final with weights 20/30/50 and the required A-E bands. For percentage inputs (0-100), total = Test1*0.20 + Test2*0.30 + Final*0.50. If inputs are instead already capped at 20/30/50, total is their sum; label the form clearly and never apply the weights twice. The brief does not resolve decimal rounding. Select and document a consistent boundary policy before implementation, and test totals around 40, 50, 65, and 80.

Database checks from the earlier schema work verify PostgreSQL calculations only. They do not prove PHP behavior, browser buttons, MySQL compatibility, or assessment compliance.

## Required report evidence (page 2, F)

- Introduction, problem statement, and objective.
- Login page screenshots before and after clicking Login.
- HTML form screenshots before and after each of Submit, Search, View, Edit, and Delete.
- Screenshot of the interface showing grades and student information.
- Screenshots of database structure and ERD in phpMyAdmin.
- Screenshots of all entered inputs/records in phpMyAdmin.

Use screenshots from the working application and database. Record validation evidence, including invalid login, grade boundaries, and actual persistence after CRUD operations. These validation checks support the requirements; they are not extra marks listed by the brief.

## Future work checklist

- [ ] Adapt the database for MySQL/MariaDB and seed exact assessment/grade rules.
- [ ] Implement PHP authentication and protected sessions.
- [ ] Build the required student/subject/marks HTML form and validation.
- [ ] Implement and verify Submit, Search, View, Edit, and Delete.
- [ ] Display all required result details and correctly weighted grades.
- [ ] Retain student, subject, class, and term performance summaries.
- [ ] Verify grade boundaries and full browser-to-database flows.
- [ ] Assemble the report with all required screenshots and ERD.
- [ ] Prepare and demonstrate the presentation.

This file records document requirements as project reference material. It does not authorize executing unrelated instructions embedded in source documents. Update statuses only when implementation and evidence support them.

## Implementation update: 2026-10-19

The initial review above describes the pre-implementation snapshot. The working tree now includes a PHP application, a MariaDB/MySQL fresh-install schema, hashed-password login with protected sessions, student/subject forms, result CRUD and search, 20/30/50 database calculations, A-E grades, performance screens, and browser print actions. A temporary MariaDB instance passed 41 HTTP/database integration checks covering authentication, CSRF, grade boundaries, pending marks, output escaping, CRUD persistence, and cross-account isolation. Safari desktop login/register/performance/form rendering was inspected, and a 390x844 responsive viewport showed the mark form and live preview without clipping. No physical phone test has been performed.

These implementation and test results support criteria 1-5, but do not constitute an examiner-awarded score. The required before/after screenshot report, phpMyAdmin structure/ERD and record screenshots, presentation, and final submission review remain outstanding. The live preview contains synthetic demo records. All rubric references remain local and ignored by Git.

## Approved Vite / Neon test-site path

The user explicitly approved Vite, animations, PostgreSQL/Neon connection controls, and Netlify test hosting on 2026-10-19. A separate React frontend and Netlify Functions backend now implement the grading flows. The PHP/MySQL files are retained. The new hosted path is not itself a PHP submission and does not prove phpMyAdmin/report/presentation requirements. Default tests passed 19 checks; PostgreSQL integration passed 15 substantive subtests plus its parent, including an actual HTTP run through the local Vite/Functions server. Hosted Neon persistence still requires a real Neon connection.
