# Gradebook

A PHP student grading workspace with a marks register, student and subject directories, performance summaries, and printable results. The interface uses local assets and works without a frontend build step.

## Features

- Password-based staff login, session expiry, account lockout after repeated failed attempts, and sign out.
- Add, search, view, edit, and delete student results. Deletion requires confirmation.
- Student and subject directories with search and editable details.
- Test 1 (20%), Test 2 (30%), and final examination (50%), each entered out of 100.
- Live result preview, server-side validation, database-calculated totals, and A–E grades.
- Blank assessments stay pending. Completed zeros count as zero.
- Performance by academic term: grade distribution, subject averages, pass rate, and results that may need support.
- Print a single student result or the filtered register using the browser print dialog.
- Responsive navigation and forms, labelled controls, keyboard focus states, and reduced-motion support.

## Requirements

PHP 8.2+ with PDO MySQL, mbstring, and sessions; MySQL 8.0.16+ or MariaDB 10.6+. The integration checks also use PHP cURL. MariaDB 12.3 and PHP 8.5 were used for local verification. No Composer or npm dependencies are required.

## Setup

1. Create an empty `grading` database with the `utf8mb4` character set.
2. Import `database_schema.sql` using phpMyAdmin's Import tab, or the MySQL/MariaDB command-line client. It is a fresh-install schema, not an upgrade migration; do not import it over existing application tables.
3. Create a dedicated database user with SELECT, INSERT, UPDATE, and DELETE access to the application database and its views. Use an administrative account only to import the schema.
4. Copy `config.example.php` to `config.local.php` and set the database connection. The local configuration is ignored by Git and blocked by the development router.
5. Create your staff account:

```sh
php bin/create-user.php --name="Your name" --email="you@example.com"
```

The command prompts for a password of 12–72 bytes and hashes it. Add `--demo` to populate that account with eight explicitly synthetic students, three subjects, and sample results. Demo records are optional; normal accounts start empty. No default production password is supplied.

6. Start the local application from the project root:

```sh
php -S 127.0.0.1:8097 public/router.php
```

Open http://127.0.0.1:8097 in Safari or another browser. Keep the terminal running. Use the supplied router: starting PHP without it would expose project reference files. Stop with Ctrl+C.

Environment variables can replace the local configuration: `GRADING_DB_HOST`, `GRADING_DB_PORT`, `GRADING_DB_NAME`, `GRADING_DB_USER`, and `GRADING_DB_PASSWORD`. Values in `config.local.php` take precedence. Keep credentials out of source control and command history.

## Calculation rules

`total = round(test_1 × 0.20 + test_2 × 0.30 + final_exam × 0.50, 2)`

All three input marks range from 0 to 100 with at most two decimal places. MariaDB/MySQL calculates the total using exact DECIMAL arithmetic. The client preview uses integer hundredths and is not trusted for persistence. Round the total to two decimals before assigning a grade: A from 80, B from 65, C from 50, D from 40, and E below 40.

A missing input is NULL, not zero. Total and grade remain pending until all three marks are entered. Performance averages and pass rates include completed results only and show their completion counts. A pass is a completed total of at least 40. The average across terms gives every saved result equal weight; it is not a credit-weighted GPA or a trend metric.

## Data model

`staff_users` owns `students`, `subjects`, and `grade_records`. A result links one student and one subject for a named academic term. The student/subject/term combination is unique. Composite foreign keys prevent linking records across staff accounts. Each staff member has a separate directory; shared classrooms and administrative cross-account access are not implemented.

`student_subject_performance` supplies result details and grade labels. `subject_performance` and `student_term_performance` expose aggregate data. Views do not enforce access control: the PHP application scopes reads and writes by the authenticated owner. Student and subject edits update linked displays. Deleting a result keeps its student and subject.

## Verification

With the local application running against a **disposable test database**, run:

```sh
GRADING_TEST_ALLOW_WRITES=1 php tests/integration.php
```

The test creates random temporary accounts, exercises the HTTP endpoints and real database persistence, and removes only its own fixtures. Use the same database configuration as the running app. Set `GRADING_TEST_URL` if the local port differs. Checks cover authentication, CSRF, weighted totals and grade boundaries, pending marks, safe feedback output, search, edit/delete persistence, cross-account isolation, and blocked private paths.

Local verification passed 41 integration checks. Safari login, register, performance, result-entry rendering, and live grade preview were checked separately, including an iPhone-sized responsive viewport. This does not establish production deployment, a physical-phone test, or an external database administration setup.

## Hosting

Use a PHP-capable host and HTTPS. The PHP development server is for loopback previews. For Apache, `.htaccess` includes private-path denial rules and requires mod_rewrite with overrides enabled; verify these rules on the actual host before exposing the site. For Nginx or other servers, explicitly allow only the application entry point and public CSS/JS; deny configuration, SQL, tests, tooling, dotfiles, and reference documents. Disable directory listing. Configure secure session transport and database backups before using real student data. Static-only hosting cannot run this application.

## Current limits

The app does not yet provide password reset, institutional SSO, student logins, shared staff access, immutable report snapshots, or a full grade-edit audit trail. Result deletion is permanent. Do not treat the local preview as a deployed production service.
