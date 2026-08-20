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

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Supabase environment variables are missing.");
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

// ======================================================
// HELPERS
// ======================================================

function errorMessage(error) {
  return error?.message || "Unknown server error";
}

function sendError(res, error, status = 500) {
  console.error(error);
  const message = errorMessage(error);
  const isPolicyError = /row-level security|permission denied|violates.*policy/i.test(message);
  res.status(status).json({
    success: false,
    error: isPolicyError
      ? "Supabase blocked this change. Run the project's SQL schema and RLS policies in Supabase, then try again."
      : message
  });
}

async function audit(action, entityType = null, entityId = null, details = {}) {
  try {
    await supabase.from("audit_logs").insert({
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details
    });
  } catch (error) {
    console.warn("Audit log failed:", error.message);
  }
}

async function getActiveSession() {
  const { data, error } = await supabase
    .from("academic_sessions")
    .select("id,name,status,start_date,end_date")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data;
}

async function getActiveSemester() {
  const { data, error } = await supabase
    .from("semesters")
    .select(`
      id,
      academic_session_id,
      name,
      sequence_no,
      status
    `)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data;
}

async function calculateGrade(total) {
  const { data, error } = await supabase
    .from("school_settings")
    .select("grading_config")
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const config = data?.grading_config || [];

  const item = config.find(
    g => total >= Number(g.min) && total <= Number(g.max)
  );

  return {
    grade: item?.grade || "",
    remark: item?.remark || ""
  };
}

// ======================================================
// HEALTH
// ======================================================

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "school-management-system"
  });
});

// ======================================================
// DASHBOARD
// ======================================================

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

      if (error) throw error;

      counts[table] = count || 0;
    }

    const session = await getActiveSession();
    const semester = await getActiveSemester();

    res.json({
      success: true,
      counts,
      session,
      semester
    });

  } catch (error) {
    sendError(res, error);
  }
});

// ======================================================
// STUDENTS - GET
// ======================================================

app.get("/api/students", async (req, res) => {
  try {
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 100, 1),
      500
    );

    const search = String(req.query.search || "").trim();

    let query = supabase
      .from("students")
      .select(`
        id,
        student_id,
        full_name,
        gender,
        date_of_birth,
        guardian_name,
        guardian_phone,
        admission_date,
        status,
        created_at,
        enrollments (
          id,
          academic_session_id,
          class_id,
          roll_number,
          enrollment_status,
          academic_sessions (
            id,
            name
          ),
          classes (
            id,
            name,
            level,
            section
          )
        )
      `)
      .order("full_name")
      .limit(limit);

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,student_id.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);

  } catch (error) {
    sendError(res, error);
  }
});

// ======================================================
// STUDENT - GET ONE
// ======================================================

app.get("/api/students/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("students")
      .select(`
        *,
        enrollments (
          *,
          academic_sessions (*),
          classes (*)
        )
      `)
      .eq("id", req.params.id)
      .single();

    if (error) throw error;

    res.json(data);

  } catch (error) {
    sendError(res, error, 404);
  }
});

// ======================================================
// STUDENT - CREATE
// ======================================================

