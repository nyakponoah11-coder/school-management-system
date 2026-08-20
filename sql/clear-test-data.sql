-- SUKLADZI D/A BASIC SCHOOL
-- Clear all test data before handing the system to the school.
-- This removes records but keeps all tables, columns, policies and functions.
-- Run this file once in the Supabase SQL Editor.
-- WARNING: this permanently deletes all current school data.

begin;

-- Delete dependent records first.
delete from audit_logs;
delete from report_cards;
delete from scores;
delete from fee_records;
delete from enrollments;
delete from subjects;
delete from students;
delete from semesters;
delete from academic_sessions;
delete from classes;
delete from school_settings;
delete from app_users;

commit;

-- The system is now empty. Add the school's real classes, students,
-- subjects, sessions and fees through the application.
