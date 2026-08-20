-- SUKLADZI D/A BASIC SCHOOL
-- WARNING: Permanently clears all school data.
-- Keeps tables, columns, policies and database structure.
-- Does not delete Supabase Auth users.

begin;

truncate table
  audit_logs,
  report_cards,
  scores,
  fee_records,
  enrollments,
  subjects,
  students,
  semesters,
  academic_sessions,
  classes,
  school_settings,
  app_users
restart identity cascade;

commit;

select 'All school test data has been cleared.' as result;
