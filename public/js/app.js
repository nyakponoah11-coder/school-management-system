const navItems = document.querySelectorAll("[data-page]");
const pages = document.querySelectorAll(".page");
const title = document.getElementById("pageTitle");

const titles = {
  dashboard:"Dashboard", students:"Students", classes:"Classes", subjects:"Subjects",
  scores:"Enter Scores", results:"Results & Ranking", reports:"Semester Reports",
  sessions:"Academic Sessions", staff:"Staff & Admins", settings:"Settings"
};

function showPage(name){
  pages.forEach(p => p.classList.toggle("active", p.id === `page-${name}`));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.page === name));
  title.textContent = titles[name] || "Dashboard";
  window.scrollTo({top:0, behavior:"smooth"});
  document.querySelector(".sidebar")?.classList.remove("open");
  if(name === "students") loadStudents();
  if(name === "classes") loadClasses();
  if(name === "sessions") loadSessions();
}

navItems.forEach(el => el.addEventListener("click", () => showPage(el.dataset.page)));
document.getElementById("mobileMenu")?.addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));

async function api(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadDashboard(){
  try{
    const d = await api("/api/dashboard");
    document.getElementById("studentsCount").textContent = d.counts.students ?? 0;
    document.getElementById("classesCount").textContent = d.counts.classes ?? 0;
    document.getElementById("subjectsCount").textContent = d.counts.subjects ?? 0;
    document.getElementById("enrollmentsCount").textContent = d.counts.enrollments ?? 0;

    const session = d.session?.name || "No active session";
    const semester = d.semester?.name || "No active semester";
    document.getElementById("sideSession").textContent = session;
    document.getElementById("sideSemester").textContent = semester;
    document.getElementById("sessionCard").textContent = session;
    document.getElementById("semesterCard").textContent = semester;
    document.getElementById("periodText").textContent = `${session} · ${semester}`;
    document.getElementById("reportSession").textContent = session;
    document.getElementById("reportSemester").textContent = semester;

    const students = await api("/api/students?limit=6");
    document.getElementById("recentStudents").innerHTML = students.length
      ? students.map(s => `<tr><td><strong>${escapeHtml(s.full_name)}</strong></td><td>${escapeHtml(s.student_id)}</td><td>${escapeHtml(s.enrollments?.[0]?.classes?.name || "Not enrolled")}</td><td><span class="status active">${escapeHtml((s.status||"active").toUpperCase())}</span></td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">No students yet. Add your first student.</td></tr>`;
  }catch(err){
    console.warn("Dashboard:", err.message);
    document.getElementById("recentStudents").innerHTML = `<tr><td colspan="4" class="empty">Connect Supabase and run sql/schema.sql to load live data.</td></tr>`;
  }
}

async function loadStudents(){
  const body = document.getElementById("studentsTable");
  body.innerHTML = `<tr><td colspan="5" class="empty">Loading...</td></tr>`;
  try{
    const students = await api("/api/students?limit=100");
    body.innerHTML = students.length ? students.map(s => `<tr>
      <td><strong>${escapeHtml(s.full_name)}</strong></td>
      <td>${escapeHtml(s.student_id)}</td>
      <td>${escapeHtml(s.enrollments?.[0]?.classes?.name || "Not enrolled")}</td>
      <td>${escapeHtml(s.gender || "—")}</td>
      <td><span class="status active">${escapeHtml((s.status||"active").toUpperCase())}</span></td>
    </tr>`).join("") : `<tr><td colspan="5" class="empty">No students found.</td></tr>`;
  }catch(e){ body.innerHTML = `<tr><td colspan="5" class="empty">Unable to load students.</td></tr>`; }
}

async function loadClasses(){
  const box = document.getElementById("classesList");
  try{
    const classes = await api("/api/classes");
    box.innerHTML = classes.map(c => `<div class="class-card"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.level)} · ${c.section ? escapeHtml(c.section) : "General class"}</small></div>`).join("");
  }catch(e){ box.innerHTML = `<div class="panel">Unable to load classes.</div>`; }
}

async function loadSessions(){
  const box = document.getElementById("sessionsList");
  try{
    const sessions = await api("/api/sessions");
    box.innerHTML = sessions.map(s => `<div class="period-card" style="margin-bottom:10px"><div><span>Academic Session</span><strong>${escapeHtml(s.name)}</strong></div><div><span>Status</span><strong>${escapeHtml(s.status.toUpperCase())}</strong></div><div><span>Dates</span><strong>${s.start_date || "—"} → ${s.end_date || "—"}</strong></div></div>`).join("");
  }catch(e){ box.innerHTML = `<div class="empty">Unable to load sessions.</div>`; }
}

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

loadDashboard();