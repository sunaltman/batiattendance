-- Den Samot Attendance — Supabase schema
-- Run this in the SQL editor of the EXISTING Bati Supabase project.
-- All tables are prefixed with ds_ to avoid conflicts with Bati's tables
-- (employees, attendance_logs, leave_records, payroll_records).

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ds_locations (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  pin               TEXT NOT NULL,          -- 4-digit kiosk setup PIN
  telegram_chat_id  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ds_employees (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  department  TEXT NOT NULL DEFAULT '',     -- 'Logistics' triggers grace period
  location_id TEXT REFERENCES ds_locations(id),
  start_date  DATE,
  is_active   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS ds_scans (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id            TEXT NOT NULL REFERENCES ds_employees(id),
  location_id            TEXT NOT NULL REFERENCES ds_locations(id),
  date                   DATE NOT NULL,
  scan_type              TEXT NOT NULL CHECK (
                           scan_type IN ('morning_in','morning_out','afternoon_in','afternoon_out')
                         ),
  scanned_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_late                BOOLEAN NOT NULL DEFAULT false,
  late_minutes           INTEGER,
  late_reason_audio_url  TEXT,
  missing_afternoon_in   BOOLEAN NOT NULL DEFAULT false,
  verified               BOOLEAN NOT NULL DEFAULT false
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ds_scans_emp_date ON ds_scans (employee_id, date);
CREATE INDEX IF NOT EXISTS ds_scans_loc_date ON ds_scans (location_id, date);

-- ── Storage buckets (run in dashboard or via API) ────────────────────────────
-- 1. Create bucket  'ds-employee-faces'  (public, max 5MB per file)
-- 2. Create bucket  'ds-late-reasons'    (private, max 20MB per file)
-- (Separate from Bati's 'employee-faces' bucket)

-- ── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE ds_locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ds_employees  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ds_scans      ENABLE ROW LEVEL SECURITY;

-- ds_locations: anon read (PIN lookup)
CREATE POLICY "ds_anon_read_locations" ON ds_locations FOR SELECT TO anon USING (true);
CREATE POLICY "ds_auth_read_location"  ON ds_locations FOR SELECT TO authenticated
  USING (id = (auth.jwt()->'user_metadata'->>'location_id'));

-- ds_employees: anon read (kiosk face verify)
CREATE POLICY "ds_anon_read_employees" ON ds_employees FOR SELECT TO anon USING (true);
CREATE POLICY "ds_auth_read_employees" ON ds_employees FOR SELECT TO authenticated
  USING (location_id = (auth.jwt()->'user_metadata'->>'location_id'));

-- ds_scans: anon insert + update (kiosk), auth read/update own location
CREATE POLICY "ds_anon_insert_scans" ON ds_scans FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "ds_anon_update_scans" ON ds_scans FOR UPDATE TO anon USING (true);
CREATE POLICY "ds_auth_read_scans"   ON ds_scans FOR SELECT TO authenticated
  USING (location_id = (auth.jwt()->'user_metadata'->>'location_id'));
CREATE POLICY "ds_auth_update_scans" ON ds_scans FOR UPDATE TO authenticated
  USING (location_id = (auth.jwt()->'user_metadata'->>'location_id'));

-- ── Seed data (update PINs before going live) ────────────────────────────────
INSERT INTO ds_locations (id, name, pin, telegram_chat_id) VALUES
  ('warehouse', 'ឃ្លាំង (Warehouse)', '1234', ''),
  ('loc-01',   'សាខា ១ (Branch 1)',   '2345', ''),
  ('loc-02',   'សាខា ២ (Branch 2)',   '3456', ''),
  ('loc-03',   'សាខា ៣ (Branch 3)',   '4567', ''),
  ('loc-04',   'សាខា ៤ (Branch 4)',   '5678', ''),
  ('loc-05',   'សាខា ៥ (Branch 5)',   '6789', ''),
  ('loc-06',   'សាខា ៦ (Branch 6)',   '7890', ''),
  ('loc-07',   'សាខា ៧ (Branch 7)',   '8901', ''),
  ('loc-08',   'សាខា ៨ (Branch 8)',   '9012', '')
ON CONFLICT DO NOTHING;
