-- LTSICON Chennai 2026 — database schema
-- Safe to run repeatedly (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS abstracts (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name        VARCHAR(120)  NOT NULL,
  last_name         VARCHAR(120)  NOT NULL,
  email             VARCHAR(255)  NOT NULL,
  mobile            VARCHAR(40)   NOT NULL,
  institution       VARCHAR(255)  NOT NULL,
  co_authors        TEXT          NULL,
  membership_id     VARCHAR(120)  NULL,
  presentation_type VARCHAR(80)   NOT NULL,
  track             VARCHAR(120)  NOT NULL,
  title             VARCHAR(500)  NOT NULL,
  abstract_body     TEXT          NULL,
  keywords          VARCHAR(500)  NULL,
  -- File is accepted at submission time; we persist metadata only.
  file_name         VARCHAR(255)  NULL,
  file_size         INT UNSIGNED  NULL,
  file_mime         VARCHAR(120)  NULL,
  -- Name of the saved file on disk (in the uploads/ folder).
  file_path         VARCHAR(255)  NULL,
  -- Declaration checkboxes stored as JSON array of accepted statements.
  declarations      JSON          NULL,
  email_status      ENUM('sent','skipped','failed') NOT NULL DEFAULT 'skipped',
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_abstracts_email (email),
  KEY idx_abstracts_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS registrations (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference         VARCHAR(40)   NOT NULL,
  name              VARCHAR(200)  NOT NULL,
  email             VARCHAR(255)  NOT NULL,
  phone             VARCHAR(40)   NULL,
  designation       VARCHAR(200)  NULL,
  institution       VARCHAR(255)  NULL,
  address           TEXT          NULL,
  mci_number        VARCHAR(120)  NULL,
  mci_state         VARCHAR(200)  NULL,
  category          VARCHAR(120)  NULL,
  workshops         JSON          NULL,
  guests            JSON          NULL,
  currency          VARCHAR(8)    NULL,
  total_amount      DECIMAL(12,2) NULL,
  phase             VARCHAR(40)   NULL,
  -- UPI payment proof captured on the final step.
  transaction_id    VARCHAR(120)  NULL,
  payment_screenshot VARCHAR(255) NULL,
  payment_status    ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
  email_status      ENUM('sent','skipped','failed') NOT NULL DEFAULT 'skipped',
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_registrations_reference (reference),
  KEY idx_registrations_email (email),
  KEY idx_registrations_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
