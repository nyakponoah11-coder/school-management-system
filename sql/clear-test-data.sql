-- SUKLADZI D/A BASIC SCHOOL
-- Clear all test data before handing the system to the school.
-- This removes records but keeps all tables, columns, policies and functions.
-- Run this file once in the Supabase SQL Editor.
-- WARNING: this permanently deletes all current school data.

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
	app_users,
	site_accounts
restart identity cascade;

commit;

select 'All school test data has been cleared.' as result;

-- The system is now empty. Add the school's real classes, students,
-- subjects, sessions and fees through the application.