app.post("/api/students", async (req, res) => {
  try {
    const {
      student_id,
      full_name,
      gender,
      date_of_birth,
      guardian_name,
      guardian_phone,
      admission_date,
      status,
      class_id,
      academic_session_id,
      roll_number
    } = req.body;

    if (!student_id || !full_name) {
      return res.status(400).json({
        success: false,
        error: "Student ID and full name are required."
      });
    }

    const { data: student, error: studentError } =
      await supabase
        .from("students")
        .insert({
          student_id,
          full_name,
          gender: gender || null,
          date_of_birth: date_of_birth || null,
          guardian_name: guardian_name || null,
          guardian_phone: guardian_phone || null,
          admission_date: admission_date || null,
          status: status || "active"
        })
        .select()
        .single();

    if (studentError) throw studentError;

    // Create enrollment if class + session were supplied.
    if (class_id && academic_session_id) {
      const { error: enrollmentError } = await supabase
        .from("enrollments")
        .insert({
          student_id: student.id,
          academic_session_id,
          class_id,
          roll_number: roll_number || null,
          enrollment_status: "active"
        });

      if (enrollmentError) {
        await supabase
          .from("students")
          .delete()
          .eq("id", student.id);

        throw enrollmentError;
      }
    }

    await audit(
      "CREATE",
      "student",
      student.id,
      { student_id, full_name }
    );

    res.status(201).json({
      success: true,
      student
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

// ======================================================
// STUDENT - UPDATE
// ======================================================

app.put("/api/students/:id", async (req, res) => {
  try {
    const allowed = [
      "student_id",
      "full_name",
      "gender",
      "date_of_birth",
      "guardian_name",
      "guardian_phone",
      "admission_date",
      "status"
    ];

    const updates = {};

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field] || null;
      }
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("students")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    await audit(
      "UPDATE",
      "student",
      req.params.id,
      updates
    );

    res.json({
      success: true,
      student: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

// ======================================================
// STUDENT - DELETE
// ======================================================

app.delete("/api/students/:id", async (req, res) => {
  try {
    // We deliberately do not physically delete students
    // because historical records must remain preserved.
    const { data, error } = await supabase
      .from("students")
      .update({
        status: "inactive",
        updated_at: new Date().toISOString()
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    await audit(
      "ARCHIVE",
      "student",
      req.params.id
    );

    res.json({
      success: true,
      student: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post("/api/enrollments", async (req, res) => {
  try {
    const { student_id, academic_session_id, class_id, roll_number } = req.body;

    if (!student_id || !academic_session_id || !class_id) {
      return res.status(400).json({
        success: false,
        error: "Student, academic session and class are required."
      });
    }

    const { data, error } = await supabase
      .from("enrollments")
      .upsert({
        student_id,
        academic_session_id,
        class_id,
        roll_number: roll_number || null,
        enrollment_status: "active"
      }, { onConflict: "student_id,academic_session_id" })
      .select()
      .single();

    if (error) throw error;

    await audit("CREATE", "enrollment", data.id, data);
    res.status(201).json({ success: true, enrollment: data });
  } catch (error) {
    sendError(res, error, 400);
  }
});

// ======================================================
// CLASSES
// ======================================================

app.get("/api/classes", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("classes")
      .select(`
        id,
        name,
        level,
        section,
        sort_order,
        is_active
      `)
      .order("sort_order")
      .order("name");

    if (error) throw error;

    res.json(data || []);

  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/classes", async (req, res) => {
  try {
    const {
      name,
      level,
      section,
      sort_order
    } = req.body;

    if (!name || !level) {
      return res.status(400).json({
        success: false,
        error: "Class name and level are required."
      });
    }

    const { data, error } = await supabase
      .from("classes")
      .insert({
        name,
        level,
        section: section || null,
        sort_order: Number(sort_order) || 0
      })
      .select()
      .single();

    if (error) throw error;

    await audit("CREATE", "class", data.id, data);

    res.status(201).json({
      success: true,
      class: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

app.put("/api/classes/:id", async (req, res) => {
  try {
    const { name, level, section, sort_order, is_active } = req.body;

    const { data, error } = await supabase
      .from("classes")
      .update({
        name,
        level,
        section: section || null,
        sort_order: Number(sort_order) || 0,
        is_active:
          is_active === undefined ? true : Boolean(is_active)
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    await audit("UPDATE", "class", req.params.id, data);

    res.json({
      success: true,
      class: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

app.delete("/api/classes/:id", async (req, res) => {
  try {
    // Archive instead of deleting because enrollments reference classes.
    const { data, error } = await supabase
      .from("classes")
      .update({
        is_active: false
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    await audit("ARCHIVE", "class", req.params.id);

    res.json({
      success: true,
      class: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

// ======================================================
// SUBJECTS
// ======================================================

app.get("/api/subjects", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("subjects")
      .select(`
        id,
        code,
        name,
        class_id,
        max_class_score,
        max_exam_score,
        is_active,
        classes (
          id,
          name
        )
      `)
      .order("name");

    if (error) throw error;

    res.json(data || []);

  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/subjects", async (req, res) => {
  try {
    const {
      code,
      name,
      class_id,
      max_class_score,
      max_exam_score
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Subject name is required."
      });
    }

    const { data, error } = await supabase
      .from("subjects")
      .insert({
        code: code || null,
        name,
        class_id: class_id || null,
        max_class_score: Number(max_class_score) || 30,
        max_exam_score: Number(max_exam_score) || 70
      })
      .select()
      .single();

    if (error) throw error;

    await audit("CREATE", "subject", data.id, data);

    res.status(201).json({
      success: true,
      subject: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

app.put("/api/subjects/:id", async (req, res) => {
  try {
    const {
      code,
      name,
      class_id,
      max_class_score,
      max_exam_score,
      is_active
    } = req.body;

    const { data, error } = await supabase
      .from("subjects")
      .update({
        code: code || null,
        name,
        class_id: class_id || null,
        max_class_score: Number(max_class_score) || 30,
        max_exam_score: Number(max_exam_score) || 70,
        is_active:
          is_active === undefined ? true : Boolean(is_active)
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    await audit("UPDATE", "subject", req.params.id, data);

    res.json({
      success: true,
      subject: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

app.delete("/api/subjects/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("subjects")
      .update({
        is_active: false
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    await audit("ARCHIVE", "subject", req.params.id);

    res.json({
      success: true,
      subject: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

// ======================================================
// ACADEMIC SESSIONS
// ======================================================

app.get("/api/sessions", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("academic_sessions")
      .select(`
        id,
        name,
        status,
        start_date,
        end_date,
        semesters (
          id,
          name,
          sequence_no,
          status
        )
      `)
      .order("start_date", {
        ascending: false
      });

    if (error) throw error;

    res.json(data || []);

  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/sessions", async (req, res) => {
  try {
    const {
      name,
      start_date,
      end_date,
      status,
      first_semester
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Academic session name is required."
      });
    }

    const { data: session, error } = await supabase
      .from("academic_sessions")
      .insert({
        name,
        start_date: start_date || null,
        end_date: end_date || null,
        status: status || "planned"
      })
      .select()
      .single();

    if (error) throw error;

    // Automatically create the first semester.
    const { error: semesterError } = await supabase
      .from("semesters")
      .insert({
        academic_session_id: session.id,
        name: "First Semester",
        sequence_no: 1,
        status:
          status === "active" && first_semester !== false
            ? "active"
            : "planned",
        opened_at:
          status === "active"
            ? new Date().toISOString()
            : null
      });

    if (semesterError) throw semesterError;

    await audit(
      "CREATE",
      "academic_session",
      session.id,
      session
    );

    res.status(201).json({
      success: true,
      session
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

app.put("/api/sessions/:id", async (req, res) => {
  try {
    const {
      name,
      start_date,
      end_date,
      status
    } = req.body;

    if (status === "active") {
      await supabase
        .from("academic_sessions")
        .update({ status: "closed" })
        .neq("id", req.params.id)
        .eq("status", "active");
    }

    const { data, error } = await supabase
      .from("academic_sessions")
      .update({
        name,
        start_date: start_date || null,
        end_date: end_date || null,
        status
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    await audit(
      "UPDATE",
      "academic_session",
      req.params.id,
      data
    );

    res.json({
      success: true,
      session: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

// ======================================================
// SEMESTERS
// ======================================================

app.get("/api/semesters", async (req, res) => {
  try {
    let query = supabase
      .from("semesters")
      .select(`
        id,
        academic_session_id,
        name,
        sequence_no,
        status,
        opened_at,
        closed_at,
        academic_sessions (
          id,
          name
        )
      `)
      .order("sequence_no");

    if (req.query.session_id) {
      query = query.eq(
        "academic_session_id",
        req.query.session_id
      );
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);

  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/semesters", async (req, res) => {
  try {
    const {
      academic_session_id,
      name,
      sequence_no,
      status
    } = req.body;

    if (!academic_session_id || !name || !sequence_no) {
      return res.status(400).json({
        success: false,
        error: "Session, semester name and sequence are required."
      });
    }

    const { data, error } = await supabase
      .from("semesters")
      .insert({
        academic_session_id,
        name,
        sequence_no: Number(sequence_no),
        status: status || "planned",
        opened_at:
          status === "active"
            ? new Date().toISOString()
            : null
      })
      .select()
      .single();

    if (error) throw error;

    await audit("CREATE", "semester", data.id, data);

    res.status(201).json({
      success: true,
      semester: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

app.put("/api/semesters/:id", async (req, res) => {
  try {
    const { status } = req.body;

    const update = {
      status
    };

    if (status === "active") {
      update.opened_at = new Date().toISOString();
      update.closed_at = null;
    }

    if (status === "closed") {
      update.closed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("semesters")
      .update(update)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    await audit("UPDATE", "semester", req.params.id, data);

    res.json({
      success: true,
      semester: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

// ======================================================
// ENROLLMENTS
// ======================================================

app.get("/api/enrollments", async (req, res) => {
  try {
    let query = supabase
      .from("enrollments")
      .select(`
        id,
        student_id,
        academic_session_id,
        class_id,
        roll_number,
        enrollment_status,
        students (
          id,
          student_id,
          full_name,
          gender,
          status
        ),
        classes (
          id,
          name,
          level
        ),
        academic_sessions (
          id,
          name
        )
      `)
      .order("created_at", { ascending: false });

    if (req.query.class_id) {
      query = query.eq("class_id", req.query.class_id);
    }

    if (req.query.session_id) {
      query = query.eq(
        "academic_session_id",
        req.query.session_id
      );
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);

  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/enrollments", async (req, res) => {
  try {
    const {
      student_id,
      academic_session_id,
      class_id,
      roll_number
    } = req.body;

    if (!student_id || !academic_session_id || !class_id) {
      return res.status(400).json({
        success: false,
        error: "Student, academic session and class are required."
      });
    }

    const { data, error } = await supabase
      .from("enrollments")
      .insert({
        student_id,
        academic_session_id,
        class_id,
        roll_number: roll_number || null,
        enrollment_status: "active"
      })
      .select()
      .single();

    if (error) throw error;

    await audit("CREATE", "enrollment", data.id, data);

    res.status(201).json({
      success: true,
      enrollment: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

// ======================================================
// SCORES
// ======================================================

app.get("/api/scores", async (req, res) => {
  try {
    let query = supabase
      .from("scores")
      .select(`
        id,
        enrollment_id,
        semester_id,
        subject_id,
        class_score,
        exam_score,
        total_score,
        grade,
        remark,
        students:enrollments (
          student:students (
            id,
            student_id,
            full_name
          ),
          classes (
            id,
            name
          )
        ),
        subjects (
          id,
          code,
          name
        ),
        semesters (
          id,
          name
        )
      `)
      .order("created_at");

    if (req.query.semester_id) {
      query = query.eq(
        "semester_id",
        req.query.semester_id
      );
    }

    if (req.query.enrollment_id) {
      query = query.eq(
        "enrollment_id",
        req.query.enrollment_id
      );
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);

  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/scores", async (req, res) => {
  try {
    const {
      enrollment_id,
      semester_id,
      subject_id,
      class_score,
      exam_score
    } = req.body;

    if (
      !enrollment_id ||
      !semester_id ||
      !subject_id
    ) {
      return res.status(400).json({
        success: false,
        error: "Enrollment, semester and subject are required."
      });
    }

    const classScore = Number(class_score) || 0;
    const examScore = Number(exam_score) || 0;
    const total = classScore + examScore;

    const { grade, remark } =
      await calculateGrade(total);

    const { data, error } = await supabase
      .from("scores")
      .upsert(
        {
          enrollment_id,
          semester_id,
          subject_id,
          class_score: classScore,
          exam_score: examScore,
          grade,
          remark,
          updated_at: new Date().toISOString()
        },
        {
          onConflict:
            "enrollment_id,semester_id,subject_id"
        }
      )
      .select()
      .single();

    if (error) throw error;

    await audit("SAVE", "score", data.id, data);

    res.json({
      success: true,
      score: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

// ======================================================
// RESULTS
// ======================================================

app.get("/api/results", async (req, res) => {
  try {
    if (!req.query.semester_id) {
      return res.status(400).json({
        success: false,
        error: "semester_id is required."
      });
    }

    let query = supabase
      .from("scores")
      .select(`
        enrollment_id,
        total_score,
        class_score,
        exam_score,
        grade,
        remark,
        subjects (
          id,
          name
        ),
        enrollments (
          id,
          class_id,
          academic_session_id,
          students (
            student_id,
            full_name
          ),
          classes (
            id,
            name
          )
        )
      `)
      .eq(
        "semester_id",
        req.query.semester_id
      );

    if (req.query.class_id) {
      query = query.eq("enrollments.class_id", req.query.class_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    const grouped = {};

    for (const row of data || []) {
      const enrollment = row.enrollments;

      if (!enrollment) continue;

      const key = enrollment.id;

      if (!grouped[key]) {
        grouped[key] = {
          enrollment_id: key,
          student_id:
            enrollment.students?.student_id,
          full_name:
            enrollment.students?.full_name,
          class_name:
            enrollment.classes?.name,
          total: 0,
          subjects: 0,
          subject_results: []
        };
      }

      grouped[key].total +=
        Number(row.total_score || 0);

      grouped[key].subjects += 1;
      grouped[key].subject_results.push({
        subject_id: row.subjects?.id,
        name: row.subjects?.name || "Subject",
        class_score: Number(row.class_score || 0),
        exam_score: Number(row.exam_score || 0),
        total_score: Number(row.total_score || 0)
      });
    }

    const results = Object.values(grouped);

    results.forEach(r => {
      r.average =
        r.subjects > 0
          ? Number((r.total / r.subjects).toFixed(2))
          : 0;
    });

    const subjectGroups = {};
    for (const row of data || []) {
      const subjectId = row.subjects?.id;
      const classId = row.enrollments?.class_id;
      if (!subjectId || !classId) continue;
      const key = `${classId}:${subjectId}`;
      if (!subjectGroups[key]) subjectGroups[key] = [];
      subjectGroups[key].push(row);
    }

    for (const rows of Object.values(subjectGroups)) {
      rows.sort((a, b) => Number(b.exam_score || 0) - Number(a.exam_score || 0));
      rows.forEach((row, index) => {
        const student = grouped[row.enrollment_id];
        const subject = student?.subject_results.find(item => item.subject_id === row.subjects?.id);
        if (subject) {
          subject.position = index + 1;
          subject.subject_size = rows.length;
        }
      });
    }

    results.sort(
      (a, b) => b.average - a.average
    );

    const classGroups = {};
    results.forEach(result => {
      if (!classGroups[result.class_name]) classGroups[result.class_name] = [];
      classGroups[result.class_name].push(result);
    });
    Object.values(classGroups).forEach(classResults => {
      classResults.sort((a, b) => b.average - a.average);
      classResults.forEach((result, index) => {
        result.class_position = index + 1;
        result.class_size = classResults.length;
      });
    });
    results.forEach((result, index) => {
      result.position = req.query.class_id ? result.class_position : index + 1;
      result.school_size = results.length;
    });

    const output = req.query.enrollment_id
      ? results.filter(result => result.enrollment_id === req.query.enrollment_id)
      : results;

    res.json(output);

  } catch (error) {
    sendError(res, error);
  }
});

// ======================================================
// REPORT CARDS
// ======================================================

app.post("/api/reports/generate", async (req, res) => {
  try {
    const {
      semester_id,
      enrollment_id
    } = req.body;

    if (!semester_id) {
      return res.status(400).json({
        success: false,
        error: "Semester is required."
      });
    }

    let query = supabase
      .from("scores")
      .select(`
        enrollment_id,
        subject_id,
        total_score,
        subjects (
          id,
          name
        ),
        enrollments (
          class_id,
          students (
            student_id,
            full_name
          ),
          classes (
            id,
            name
          )
        )
      `)
      .eq("semester_id", semester_id);

    if (enrollment_id) {
      query = query.eq(
        "enrollment_id",
        enrollment_id
      );
    }

    if (req.body.class_id) {
      query = query.eq("enrollments.class_id", req.body.class_id);
    }

    const { data: scores, error } = await query;

    if (error) throw error;

    const groups = {};

    for (const score of scores || []) {
      const enrollment =
        score.enrollments;

      if (!enrollment) continue;

      const id = score.enrollment_id;

      if (!groups[id]) {
        groups[id] = {
          enrollment_id: id,
          total: 0,
          subjects: 0,
          best_subject_id: null,
          best_score: -1,
          student:
            enrollment.students,
          class:
            enrollment.classes
        };
      }

      const total =
        Number(score.total_score || 0);

      groups[id].total += total;
      groups[id].subjects += 1;

      if (total > groups[id].best_score) {
        groups[id].best_score = total;
        groups[id].best_subject_id =
          score.subject_id;
      }
    }

    const reports = Object.values(groups);

    for (const report of reports) {
      report.average =
        report.subjects > 0
          ? Number(
              (
                report.total /
                report.subjects
              ).toFixed(2)
            )
          : 0;
    }

    const classGroups = {};

    for (const report of reports) {
      const classId =
        report.class?.id || "unknown";

      if (!classGroups[classId]) {
        classGroups[classId] = [];
      }

      classGroups[classId].push(report);
    }

    for (const classId of Object.keys(classGroups)) {
      classGroups[classId].sort(
        (a, b) => b.average - a.average
      );

      classGroups[classId].forEach(
        (report, index) => {
          report.position = index + 1;
          report.class_size =
            classGroups[classId].length;
        }
      );
    }

    for (const report of reports) {
      const { data, error } = await supabase
        .from("report_cards")
        .upsert(
          {
            enrollment_id:
              report.enrollment_id,
            semester_id,
            total_score:
              report.total,
            average_score:
              report.average,
            position:
              report.position,
            class_size:
              report.class_size,
            best_subject_id:
              report.best_subject_id,
            overall_remark:
              report.average >= 50
                ? "Pass"
                : "Fail",
            generated_at:
              new Date().toISOString()
          },
          {
            onConflict:
              "enrollment_id,semester_id"
          }
        )
        .select()
        .single();

      if (error) throw error;

      report.report_card = data;
    }

    await audit(
      "GENERATE",
      "report_cards",
      null,
      {
        semester_id,
        count: reports.length
      }
    );

    res.json({
      success: true,
      count: reports.length,
      reports
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

// ======================================================
// SETTINGS
// ======================================================

app.get("/api/reports/student", async (req, res) => {
  try {
    const { semester_id, student_name } = req.query;
    if (!semester_id || !student_name?.trim()) {
      return res.status(400).json({ success: false, error: "Semester and student name are required." });
    }

    const { data, error } = await supabase
      .from("scores")
      .select(`
        enrollment_id,
        class_score,
        exam_score,
        total_score,
        subjects (id, name),
        enrollments (
          class_id,
          students (id, student_id, full_name),
          classes (id, name)
        )
      `)
      .eq("semester_id", semester_id);

    if (error) throw error;

    const groups = {};
    for (const row of data || []) {
      const enrollment = row.enrollments;
      if (!enrollment) continue;
      if (!groups[row.enrollment_id]) {
        groups[row.enrollment_id] = {
          enrollment_id: row.enrollment_id,
          student: enrollment.students,
          class: enrollment.classes,
          total: 0,
          subjects: []
        };
      }
      groups[row.enrollment_id].total += Number(row.total_score || 0);
      groups[row.enrollment_id].subjects.push({
        subject_id: row.subjects?.id,
        name: row.subjects?.name || "Subject",
        class_score: Number(row.class_score || 0),
        exam_score: Number(row.exam_score || 0),
        total_score: Number(row.total_score || 0),
        average: Number(row.total_score || 0)
      });
    }

    const allStudents = Object.values(groups);
    allStudents.forEach(student => {
      student.average = student.subjects.length ? Number((student.total / student.subjects.length).toFixed(2)) : 0;
    });

    const classGroups = {};
    allStudents.forEach(student => {
      const classId = student.class?.id || "unknown";
      if (!classGroups[classId]) classGroups[classId] = [];
      classGroups[classId].push(student);
    });
    Object.values(classGroups).forEach(classStudents => {
      classStudents.sort((a, b) => b.average - a.average);
      classStudents.forEach((student, index) => {
        student.class_position = index + 1;
        student.class_size = classStudents.length;
      });
      const subjectGroups = {};
      classStudents.forEach(student => student.subjects.forEach(subject => {
        if (!subjectGroups[subject.subject_id]) subjectGroups[subject.subject_id] = [];
        subjectGroups[subject.subject_id].push({student, subject});
      }));
      Object.values(subjectGroups).forEach(rows => {
        rows.sort((a, b) => b.subject.exam_score - a.subject.exam_score);
        rows.forEach((row, index) => {
          row.subject.position = index + 1;
          row.subject.subject_size = rows.length;
        });
      });
    });

    const search = student_name.trim().toLowerCase();
    const matches = allStudents.filter(student => student.student?.full_name?.toLowerCase().includes(search));
    if (!matches.length) return res.status(404).json({ success: false, error: "Student not found for this semester." });
    if (matches.length > 1) return res.status(409).json({ success: false, error: "More than one student matched. Enter the full student name." });

    const report = matches[0];
    res.json({
      student: report.student,
      class: report.class,
      class_position: report.class_position,
      class_size: report.class_size,
      subjects: report.subjects
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/settings", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("school_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    res.json(data || null);

  } catch (error) {
    sendError(res, error);
  }
});

app.put("/api/settings", async (req, res) => {
  try {
    const {
      school_name,
      address,
      phone,
      email,
      motto,
      grading_config
    } = req.body;

    const payload = {
      school_name:
        school_name || "My School",
      address: address || null,
      phone: phone || null,
      email: email || null,
      motto: motto || null,
      updated_at:
        new Date().toISOString()
    };

    if (grading_config !== undefined) {
      payload.grading_config =
        grading_config;
    }

    const { data: existing } =
      await supabase
        .from("school_settings")
        .select("id")
        .limit(1)
        .maybeSingle();

    let data;
    let error;

    if (existing?.id) {
      const result = await supabase
        .from("school_settings")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();

      data = result.data;
      error = result.error;

    } else {
      const result = await supabase
        .from("school_settings")
        .insert(payload)
        .select()
        .single();

      data = result.data;
      error = result.error;
    }

    if (error) throw error;

    await audit(
      "UPDATE",
      "school_settings",
      data.id,
      data
    );

    res.json({
      success: true,
      settings: data
    });

  } catch (error) {
    sendError(res, error, 400);
  }
});

// ======================================================
// STAFF / ADMINS
// ======================================================

app.get("/api/staff", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("app_users")
      .select(`
        id,
        full_name,
        role,
        is_active,
        created_at
      `)
      .order("created_at", {
        ascending: false
      });

    if (error) throw error;

    res.json(data || []);

  } catch (error) {
    sendError(res, error);
  }
});

// ======================================================
// FRONTEND FALLBACK
// ======================================================

app.get("/api/fees", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("fee_records")
      .select(`
        id,
        student_id,
        description,
        amount,
        due_date,
        status,
        students (full_name, student_id)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/fees", async (req, res) => {
  try {
    const { student_id, description, amount, due_date, status } = req.body;
    if (!student_id || !description || !Number.isFinite(Number(amount))) {
      return res.status(400).json({ success: false, error: "Student, description and amount are required." });
    }

    const { data, error } = await supabase
      .from("fee_records")
      .insert({
        student_id,
        description,
        amount: Number(amount),
        due_date: due_date || null,
        status: status || "unpaid"
      })
      .select()
      .single();

    if (error) throw error;
    await audit("CREATE", "fee_record", data.id, data);
    res.status(201).json({ success: true, fee: data });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get("/{*splat}", (_req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

// ======================================================
// START
// ======================================================

app.listen(PORT, () => {
  console.log(
    `✅ School Management System running on port ${PORT}`
  );
});
