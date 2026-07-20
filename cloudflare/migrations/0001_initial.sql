PRAGMA foreign_keys = ON;

-- Operational releases are deliberately separate from the public asset build.
-- This database contains stimuli and unscored responses, but never answer keys,
-- correctness flags, scores, IRT parameters, or ability estimates.
CREATE TABLE runtime_releases (
  release_id TEXT PRIMARY KEY,
  app_version TEXT NOT NULL,
  worker_version_id TEXT
    CHECK (worker_version_id IS NULL OR (
      length(worker_version_id) = 36 AND
      worker_version_id = lower(worker_version_id) AND
      substr(worker_version_id, 9, 1) = '-' AND
      substr(worker_version_id, 14, 1) = '-' AND
      substr(worker_version_id, 19, 1) = '-' AND
      substr(worker_version_id, 24, 1) = '-' AND
      substr(worker_version_id, 15, 1) IN ('1', '2', '3', '4', '5') AND
      substr(worker_version_id, 20, 1) IN ('8', '9', 'a', 'b') AND
      length(replace(worker_version_id, '-', '')) = 32 AND
      replace(worker_version_id, '-', '') NOT GLOB '*[^0-9a-f]*'
    )),
  public_build_manifest_sha256 TEXT NOT NULL
    CHECK (length(public_build_manifest_sha256) = 64 AND public_build_manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  runtime_manifest_sha256 TEXT NOT NULL
    CHECK (length(runtime_manifest_sha256) = 64 AND runtime_manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  bank_sha256 TEXT NOT NULL
    CHECK (length(bank_sha256) = 64 AND bank_sha256 NOT GLOB '*[^0-9a-f]*'),
  routes_sha256 TEXT NOT NULL
    CHECK (length(routes_sha256) = 64 AND routes_sha256 NOT GLOB '*[^0-9a-f]*'),
  runtime_bank_projection_sha256 TEXT NOT NULL
    CHECK (length(runtime_bank_projection_sha256) = 64 AND runtime_bank_projection_sha256 NOT GLOB '*[^0-9a-f]*'),
  runtime_routes_projection_sha256 TEXT NOT NULL
    CHECK (length(runtime_routes_projection_sha256) = 64 AND runtime_routes_projection_sha256 NOT GLOB '*[^0-9a-f]*'),
  allocation_schedule_sha256 TEXT
    CHECK (allocation_schedule_sha256 IS NULL OR (
      length(allocation_schedule_sha256) = 64 AND allocation_schedule_sha256 NOT GLOB '*[^0-9a-f]*'
    )),
  randomization_seed_fingerprint TEXT
    CHECK (randomization_seed_fingerprint IS NULL OR (
      length(randomization_seed_fingerprint) = 71 AND
      substr(randomization_seed_fingerprint, 1, 7) = 'sha256:' AND
      substr(randomization_seed_fingerprint, 8) NOT GLOB '*[^0-9a-f]*'
    )),
  randomization_algorithm TEXT
    CHECK (randomization_algorithm IS NULL OR randomization_algorithm = 'hmac-sha256-permuted-blocks-10-crossed-option-williams-6-v1'),
  option_layout_algorithm TEXT
    CHECK (option_layout_algorithm IS NULL OR option_layout_algorithm = 'even-order-williams-square-6-canonical-first-v1'),
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
  target_protocol_completers_per_l1 INTEGER NOT NULL
    CHECK (target_protocol_completers_per_l1 = 300),
  hard_cap_starts_per_l1 INTEGER NOT NULL
    CHECK (hard_cap_starts_per_l1 = 420),
  stop_new_allocations_at_target INTEGER NOT NULL
    CHECK (stop_new_allocations_at_target = 1),
  retain_server_committed_partial_responses INTEGER NOT NULL
    CHECK (retain_server_committed_partial_responses = 1),
  protocol_completion_definition TEXT NOT NULL
    CHECK (protocol_completion_definition = 'd1-completed-after-100-testlets-300-responses-9-breaks-v1'),
  partial_response_retention_definition TEXT NOT NULL
    CHECK (partial_response_retention_definition = 'consented-nonwithdrawn-server-committed-complete-testlets-v1'),
  expected_testlets INTEGER NOT NULL DEFAULT 100 CHECK (expected_testlets = 100),
  expected_items INTEGER NOT NULL DEFAULT 300 CHECK (expected_items = 300),
  expected_breaks INTEGER NOT NULL DEFAULT 9 CHECK (expected_breaks = 9),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  frozen_at TEXT,
  CHECK (active = 0 OR (
    worker_version_id IS NOT NULL AND
    public_build_manifest_sha256 <> '0000000000000000000000000000000000000000000000000000000000000000' AND
    runtime_manifest_sha256 <> '0000000000000000000000000000000000000000000000000000000000000000' AND
    bank_sha256 <> '0000000000000000000000000000000000000000000000000000000000000000' AND
    routes_sha256 <> '0000000000000000000000000000000000000000000000000000000000000000' AND
    runtime_bank_projection_sha256 <> '0000000000000000000000000000000000000000000000000000000000000000' AND
    runtime_routes_projection_sha256 <> '0000000000000000000000000000000000000000000000000000000000000000' AND
    allocation_schedule_sha256 IS NOT NULL AND
    allocation_schedule_sha256 <> '0000000000000000000000000000000000000000000000000000000000000000' AND
    randomization_seed_fingerprint IS NOT NULL AND
    randomization_seed_fingerprint <> 'sha256:0000000000000000000000000000000000000000000000000000000000000000' AND
    randomization_algorithm IS NOT NULL AND
    option_layout_algorithm IS NOT NULL AND
    participant_hmac_key_fingerprint IS NOT NULL AND
    participant_hmac_key_fingerprint <> 'sha256:0000000000000000000000000000000000000000000000000000000000000000' AND
    prolific_completion_code_fingerprint IS NOT NULL AND
    prolific_completion_code_fingerprint <> 'sha256:0000000000000000000000000000000000000000000000000000000000000000' AND
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

-- Each L1 stratum receives an independently generated, frozen sequence of
-- forty-two randomized blocks. Every block contains each Williams route once;
-- the six option layouts are balanced within every route and L1 stratum.
CREATE TABLE runtime_allocation_slots (
  release_id TEXT NOT NULL,
  l1 TEXT NOT NULL CHECK (l1 IN ('ja', 'vi')),
  allocation_index INTEGER NOT NULL CHECK (allocation_index BETWEEN 0 AND 419),
  randomization_block INTEGER NOT NULL CHECK (randomization_block BETWEEN 0 AND 41),
  block_position INTEGER NOT NULL CHECK (block_position BETWEEN 1 AND 10),
  route_id TEXT NOT NULL CHECK (route_id IN ('R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10')),
  option_layout_id INTEGER NOT NULL CHECK (option_layout_id BETWEEN 0 AND 5),
  CHECK (allocation_index = randomization_block * 10 + block_position - 1),
  PRIMARY KEY (release_id, l1, allocation_index),
  UNIQUE (release_id, l1, randomization_block, block_position),
  UNIQUE (release_id, l1, randomization_block, route_id),
  UNIQUE (
    release_id, l1, allocation_index, randomization_block,
    block_position, route_id, option_layout_id
  ),
  FOREIGN KEY (release_id) REFERENCES runtime_releases(release_id)
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
  allocation_index INTEGER NOT NULL CHECK (allocation_index BETWEEN 0 AND 419),
  randomization_block INTEGER NOT NULL CHECK (randomization_block BETWEEN 0 AND 41),
  block_position INTEGER NOT NULL CHECK (block_position BETWEEN 1 AND 10),
  route_id TEXT NOT NULL CHECK (route_id IN ('R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10')),
  option_layout_id INTEGER NOT NULL CHECK (option_layout_id BETWEEN 0 AND 5),
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
  FOREIGN KEY (
    release_id, l1, allocation_index, randomization_block,
    block_position, route_id, option_layout_id
  ) REFERENCES runtime_allocation_slots(
    release_id, l1, allocation_index, randomization_block,
    block_position, route_id, option_layout_id
  ) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (submission_link_hmac),
  UNIQUE (study_id, participant_link_hmac),
  UNIQUE (release_id, l1, allocation_index),
  UNIQUE (session_id, option_layout_id)
);

-- These minimal append-only ledgers contain no direct participant identifiers
-- and preserve the cumulative start and completion counts even if linked
-- session rows must later be removed under an approved withdrawal/redaction
-- procedure. Allocation indices are therefore never recycled, and neither
-- stopping count can move backwards after a participant-data deletion.
CREATE TABLE allocation_start_ledger (
  release_id TEXT NOT NULL,
  l1 TEXT NOT NULL CHECK (l1 IN ('ja', 'vi')),
  allocation_index INTEGER NOT NULL CHECK (allocation_index BETWEEN 0 AND 419),
  PRIMARY KEY (release_id, l1, allocation_index),
  FOREIGN KEY (release_id, l1, allocation_index)
    REFERENCES runtime_allocation_slots(release_id, l1, allocation_index)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE protocol_completion_ledger (
  release_id TEXT NOT NULL,
  l1 TEXT NOT NULL CHECK (l1 IN ('ja', 'vi')),
  allocation_index INTEGER NOT NULL CHECK (allocation_index BETWEEN 0 AND 419),
  PRIMARY KEY (release_id, l1, allocation_index),
  FOREIGN KEY (release_id, l1, allocation_index)
    REFERENCES allocation_start_ledger(release_id, l1, allocation_index)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE testlet_submissions (
  session_id TEXT NOT NULL,
  testlet_ordinal INTEGER NOT NULL CHECK (testlet_ordinal BETWEEN 0 AND 99),
  testlet_id TEXT NOT NULL,
  option_layout_id INTEGER NOT NULL CHECK (option_layout_id BETWEEN 0 AND 5),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  payload_sha256 TEXT NOT NULL
    CHECK (length(payload_sha256) = 64 AND payload_sha256 NOT GLOB '*[^0-9a-f]*'),
  client_started_at TEXT NOT NULL,
  client_submitted_at TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms BETWEEN 0 AND 7200000),
  received_at TEXT NOT NULL,
  PRIMARY KEY (session_id, testlet_ordinal),
  UNIQUE (session_id, idempotency_key),
  UNIQUE (session_id, testlet_ordinal, testlet_id),
  FOREIGN KEY (session_id, option_layout_id) REFERENCES sessions(session_id, option_layout_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE responses (
  session_id TEXT NOT NULL,
  response_ordinal INTEGER NOT NULL CHECK (response_ordinal BETWEEN 1 AND 300),
  testlet_ordinal INTEGER NOT NULL CHECK (testlet_ordinal BETWEEN 0 AND 99),
  testlet_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_position_within_testlet INTEGER NOT NULL CHECK (item_position_within_testlet BETWEEN 1 AND 3),
  selected_option TEXT NOT NULL CHECK (length(selected_option) BETWEEN 1 AND 256),
  selected_option_position INTEGER NOT NULL CHECK (selected_option_position BETWEEN 1 AND 6),
  recorded_at TEXT NOT NULL,
  CHECK (response_ordinal = testlet_ordinal * 3 + item_position_within_testlet),
  PRIMARY KEY (session_id, response_ordinal),
  UNIQUE (session_id, item_id),
  UNIQUE (session_id, testlet_ordinal, item_position_within_testlet),
  FOREIGN KEY (session_id, testlet_ordinal) REFERENCES testlet_submissions(session_id, testlet_ordinal)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (session_id, testlet_ordinal, testlet_id)
    REFERENCES testlet_submissions(session_id, testlet_ordinal, testlet_id)
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
CREATE INDEX idx_allocation_slots_release_l1 ON runtime_allocation_slots(release_id, l1, allocation_index);
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
    NEW.worker_version_id IS NOT OLD.worker_version_id OR
    NEW.public_build_manifest_sha256 IS NOT OLD.public_build_manifest_sha256 OR
    NEW.runtime_manifest_sha256 IS NOT OLD.runtime_manifest_sha256 OR
    NEW.bank_sha256 IS NOT OLD.bank_sha256 OR
    NEW.routes_sha256 IS NOT OLD.routes_sha256 OR
    NEW.runtime_bank_projection_sha256 IS NOT OLD.runtime_bank_projection_sha256 OR
    NEW.runtime_routes_projection_sha256 IS NOT OLD.runtime_routes_projection_sha256 OR
    NEW.allocation_schedule_sha256 IS NOT OLD.allocation_schedule_sha256 OR
    NEW.randomization_seed_fingerprint IS NOT OLD.randomization_seed_fingerprint OR
    NEW.randomization_algorithm IS NOT OLD.randomization_algorithm OR
    NEW.option_layout_algorithm IS NOT OLD.option_layout_algorithm OR
    NEW.participant_hmac_key_fingerprint IS NOT OLD.participant_hmac_key_fingerprint OR
    NEW.prolific_completion_code_fingerprint IS NOT OLD.prolific_completion_code_fingerprint OR
    NEW.prolific_completion_action IS NOT OLD.prolific_completion_action OR
    NEW.target_protocol_completers_per_l1 IS NOT OLD.target_protocol_completers_per_l1 OR
    NEW.hard_cap_starts_per_l1 IS NOT OLD.hard_cap_starts_per_l1 OR
    NEW.stop_new_allocations_at_target IS NOT OLD.stop_new_allocations_at_target OR
    NEW.retain_server_committed_partial_responses IS NOT OLD.retain_server_committed_partial_responses OR
    NEW.protocol_completion_definition IS NOT OLD.protocol_completion_definition OR
    NEW.partial_response_retention_definition IS NOT OLD.partial_response_retention_definition OR
    NEW.expected_testlets IS NOT OLD.expected_testlets OR
    NEW.expected_items IS NOT OLD.expected_items OR
    NEW.expected_breaks IS NOT OLD.expected_breaks OR
    NEW.created_at IS NOT OLD.created_at OR
    NEW.frozen_at IS NOT OLD.frozen_at
  THEN RAISE(ABORT, 'runtime release activation may only change active') END;

  SELECT CASE WHEN NEW.frozen_at IS NULL OR
    NEW.worker_version_id IS NULL OR
    NEW.allocation_schedule_sha256 IS NULL OR
    NEW.randomization_seed_fingerprint IS NULL OR
    NEW.randomization_algorithm IS NULL OR
    NEW.option_layout_algorithm IS NULL OR
    NEW.participant_hmac_key_fingerprint IS NULL OR
    NEW.prolific_completion_code_fingerprint IS NULL OR
    NEW.prolific_completion_action IS NULL
    THEN RAISE(ABORT, 'runtime release identity is incomplete') END;

  SELECT CASE WHEN
    NEW.randomization_algorithm IS NOT 'hmac-sha256-permuted-blocks-10-crossed-option-williams-6-v1' OR
    NEW.option_layout_algorithm IS NOT 'even-order-williams-square-6-canonical-first-v1'
    THEN RAISE(ABORT, 'runtime release randomization algorithms are unsupported') END;

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

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM runtime_allocation_slots WHERE release_id = NEW.release_id
  ) <> 840 OR (
    SELECT COUNT(*) FROM runtime_allocation_slots WHERE release_id = NEW.release_id AND l1 = 'ja'
  ) <> 420 OR (
    SELECT COUNT(*) FROM runtime_allocation_slots WHERE release_id = NEW.release_id AND l1 = 'vi'
  ) <> 420
    THEN RAISE(ABORT, 'runtime release requires exactly 420 allocation slots per L1') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM (
      SELECT l1, randomization_block
      FROM runtime_allocation_slots
      WHERE release_id = NEW.release_id
      GROUP BY l1, randomization_block
      HAVING COUNT(*) = 10 AND
        COUNT(DISTINCT route_id) = 10 AND
        COUNT(DISTINCT option_layout_id) = 6
    )
  ) <> 84
    THEN RAISE(ABORT, 'runtime release requires 84 complete route-and-layout randomization blocks') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM (
      SELECT l1, randomization_block, option_layout_id, COUNT(*) AS layout_count
      FROM runtime_allocation_slots
      WHERE release_id = NEW.release_id
      GROUP BY l1, randomization_block, option_layout_id
      HAVING COUNT(*) NOT BETWEEN 1 AND 2
    )
  ) <> 0
    THEN RAISE(ABORT, 'runtime release block-layout counts must be one or two') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM (
      SELECT l1, route_id, option_layout_id
      FROM runtime_allocation_slots
      WHERE release_id = NEW.release_id
      GROUP BY l1, route_id, option_layout_id
      HAVING COUNT(*) = 7
    )
  ) <> 120
    THEN RAISE(ABORT, 'runtime release requires every L1-route-layout cell exactly seven times') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM allocation_start_ledger WHERE release_id = NEW.release_id
  ) <> 0 OR (
    SELECT COUNT(*) FROM protocol_completion_ledger WHERE release_id = NEW.release_id
  ) <> 0
    THEN RAISE(ABORT, 'runtime release cannot activate after participant allocation') END;
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

CREATE TRIGGER runtime_allocation_slots_reject_active_release_insert
BEFORE INSERT ON runtime_allocation_slots
WHEN EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = NEW.release_id AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active release allocation slots are immutable');
END;

CREATE TRIGGER runtime_allocation_slots_reject_active_release_update
BEFORE UPDATE ON runtime_allocation_slots
WHEN EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = OLD.release_id AND active = 1
) OR EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = NEW.release_id AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active release allocation slots are immutable');
END;

CREATE TRIGGER runtime_allocation_slots_reject_active_release_delete
BEFORE DELETE ON runtime_allocation_slots
WHEN EXISTS (
  SELECT 1 FROM runtime_releases WHERE release_id = OLD.release_id AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active release allocation slots are immutable');
END;

-- Session linkage and allocation identity are fixed at insertion. Token,
-- progress counters, status, and completion timestamps remain mutable through
-- the audited Worker state machine.
CREATE TRIGGER sessions_reject_identity_update
BEFORE UPDATE ON sessions
WHEN
  NEW.session_id IS NOT OLD.session_id OR
  NEW.release_id IS NOT OLD.release_id OR
  NEW.study_id IS NOT OLD.study_id OR
  NEW.l1 IS NOT OLD.l1 OR
  NEW.participant_link_hmac IS NOT OLD.participant_link_hmac OR
  NEW.submission_link_hmac IS NOT OLD.submission_link_hmac OR
  NEW.allocation_index IS NOT OLD.allocation_index OR
  NEW.randomization_block IS NOT OLD.randomization_block OR
  NEW.block_position IS NOT OLD.block_position OR
  NEW.route_id IS NOT OLD.route_id OR
  NEW.option_layout_id IS NOT OLD.option_layout_id OR
  NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'session linkage and allocation identity are immutable');
END;

CREATE TRIGGER sessions_record_start
AFTER INSERT ON sessions
BEGIN
  INSERT INTO allocation_start_ledger (release_id, l1, allocation_index)
  VALUES (NEW.release_id, NEW.l1, NEW.allocation_index);
END;

CREATE TRIGGER allocation_start_ledger_require_session
BEFORE INSERT ON allocation_start_ledger
WHEN NOT EXISTS (
  SELECT 1 FROM sessions s
  WHERE s.release_id = NEW.release_id AND s.l1 = NEW.l1
    AND s.allocation_index = NEW.allocation_index
)
BEGIN
  SELECT RAISE(ABORT, 'allocation start ledger requires its originating session');
END;

CREATE TRIGGER sessions_require_in_progress_insert
BEFORE INSERT ON sessions
WHEN NEW.status <> 'in_progress'
BEGIN
  SELECT RAISE(ABORT, 'sessions must begin in progress');
END;

CREATE TRIGGER sessions_reject_completion_reversal
BEFORE UPDATE OF status ON sessions
WHEN OLD.status = 'completed' AND NEW.status <> 'completed'
BEGIN
  SELECT RAISE(ABORT, 'protocol completion is irreversible');
END;

CREATE TRIGGER sessions_validate_protocol_completion
BEFORE UPDATE OF status ON sessions
WHEN OLD.status = 'in_progress' AND NEW.status = 'completed'
BEGIN
  SELECT CASE WHEN
    (SELECT COUNT(*) FROM testlet_submissions ts
      WHERE ts.session_id = NEW.session_id) <> 100 OR
    (SELECT COUNT(*) FROM responses r
      WHERE r.session_id = NEW.session_id) <> 300 OR
    (SELECT COUNT(*) FROM session_events e
      WHERE e.session_id = NEW.session_id AND e.event_type = 'break_completed'
        AND e.event_ordinal BETWEEN 1 AND 9) <> 9 OR
    (SELECT COUNT(*)
      FROM testlet_submissions ts
      LEFT JOIN runtime_route_testlets rr
        ON rr.release_id = NEW.release_id AND rr.route_id = NEW.route_id
          AND rr.testlet_ordinal = ts.testlet_ordinal AND rr.testlet_id = ts.testlet_id
      WHERE ts.session_id = NEW.session_id AND rr.testlet_id IS NULL) <> 0 OR
    (SELECT COUNT(*) FROM testlet_submissions ts
      WHERE ts.session_id = NEW.session_id AND ts.option_layout_id <> NEW.option_layout_id) <> 0
  THEN RAISE(ABORT, 'protocol completion requires the full verified response and break record') END;
END;

CREATE TRIGGER sessions_record_completion
AFTER UPDATE OF status ON sessions
WHEN OLD.status = 'in_progress' AND NEW.status = 'completed'
BEGIN
  INSERT INTO protocol_completion_ledger (release_id, l1, allocation_index)
  VALUES (NEW.release_id, NEW.l1, NEW.allocation_index);
END;

CREATE TRIGGER protocol_completion_ledger_require_verified_session
BEFORE INSERT ON protocol_completion_ledger
WHEN NOT EXISTS (
  SELECT 1 FROM sessions s
  WHERE s.release_id = NEW.release_id AND s.l1 = NEW.l1
    AND s.allocation_index = NEW.allocation_index AND s.status = 'completed'
)
BEGIN
  SELECT RAISE(ABORT, 'protocol completion ledger requires a verified completed session');
END;

CREATE TRIGGER allocation_start_ledger_reject_update
BEFORE UPDATE ON allocation_start_ledger
BEGIN
  SELECT RAISE(ABORT, 'allocation start ledger is append-only');
END;

CREATE TRIGGER allocation_start_ledger_reject_delete
BEFORE DELETE ON allocation_start_ledger
BEGIN
  SELECT RAISE(ABORT, 'allocation start ledger is append-only');
END;

CREATE TRIGGER protocol_completion_ledger_reject_update
BEFORE UPDATE ON protocol_completion_ledger
BEGIN
  SELECT RAISE(ABORT, 'protocol completion ledger is append-only');
END;

CREATE TRIGGER protocol_completion_ledger_reject_delete
BEFORE DELETE ON protocol_completion_ledger
BEGIN
  SELECT RAISE(ABORT, 'protocol completion ledger is append-only');
END;

-- Validate each stored choice against the frozen testlet, canonical item row,
-- session layout, and displayed option position. This independently checks the
-- Worker-computed position at the D1 boundary.
CREATE TRIGGER responses_validate_runtime_mapping
BEFORE INSERT ON responses
WHEN NOT EXISTS (
  SELECT 1
  FROM testlet_submissions ts
  JOIN sessions s ON s.session_id = ts.session_id
  JOIN runtime_testlets t
    ON t.release_id = s.release_id AND t.testlet_id = ts.testlet_id
  WHERE ts.session_id = NEW.session_id
    AND ts.testlet_ordinal = NEW.testlet_ordinal
    AND ts.testlet_id = NEW.testlet_id
    AND ts.option_layout_id = s.option_layout_id
    AND json_extract(
      t.items_json,
      '$[' || CAST(NEW.item_position_within_testlet - 1 AS TEXT) || '].itemId'
    ) = NEW.item_id
    AND json_extract(
      t.items_json,
      '$[' || CAST(NEW.item_position_within_testlet - 1 AS TEXT) || '].itemPositionWithinTestlet'
    ) = NEW.item_position_within_testlet
    AND json_extract(
      t.options_json,
      '$[' || CAST(
        CASE s.option_layout_id * 10 + NEW.selected_option_position
          WHEN 1 THEN 0 WHEN 2 THEN 1 WHEN 3 THEN 2 WHEN 4 THEN 3 WHEN 5 THEN 4 WHEN 6 THEN 5
          WHEN 11 THEN 1 WHEN 12 THEN 3 WHEN 13 THEN 0 WHEN 14 THEN 5 WHEN 15 THEN 2 WHEN 16 THEN 4
          WHEN 21 THEN 3 WHEN 22 THEN 5 WHEN 23 THEN 1 WHEN 24 THEN 4 WHEN 25 THEN 0 WHEN 26 THEN 2
          WHEN 31 THEN 5 WHEN 32 THEN 4 WHEN 33 THEN 3 WHEN 34 THEN 2 WHEN 35 THEN 1 WHEN 36 THEN 0
          WHEN 41 THEN 4 WHEN 42 THEN 2 WHEN 43 THEN 5 WHEN 44 THEN 0 WHEN 45 THEN 3 WHEN 46 THEN 1
          WHEN 51 THEN 2 WHEN 52 THEN 0 WHEN 53 THEN 4 WHEN 54 THEN 1 WHEN 55 THEN 5 WHEN 56 THEN 3
          ELSE -1
        END AS TEXT
      ) || ']'
    ) = NEW.selected_option
)
BEGIN
  SELECT RAISE(ABORT, 'response does not match frozen runtime content and option layout');
END;

CREATE TRIGGER testlet_submissions_reject_update
BEFORE UPDATE ON testlet_submissions
BEGIN
  SELECT RAISE(ABORT, 'testlet submissions are append-only');
END;

CREATE TRIGGER testlet_submissions_reject_delete
BEFORE DELETE ON testlet_submissions
BEGIN
  SELECT RAISE(ABORT, 'testlet submissions are append-only');
END;

CREATE TRIGGER responses_reject_update
BEFORE UPDATE ON responses
BEGIN
  SELECT RAISE(ABORT, 'responses are append-only');
END;

CREATE TRIGGER responses_reject_delete
BEFORE DELETE ON responses
BEGIN
  SELECT RAISE(ABORT, 'responses are append-only');
END;

CREATE TRIGGER session_events_reject_update
BEFORE UPDATE ON session_events
BEGIN
  SELECT RAISE(ABORT, 'session events are append-only');
END;

CREATE TRIGGER session_events_reject_delete
BEFORE DELETE ON session_events
BEGIN
  SELECT RAISE(ABORT, 'session events are append-only');
END;

CREATE TRIGGER sessions_reject_delete
BEFORE DELETE ON sessions
BEGIN
  SELECT RAISE(ABORT, 'sessions require an approved withdrawal-redaction migration');
END;
