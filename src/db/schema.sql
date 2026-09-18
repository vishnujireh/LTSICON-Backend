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
  -- Tax breakdown: subtotal (taxable value) + GST, total_amount is GST-inclusive.
  subtotal          DECIMAL(12,2) NULL,
  gst_rate          DECIMAL(5,2)  NULL,
  gst_amount        DECIMAL(12,2) NULL,
  total_amount      DECIMAL(12,2) NULL,
  phase             VARCHAR(40)   NULL,
  -- Customer-facing sequential order number (e.g. LTSICON_0001), set on payment.
  order_no          VARCHAR(40)   NULL,
  -- Razorpay payment references.
  razorpay_order_id   VARCHAR(120) NULL,
  razorpay_payment_id VARCHAR(120) NULL,
  payment_status    ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
  email_status      ENUM('sent','skipped','failed') NOT NULL DEFAULT 'skipped',
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_registrations_reference (reference),
  UNIQUE KEY uq_registrations_order_no (order_no),
  KEY idx_registrations_email (email),
  KEY idx_registrations_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Atomic counters (used to hand out gap-free sequential order numbers).
CREATE TABLE IF NOT EXISTS counters (
  name  VARCHAR(50)  NOT NULL,
  value INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO counters (name, value) VALUES ('registration_order', 0);

-- Real user accounts for the site login (separate from delegate registrations).
CREATE TABLE IF NOT EXISTS users (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name              VARCHAR(200)  NOT NULL,
  email             VARCHAR(255)  NOT NULL,
  password_hash     VARCHAR(255)  NOT NULL,
  reset_token_hash  VARCHAR(128)  NULL,
  reset_expires     DATETIME      NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
