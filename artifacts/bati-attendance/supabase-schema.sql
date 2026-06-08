-- Run this SQL in your Supabase SQL Editor to set up the database schema.

-- Table 1: employees
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  start_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- Table 2: attendance_logs
CREATE TABLE IF NOT EXISTS attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT REFERENCES employees(id),
  date DATE NOT NULL,
  shift TEXT NOT NULL CHECK (shift IN ('morning', 'afternoon')),
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  verified BOOLEAN DEFAULT FALSE
);

-- Table 3: leave_records
CREATE TABLE IF NOT EXISTS leave_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT REFERENCES employees(id),
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('full', 'half')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (optional but recommended)
-- For now, allow all operations without auth (add auth later)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON attendance_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON leave_records FOR ALL USING (true) WITH CHECK (true);
