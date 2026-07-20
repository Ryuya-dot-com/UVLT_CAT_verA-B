PRAGMA foreign_keys = ON;

-- Operational releases are deliberately separate from the public asset build.
-- This database contains stimuli and unscored responses, but never answer keys,
-- correctness flags, scores, IRT parameters, or ability estimates.
CREATE TABLE runtime_releases (
  release_id TEXT PRIMARY KEY,
  app_version TEXT NOT NULL,
  public_build_manifest_sha256 TEXT NOT NULL
    CHECK (length(public_build_manifest_sha256) = 64 AND public_build_manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  runtime_manifest_sha256 TEXT NOT NULL
    CHECK (length(runtime_manifest_sha256) = 64 AND runtime_manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  bank_sha256 TEXT NOT NULL
    CHECK (length(bank_sha256) = 64 AND bank_sha256 NOT GLOB '*[^0-9a-f]*'),
  routes_sha256 TEXT NOT NULL
    CHECK (length(routes_sha256) = 64 AND routes_sha256 NOT GLOB '*[^0-9a-f]*'),
  participant_hmac_key_fingerprint TEXT
    CHECK (participant_hmac_key_fingerprint IS NULL OR (
      length(participant_hmac_key_fingerprint) = 71 AND
      substr(participant_hmac_key_fingerprint, 1, 7) = 'sha256:' AND
      substr(participant_hmac_key_fingerprint, 8) NOT GLOB '*[^0-9a-f]*'
    )),
  prolific_completion_code_fingerprint TEXT
    CHECK (prolific_completion_code_fingerprint IS NULL OR (
      length(prolific_completion_code_fingerprint) = 71 AND
      substr(prolific_completion_code_fingerprint, 1, 7) = 'sha256:' AND
      substr(prolific_completion_code_fingerprint, 8) NOT GLOB '*[^0-9a-f]*'
    )),
  prolific_completion_action TEXT
    CHECK (prolific_completion_action IS NULL OR prolific_completion_action IN ('MANUALLY_REVIEW', 'AUTOMATICALLY_APPROVE')),
  expected_testlets INTEGER NOT NULL DEFAULT 100 CHECK (expected_testlets = 100),
  expected_items INTEGER NOT NULL DEFAULT 300 CHECK (expected_items = 300),
  expected_breaks INTEGER NOT NULL DEFAULT 9 CHECK (expected_breaks = 9),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  frozen_at TEXT,
  CHECK (active = 0 OR (
    participant_hmac_key_fingerprint IS NOT NULL AND
    prolific_completion_code_fingerprint IS NOT NULL AND
    prolific_completion_action IS NOT NULL
  ))
);

-- A Prolific study identifies the L1 stratum. The plaintext completion code
-- remains a Worker secret; D1 stores only its fingerprint and expected action.
CREATE TABLE studies (
  study_id TEXT PRIMARY KEY
    CHECK (length(study_id) = 24 AND lower(study_id) NOT GLOB '*[^0-9a-f]*'),
  release_id TEXT NOT NULL,
  l1 TEXT NOT NULL CHECK (l1 IN ('ja', 'vi')),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (release_id) REFERENCES runtime_releases(release_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (study_id, release_id, l1)
);

CREATE TABLE runtime_testlets (
  release_id TEXT NOT NULL,
  testlet_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  form_id TEXT NOT NULL CHECK (form_id IN ('A', 'B')),
  band TEXT NOT NULL CHECK (band IN ('1k', '2k', '3k', '4k', '5k')),
  options_json TEXT NOT NULL
    CHECK (CASE WHEN json_valid(options_json) THEN json_array_length(options_json) = 6 ELSE 0 END),
  items_json TEXT NOT NULL
    CHECK (CASE WHEN json_valid(items_json) THEN json_array_length(items_json) = 3 ELSE 0 END),
  content_sha256 TEXT NOT NULL
    CHECK (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (release_id, testlet_id),
  FOREIGN KEY (release_id) REFERENCES runtime_releases(release_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE runtime_route_testlets (
  release_id TEXT NOT NULL,
  route_id TEXT NOT NULL CHECK (route_id IN ('R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10')),
  testlet_ordinal INTEGER NOT NULL CHECK (testlet_ordinal BETWEEN 0 AND 99),
  module_position INTEGER NOT NULL CHECK (module_position BETWEEN 1 AND 10),
  testlet_position_within_module INTEGER NOT NULL CHECK (testlet_position_within_module BETWEEN 1 AND 10),
  testlet_id TEXT NOT NULL,
  PRIMARY KEY (release_id, route_id, testlet_ordinal),
  UNIQUE (release_id, route_id, testlet_id),
  UNIQUE (release_id, route_id, module_position, testlet_position_within_module),
  FOREIGN KEY (release_id, testlet_id) REFERENCES runtime_testlets(release_id, testlet_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  study_id TEXT NOT NULL,
  l1 TEXT NOT NULL CHECK (l1 IN ('ja', 'vi')),
  participant_link_hmac TEXT NOT NULL
    CHECK (length(participant_link_hmac) = 64 AND participant_link_hmac NOT GLOB '*[^0-9a-f]*'),
  submission_link_hmac TEXT NOT NULL
    CHECK (length(submission_link_hmac) = 64 AND submission_link_hmac NOT GLOB '*[^0-9a-f]*'),
  allocation_index INTEGER NOT NULL CHECK (allocation_index BETWEEN 0 AND 299),
  route_id TEXT NOT NULL CHECK (route_id IN ('R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10')),
  token_sha256 TEXT NOT NULL
    CHECK (length(token_sha256) = 64 AND token_sha256 NOT GLOB '*[^0-9a-f]*'),
  token_expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  next_testlet_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (next_testlet_ordinal BETWEEN 0 AND 100),
  completed_testlets INTEGER NOT NULL DEFAULT 0 CHECK (completed_testlets BETWEEN 0 AND 100),
  response_count INTEGER NOT NULL DEFAULT 0 CHECK (response_count BETWEEN 0 AND 300),
  breaks_completed INTEGER NOT NULL DEFAULT 0 CHECK (breaks_completed BETWEEN 0 AND 9),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  completion_issued_at TEXT,
  CHECK (next_testlet_ordinal = completed_testlets),
  CHECK (response_count = completed_testlets * 3),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CHECK (status <> 'completed' OR
    (next_testlet_ordinal = 100 AND completed_testlets = 100 AND response_count = 300 AND breaks_completed = 9)),
  FOREIGN KEY (release_id) REFERENCES runtime_releases(release_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (study_id, release_id, l1) REFERENCES studies(study_id, release_id, l1)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (submission_link_hmac),
  UNIQUE (study_id, participant_link_hmac),
  UNIQUE (release_id, l1, allocation_index)
);

CREATE TABLE testlet_submissions (
  session_id TEXT NOT NULL,
  testlet_ordinal INTEGER NOT NULL CHECK (testlet_ordinal BETWEEN 0 AND 99),
  testlet_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  payload_sha256 TEXT NOT NULL
    CHECK (length(payload_sha256) = 64 AND payload_sha256 NOT GLOB '*[^0-9a-f]*'),
  client_started_at TEXT NOT NULL,
  client_submitted_at TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms BETWEEN 0 AND 7200000),
  received_at TEXT NOT NULL,
  PRIMARY KEY (session_id, testlet_ordinal),
  UNIQUE (session_id, idempotency_key),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE responses (
  session_id TEXT NOT NULL,
  response_ordinal INTEGER NOT NULL CHECK (response_ordinal BETWEEN 1 AND 300),
  testlet_ordinal INTEGER NOT NULL CHECK (testlet_ordinal BETWEEN 0 AND 99),
  testlet_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_position_within_testlet INTEGER NOT NULL CHECK (item_position_within_testlet BETWEEN 1 AND 3),
  selected_option TEXT NOT NULL CHECK (length(selected_option) BETWEEN 1 AND 256),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (session_id, response_ordinal),
  UNIQUE (session_id, item_id),
  UNIQUE (session_id, testlet_ordinal, item_position_within_testlet),
  FOREIGN KEY (session_id, testlet_ordinal) REFERENCES testlet_submissions(session_id, testlet_ordinal)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE session_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'session_started', 'testlet_submitted', 'break_completed', 'session_completed'
  )),
  event_ordinal INTEGER NOT NULL CHECK (event_ordinal BETWEEN 0 AND 100),
  payload_sha256 TEXT NOT NULL
    CHECK (length(payload_sha256) = 64 AND payload_sha256 NOT GLOB '*[^0-9a-f]*'),
  occurred_at TEXT NOT NULL,
  UNIQUE (session_id, event_type, event_ordinal),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_studies_release_active ON studies(release_id, active, l1);
CREATE INDEX idx_route_next_testlet ON runtime_route_testlets(release_id, route_id, testlet_ordinal);
CREATE INDEX idx_sessions_release_l1 ON sessions(release_id, l1, allocation_index);
CREATE INDEX idx_submissions_session ON testlet_submissions(session_id, testlet_ordinal);
CREATE INDEX idx_responses_session_testlet ON responses(session_id, testlet_ordinal);
CREATE INDEX idx_events_session_time ON session_events(session_id, occurred_at);

-- A field release is assembled while inactive. It may be activated exactly
-- once, only after the complete frozen runtime is present. Once active, its
-- identity, stimuli, and route mapping are immutable in D1. A study may only
-- move from active to inactive as a one-way emergency collection close.
CREATE TRIGGER runtime_releases_reject_active_insert
BEFORE INSERT ON runtime_releases
WHEN NEW.active = 1
BEGIN
  SELECT RAISE(ABORT, 'runtime release must be inserted inactive');
END;

CREATE TRIGGER runtime_releases_reject_active_update
BEFORE UPDATE ON runtime_releases
WHEN OLD.active = 1
BEGIN
  SELECT RAISE(ABORT, 'active runtime release is immutable');
END;

CREATE TRIGGER runtime_releases_reject_active_delete
BEFORE DELETE ON runtime_releases
WHEN OLD.active = 1
BEGIN
  SELECT RAISE(ABORT, 'active runtime release is immutable');
END;

CREATE TRIGGER runtime_releases_validate_activation
BEFORE UPDATE ON runtime_releases
WHEN OLD.active = 0 AND NEW.active = 1
BEGIN
  SELECT CASE WHEN
    NEW.release_id IS NOT OLD.release_id OR
    NEW.app_version IS NOT OLD.app_version OR
    NEW.public_build_manifest_sha256 IS NOT OLD.public_build_manifest_sha256 OR
    NEW.runtime_manifest_sha256 IS NOT OLD.runtime_manifest_sha256 OR
    NEW.bank_sha256 IS NOT OLD.bank_sha256 OR
    NEW.routes_sha256 IS NOT OLD.routes_sha256 OR
    NEW.participant_hmac_key_fingerprint IS NOT OLD.participant_hmac_key_fingerprint OR
    NEW.prolific_completion_code_fingerprint IS NOT OLD.prolific_completion_code_fingerprint OR
    NEW.prolific_completion_action IS NOT OLD.prolific_completion_action OR
    NEW.expected_testlets IS NOT OLD.expected_testlets OR
    NEW.expected_items IS NOT OLD.expected_items OR
    NEW.expected_breaks IS NOT OLD.expected_breaks OR
    NEW.created_at IS NOT OLD.created_at OR
    NEW.frozen_at IS NOT OLD.frozen_at
  THEN RAISE(ABORT, 'runtime release activation may only change active') END;

  SELECT CASE WHEN NEW.frozen_at IS NULL OR
    NEW.participant_hmac_key_fingerprint IS NULL OR
    NEW.prolific_completion_code_fingerprint IS NULL OR
    NEW.prolific_completion_action IS NULL
    THEN RAISE(ABORT, 'runtime release identity is incomplete') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM studies WHERE release_id = NEW.release_id
  ) <> 2 OR (
    SELECT COUNT(*) FROM studies WHERE release_id = NEW.release_id AND active = 1
  ) <> 2 OR (
    SELECT COUNT(*) FROM studies WHERE release_id = NEW.release_id AND active = 1 AND l1 = 'ja'
  ) <> 1 OR (
    SELECT COUNT(*) FROM studies WHERE release_id = NEW.release_id AND active = 1 AND l1 = 'vi'
  ) <> 1
    THEN RAISE(ABORT, 'runtime release requires one active ja and one active vi study') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM runtime_testlets WHERE release_id = NEW.release_id
  ) <> 100
    THEN RAISE(ABORT, 'runtime release requires exactly 100 testlets') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM runtime_route_testlets WHERE release_id = NEW.release_id
  ) <> 1000 OR (
    SELECT COUNT(DISTINCT route_id) FROM runtime_route_testlets WHERE release_id = NEW.release_id
  ) <> 10
    THEN RAISE(ABORT, 'runtime release requires exactly 1000 rows across 10 routes') END;
END;

CREATE TRIGGER studies_reject_active_release_insert
BEFORE INSERT ON studies
WHEN EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = NEW.release_id AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active release studies are immutable');
END;

CREATE TRIGGER studies_reject_active_release_update
BEFORE UPDATE ON studies
WHEN (
  EXISTS (
    SELECT 1 FROM runtime_releases WHERE release_id = OLD.release_id AND active = 1
  ) OR EXISTS (
    SELECT 1 FROM runtime_releases WHERE release_id = NEW.release_id AND active = 1
  )
) AND NOT (
  OLD.active = 1 AND NEW.active = 0 AND
  NEW.study_id IS OLD.study_id AND
  NEW.release_id IS OLD.release_id AND
  NEW.l1 IS OLD.l1 AND
  NEW.created_at IS OLD.created_at AND
  EXISTS (
    SELECT 1 FROM runtime_releases WHERE release_id = OLD.release_id AND active = 1
  )
)
BEGIN
  SELECT RAISE(ABORT, 'active release study may only be closed once');
END;

CREATE TRIGGER studies_reject_active_release_delete
BEFORE DELETE ON studies
WHEN EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = OLD.release_id AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active release studies are immutable');
END;

CREATE TRIGGER runtime_testlets_reject_active_release_insert
BEFORE INSERT ON runtime_testlets
WHEN EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = NEW.release_id AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active release testlets are immutable');
END;

CREATE TRIGGER runtime_testlets_reject_active_release_update
BEFORE UPDATE ON runtime_testlets
WHEN EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = OLD.release_id AND active = 1
) OR EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = NEW.release_id AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active release testlets are immutable');
END;

CREATE TRIGGER runtime_testlets_reject_active_release_delete
BEFORE DELETE ON runtime_testlets
WHEN EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = OLD.release_id AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active release testlets are immutable');
END;

CREATE TRIGGER runtime_routes_reject_active_release_insert
BEFORE INSERT ON runtime_route_testlets
WHEN EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = NEW.release_id AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active release routes are immutable');
END;

CREATE TRIGGER runtime_routes_reject_active_release_update
BEFORE UPDATE ON runtime_route_testlets
WHEN EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = OLD.release_id AND active = 1
) OR EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = NEW.release_id AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active release routes are immutable');
END;

CREATE TRIGGER runtime_routes_reject_active_release_delete
BEFORE DELETE ON runtime_route_testlets
WHEN EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = OLD.release_id AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active release routes are immutable');
END;
