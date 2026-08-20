import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 10000;

// --------------------------------------------------
// SUPABASE
// --------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Supabase environment variables are missing.");
  console.error("SUPABASE_URL:", SUPABASE_URL ? "SET" : "MISSING");
  console.error("SUPABASE_KEY:", SUPABASE_KEY ? "SET" : "MISSING");

  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend files
app.use(express.static(path.join(__dirname, "public")));

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "school-management-system"
  });
});

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

app.get("/api/dashboard", async (_req, res) => {
  try {
    const tables = [
      "students",
      "classes",
      "subjects",
      "enrollments"
    ];

    const counts = {};

    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select("*", {
          count: "exact",
          head: true
        });

      if (error) {
        throw error;
      }

      counts[table] = count || 0;
    }

    // Active academic session
    const { data: session, error: sessionError } = await supabase
      .from("academic_sessions")
      .select("id, name, status")
      .eq("status", "active")
      .order("created_at", {
        ascending: false
      })
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      throw sessionError;
    }

    // Active semester
    const { data: semester, error: semesterError } = await supabase
      .from("semesters")
      .select("id, name, status")
      .eq("status", "active")
      .order("created_at", {
        ascending: false
      })
      .limit(1)
      .maybeSingle();

    if (semesterError) {
      throw semesterError;
    }

    res.json({
      counts,
      session,
      semester
    });

  } catch (error) {
    console.error("Dashboard error:", error);

    res.status(500).json({
      error: error.message
    });
  }
});

// --------------------------------------------------
// STUDENTS
// --------------------------------------------------

app.get("/api/students", async (req, res) => {
  try {
    const limit = Math.min(
      Number(req.query.limit) || 20,
      100
    );

    const { data, error } = await supabase
      .from("students")
      .select(`
        id,
        student_id,
        full_name,
        gender,
        date_of_birth,
        status,
        enrollments (
          id,
          class_id,
          classes (
            id,
            name
          )
        )
      `)
      .order("full_name")
      .limit(limit);

    if (error) {
      throw error;
    }

    res.json(data || []);

  } catch (error) {
    console.error("Students error:", error);

    res.status(500).json({
      error: error.message
    });
  }
});

// --------------------------------------------------
// CLASSES
// --------------------------------------------------

app.get("/api/classes", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("classes")
      .select(`
        id,
        name,
        level,
        section
      `)
      .order("sort_order");

    if (error) {
      throw error;
    }

    res.json(data || []);

  } catch (error) {
    console.error("Classes error:", error);

    res.status(500).json({
      error: error.message
    });
  }
});

// --------------------------------------------------
// ACADEMIC SESSIONS
// --------------------------------------------------

app.get("/api/sessions", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("academic_sessions")
      .select(`
        id,
        name,
        status,
        start_date,
        end_date
      `)
      .order("start_date", {
        ascending: false
      });

    if (error) {
      throw error;
    }

    res.json(data || []);

  } catch (error) {
    console.error("Sessions error:", error);

    res.status(500).json({
      error: error.message
    });
  }
});

// --------------------------------------------------
// FRONTEND FALLBACK
// Express 5 requires /{*splat} instead of *
// --------------------------------------------------

app.get("/{*splat}", (_req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `✅ School Management System running on port ${PORT}`
  );
});
