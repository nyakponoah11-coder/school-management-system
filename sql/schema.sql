-- SCHOOL MANAGEMENT SYSTEM
-- Supabase / PostgreSQL schema
-- Run this file in the Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists school_settings (
  id uuid primary key default gen_random_uuid(),
  school_name text not null default 'My School',
  school_logo_url text,
  address text,
  phone text,
  email text,
  motto text,
  grading_config jsonb not null default '[
    {"min":80,"max":100,"grade":"A","remark":"Excellent"},
    {"min":70,"max":79.99,"grade":"B","remark":"Very Good"},
    {"min":60,"max":69.99,"grade":"C","remark":"Good"},
    {"min":50,"max":59.99,"grade":"D","remark":"Pass"},
    {"min":40,"max":49.99,"grade":"E","remark":"Weak"},
    {"min":0,"max":39.99,"grade":"F","remark":"Fail"}
  ]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'admin' check (role in ('headmaster','admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists academic_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date,
  end_date date,
  status text not null default 'planned' check (status in ('planned','active','closed')),
  created_at timestamptz not null default now()
);

create table if not exists semesters (
  id uuid primary key default gen_random_uuid(),
  academic_session_id uuid not null references academic_sessions(id) on delete restrict,
  name text not null check (name in ('First Semester','Second Semester','Third Semester')),
  sequence_no int not null check (sequence_no between 1 and 3),
  status text not null default 'planned' check (status in ('planned','active','closed')),
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (academic_session_id, sequence_no)
);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  level text not null,
  section text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  class_id uuid references classes(id) on delete cascade,
  max_class_score numeric(5,2) not null default 30,
  max_exam_score numeric(5,2) not null default 70,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  student_id text unique,
  full_name text not null,
  gender text check (gender in ('Male','Female','Other')),
  date_of_birth date,
  guardian_name text,
  guardian_phone text,
  photo_url text,
  admission_date date default current_date,
  status text not null default 'active' check (status in ('active','inactive','graduated','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  academic_session_id uuid not null references academic_sessions(id) on delete restrict,
  class_id uuid not null references classes(id) on delete restrict,
  roll_number text,
  enrollment_status text not null default 'active' check (enrollment_status in ('active','promoted','repeated','withdrawn','graduated')),
  created_at timestamptz not null default now(),
  unique(student_id, academic_session_id)
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments(id) on delete restrict,
  semester_id uuid not null references semesters(id) on delete restrict,
  subject_id uuid not null references subjects(id) on delete restrict,
  class_score numeric(6,2) not null default 0 check (class_score >= 0),
  exam_score numeric(6,2) not null default 0 check (exam_score >= 0),
  total_score numeric(6,2) generated always as (class_score + exam_score) stored,
  grade text,
  remark text,
  entered_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(enrollment_id, semester_id, subject_id)
);

create table if not exists report_cards (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments(id) on delete restrict,
  semester_id uuid not null references semesters(id) on delete restrict,
  total_score numeric(10,2) not null default 0,
  average_score numeric(6,2) not null default 0,
  position int,
  class_size int,
  best_subject_id uuid references subjects(id) on delete set null,
  overall_remark text,
  generated_at timestamptz not null default now(),
  generated_by uuid references app_users(id) on delete set null,
  unique(enrollment_id, semester_id)
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create table if not exists fee_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid','part-paid','paid','waived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_enrollments_session_class on enrollments(academic_session_id, class_id);
create index if not exists idx_scores_semester on scores(semester_id);
create index if not exists idx_scores_enrollment on scores(enrollment_id);
create index if not exists idx_reports_semester on report_cards(semester_id);

insert into classes (name, level, sort_order) values
('KG 1','KG',10), ('KG 2','KG',20),
('Primary 1','Primary',30), ('Primary 2','Primary',40),
('Primary 3','Primary',50), ('Primary 4','Primary',60),
('Primary 5','Primary',70), ('Primary 6','Primary',80),
('JHS 1','JHS',90), ('JHS 2','JHS',100), ('JHS 3','JHS',110),
('SHS 1','SHS',120), ('SHS 2','SHS',130), ('SHS 3','SHS',140)
on conflict (name) do nothing;

insert into academic_sessions (name, status)
values ('2026/2027','active')
on conflict (name) do nothing;

insert into semesters (academic_session_id, name, sequence_no, status, opened_at)
select id, 'First Semester', 1, 'active', now()
from academic_sessions
where name = '2026/2027'
on conflict (academic_session_id, sequence_no) do nothing;

-- The current app uses the Supabase anon key and has no login screen.
-- Replace anon with authenticated after adding Supabase Auth.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'school_settings', 'app_users', 'academic_sessions', 'semesters',
    'classes', 'subjects', 'students', 'enrollments', 'scores',
    'report_cards', 'audit_logs'
    , 'fee_records'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('drop policy if exists "prototype_anon_all" on %I', table_name);
    execute format('create policy "prototype_anon_all" on %I for all to anon, authenticated using (true) with check (true)', table_name);
  end loop;
end $$;

-- Existing databases: allow students to be saved without a student ID.
alter table students alter column student_id drop not null;
