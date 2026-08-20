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
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_KEY || ""
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "school-management-system" });
});

app.get("/api/dashboard", async (_req, res) => {
  try {
    const tables = ["students", "classes", "subjects", "enrollments"];
    const counts = {};
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      counts[table] = count || 0;
    }

    const { data: session } = await supabase
      .from("academic_sessions")
      .select("id, name, status")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: semester } = await supabase
      .from("semesters")
      .select("id, name, status")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({ counts, session, semester });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/students", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const { data, error } = await supabase
      .from("students")
      .select(`
        id, student_id, full_name, gender, date_of_birth, status,
        enrollments (
          id, class_id,
          classes (id, name)
        )
      `)
      .order("full_name")
      .limit(limit);

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/classes", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("classes")
      .select("id, name, level, section")
      .order("sort_order");
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/sessions", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("academic_sessions")
      .select("id, name, status, start_date, end_date")
      .order("start_date", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`School Management System running on port ${PORT}`);
});