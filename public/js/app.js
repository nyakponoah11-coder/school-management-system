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
  if(name === "subjects") loadSubjects();
  if(name === "sessions") loadSessions();
}

document.addEventListener("click", event => {
  const target = event.target.closest("button");
  if(!target) return;
  if(target.dataset.page){ showPage(target.dataset.page); return; }
  handleAction(target.dataset.action, target.dataset.studentId);
});
document.getElementById("mobileMenu")?.addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));

async function handleAction(action, studentId){
  if(!action) return;
  if(action === "search"){ showPage("students"); document.querySelector(".search")?.focus(); return; }
  if(action === "sign-out"){ alert("You have been signed out."); return; }
  if(action === "notifications"){ alert("No new notifications."); return; }
  if(action === "add-student"){ await addStudent(); return; }
  if(action === "add-class"){ await addClass(); return; }
  if(action === "add-subject"){ await addSubject(); return; }
  if(action === "assign-class"){ await assignClass(studentId); return; }
}

async function addStudent(){
  const fullName = prompt("Student full name:");
  if(!fullName?.trim()) return;
  const studentId = prompt("Student ID:");
  if(!studentId?.trim()) return;
  try{
    const classes = await api("/api/classes");
    const className = prompt(`Class name (optional):\n${classes.map(item => item.name).join(", ")}`);
    const selectedClass = classes.find(item => item.name.toLowerCase() === className?.trim().toLowerCase());
    const dashboard = await api("/api/dashboard");
    const res = await fetch("/api/students", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({full_name:fullName.trim(), student_id:studentId.trim(), class_id:selectedClass?.id || null, academic_session_id:dashboard.session?.id || null})});
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || "Unable to add student");
    alert("Student added successfully.");
    await loadStudents();
    await loadDashboard();
  }catch(error){ alert(error.message); }
}

async function addSubject(){
  const name = prompt("Subject name:");
  if(!name?.trim()) return;
  const code = prompt("Subject code (optional):");
  try{
    const res = await fetch("/api/subjects", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:name.trim(), code:code?.trim() || null})});
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || "Unable to add subject");
    alert("Subject added successfully.");
    await loadSubjects();
    await loadDashboard();
  }catch(error){ alert(error.message); }
}

async function assignClass(studentId){
  const classes = await api("/api/classes");
  const className = prompt(`Class name:\n${classes.map(item => item.name).join(", ")}`);
  const selectedClass = classes.find(item => item.name.toLowerCase() === className?.trim().toLowerCase());
  if(!selectedClass) return;
  const dashboard = await api("/api/dashboard");
  try{
    const res = await fetch("/api/enrollments", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({student_id:studentId, class_id:selectedClass.id, academic_session_id:dashboard.session?.id})});
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || "Unable to assign class");
    alert("Class assigned successfully.");
    await loadStudents();
  }catch(error){ alert(error.message); }
}
async function addClass(){
  const name = prompt("Class name:");
  if(!name?.trim()) return;
  const level = prompt("Level (for example, Primary):");
  if(!level?.trim()) return;
  try{
    const res = await fetch("/api/classes", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:name.trim(), level:level.trim()})});
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || "Unable to add class");
    alert("Class added successfully.");
    await loadClasses();
    await loadDashboard();
  }catch(error){ alert(error.message); }
}

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
  body.innerHTML = `<tr><td colspan="6" class="empty">Loading...</td></tr>`;
  try{
    const students = await api("/api/students?limit=100");
    body.innerHTML = students.length ? students.map(s => `<tr>
      <td><strong>${escapeHtml(s.full_name)}</strong></td>
      <td>${escapeHtml(s.student_id)}</td>
      <td>${escapeHtml(s.enrollments?.[0]?.classes?.name || "Not enrolled")}</td>
      <td>${escapeHtml(s.gender || "—")}</td>
      <td><span class="status active">${escapeHtml((s.status||"active").toUpperCase())}</span></td>
      <td>${s.enrollments?.[0]?.classes?.name ? "—" : `<button class="outline table-action" data-action="assign-class" data-student-id="${escapeHtml(s.id)}">Assign class</button>`}</td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty">No students found.</td></tr>`;
  }catch(e){ body.innerHTML = `<tr><td colspan="6" class="empty">Unable to load students.</td></tr>`; }
}

async function loadSubjects(){
  const body = document.getElementById("subjectsTable");
  body.innerHTML = `<tr><td colspan="5" class="empty">Loading...</td></tr>`;
  try{
    const subjects = await api("/api/subjects");
    body.innerHTML = subjects.length ? subjects.map(subject => `<tr><td><strong>${escapeHtml(subject.name)}</strong></td><td>${escapeHtml(subject.code || "—")}</td><td>${escapeHtml(subject.classes?.name || "All classes")}</td><td>${escapeHtml(subject.max_class_score)}</td><td>${escapeHtml(subject.max_exam_score)}</td></tr>`).join("") : `<tr><td colspan="5" class="empty">No subjects configured.</td></tr>`;
  }catch(error){ body.innerHTML = `<tr><td colspan="5" class="empty">Unable to load subjects.</td></tr>`; }
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