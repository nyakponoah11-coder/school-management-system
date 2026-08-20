# School Management System

Render-ready school management system starter.

## Stack
- Node.js
- Express
- Supabase/PostgreSQL
- HTML/CSS/JavaScript
- Render

## 1. Supabase

Open the Supabase SQL Editor and run:

`sql/schema.sql`

This creates the academic-session/semester/enrollment structure. Previous enrollments, scores and reports are preserved.

## 2. Local setup

```bash
npm install
copy .env.example .env
npm start
```

On macOS/Linux:

```bash
cp .env.example .env
npm install
npm start
```

Set your Supabase URL and anon key in `.env`.

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` for the site login. The development defaults are `admin@sukladzi.local` and `admin123`; change them before deployment.

## 3. Render

Create a Web Service connected to this repository.

Build Command:

```text
npm install
```

Start Command:

```text
npm start
```

Environment variables:

```text
SUPABASE_URL=...
SUPABASE_KEY=...
SESSION_SECRET=...
```

Health endpoint:

```text
/health
```

## Important security note

The included RLS policies are intentionally permissive for the prototype. Before production, replace them with role-aware policies tied to `app_users` and Supabase Auth. Do not expose a service-role key in frontend code.

## Planned next modules

- Supabase Auth login
- Headmaster/admin permissions
- Add/edit student forms
- Student enrollment
- Subject management
- Score entry grid
- Configurable grading
- Automatic class ranking
- Best-subject calculation
- Report-card PDF generation
- Semester closing
- New-semester workflow
- Student promotion
- Audit logs
