const navItems = document.querySelectorAll("[data-page]");
const pages = document.querySelectorAll(".page");
const title = document.getElementById("pageTitle");
const loginPage = document.getElementById("loginPage");
const loginForm = document.getElementById("loginForm");
const appChrome = [document.querySelector(".sidebar"), document.querySelector(".main")];

const titles = {
  dashboard:"Dashboard", students:"Students", classes:"Classes", "class-workspace":"Class Workspace", subjects:"Subjects", fees:"School Fees",
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
  if(name === "fees") loadFees();
  if(name === "sessions") loadSessions();
  if(name === "results") loadResultsFilters();
  if(name === "reports") loadReportFilters();
}

document.addEventListener("click", event => {
  const target = event.target.closest("button");
  if(!target) return;
  if(target.dataset.page){ showPage(target.dataset.page); return; }
  handleAction(target.dataset.action, target.dataset.studentId, target.dataset.classId, target);
});
document.getElementById("mobileMenu")?.addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));

loginForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const message = document.getElementById("loginMessage");
  const button = loginForm.querySelector("button[type=submit]");
  button.disabled = true;
  message.textContent = "Signing in...";
  try{
    const res = await fetch("/api/auth/login", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email:document.getElementById("loginEmail").value.trim(), password:document.getElementById("loginPassword").value})});
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || "Unable to sign in");
    localStorage.setItem("school_access_token", result.session.access_token);
    showApp();
    loadDashboard();
  }catch(error){ message.textContent = error.message; }
  finally{ button.disabled = false; }
});

function showApp(){
  loginPage?.classList.add("app-hidden");
  appChrome.forEach(element => element?.classList.remove("app-hidden"));
}

function showLogin(){
  loginPage?.classList.remove("app-hidden");
  appChrome.forEach(element => element?.classList.add("app-hidden"));
}

async function handleAction(action, studentId, classId, target){
  if(!action) return;
  if(action === "search"){ showPage("students"); document.querySelector(".search")?.focus(); return; }
  if(action === "sign-out"){
    localStorage.removeItem("school_access_token");
    showLogin();
    return;
  }
  if(action === "notifications"){ alert("No new notifications."); return; }
  if(action === "add-student"){ await addStudent(); return; }
  if(action === "add-class"){ await addClass(); return; }
  if(action === "add-subject"){ await addSubject(); return; }
  if(action === "assign-class"){ await assignClass(studentId); return; }
  if(action === "class-open"){ await openClass(classId); return; }
  if(action === "workspace-add-student"){ await addStudent(currentClassId); return; }
  if(action === "workspace-add-subject"){ await addSubject(currentClassId); return; }
  if(action === "add-fee"){ await addFee(); return; }
  if(action === "save-score"){ try { await saveScore(target); } catch(error) { alert(error.message); } return; }
  if(action === "view-result"){ await viewResult(target); return; }
  if(action === "generate-report"){ await generateStudentReport(); return; }
  if(action === "print-report"){ window.print(); return; }
  if(action === "save-session"){ await saveSession(target); return; }
  if(action === "new-session"){ await addSession(); return; }
}

let currentClassId = null;

async function addStudent(classId = null){
  const fullName = prompt("Student full name:");
  if(!fullName?.trim()) return;
  const studentId = prompt("Student ID (optional):");
  const gender = prompt("Gender (Male, Female or Other):");
  const admissionDate = prompt("Enrollment date (YYYY-MM-DD, optional):") || null;
  try{
    const classes = await api("/api/classes");
    const className = classId ? null : prompt(`Class name (optional):\n${classes.map(item => item.name).join(", ")}`);
    const selectedClass = classId ? classes.find(item => item.id === classId) : classes.find(item => item.name.toLowerCase() === className?.trim().toLowerCase());
    const dashboard = await api("/api/dashboard");
    const res = await fetch("/api/students", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({full_name:fullName.trim(), student_id:studentId?.trim() || null, gender:gender?.trim() || null, admission_date:admissionDate, class_id:selectedClass?.id || null, academic_session_id:dashboard.session?.id || null})});
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || "Unable to add student");
    alert("Student added successfully.");
    await loadStudents();
    await loadDashboard();
    if(classId) await loadClassWorkspace(classId);
  }catch(error){ alert(error.message); }
}

async function addSubject(classId = null){
  const name = prompt("Subject name:");
  if(!name?.trim()) return;
  const code = prompt("Subject code (optional):");
  try{
    const res = await fetch("/api/subjects", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:name.trim(), code:code?.trim() || null, class_id:classId || null})});
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || "Unable to add subject");
    alert("Subject added successfully.");
    await loadSubjects();
    await loadDashboard();
    if(classId) await loadClassWorkspace(classId);
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
    const reportSession = document.getElementById("reportSession");
    const reportSemester = document.getElementById("reportSemester");
    if(reportSession) reportSession.textContent = session;
    if(reportSemester) reportSemester.textContent = semester;

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
      <td>${escapeHtml(s.admission_date || s.created_at?.slice(0, 10) || "—")}</td>
      <td>${escapeHtml(s.gender || "Not specified")}</td>
      <td><span class="status active">${escapeHtml((s.status||"active").toUpperCase())}</span></td>
    </tr>`).join("") : `<tr><td colspan="5" class="empty">No students found.</td></tr>`;
  }catch(e){ body.innerHTML = `<tr><td colspan="5" class="empty">Unable to load students.</td></tr>`; }
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
    box.innerHTML = classes.map((c, index) => `<button class="class-card class-color-${index % 6}" data-action="class-open" data-class-id="${escapeHtml(c.id)}"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.level)} · ${c.section ? escapeHtml(c.section) : "General class"}</small><span>Open class →</span></button>`).join("");
  }catch(e){ box.innerHTML = `<div class="panel">Unable to load classes.</div>`; }
}

async function openClass(classId){
  currentClassId = classId;
  showPage("class-workspace");
  await loadClassWorkspace(classId);
}

async function loadClassWorkspace(classId){
  currentClassId = classId;
  const classes = await api("/api/classes");
  const currentClass = classes.find(item => item.id === classId);
  document.getElementById("workspaceTitle").textContent = currentClass?.name || "Class";
  const dashboard = await api("/api/dashboard");
  const enrollments = await api(`/api/enrollments?class_id=${encodeURIComponent(classId)}&session_id=${encodeURIComponent(dashboard.session?.id || "")}`);
  const subjects = (await api("/api/subjects")).filter(subject => !subject.class_id || subject.class_id === classId);
  const semesters = await api(`/api/semesters?session_id=${encodeURIComponent(dashboard.session?.id || "")}`);
  const semester = semesters.find(item => item.status === "active") || semesters[0];
  document.getElementById("workspaceSummary").textContent = `${enrollments.length} students · ${subjects.length} subjects · ${semester?.name || "No active semester"}`;
  document.getElementById("workspaceStudentCount").textContent = `${enrollments.length} student${enrollments.length === 1 ? "" : "s"} enrolled in this class`;
  document.getElementById("classStudentsTable").innerHTML = enrollments.length ? enrollments.map(enrollment => `<tr><td><strong>${escapeHtml(enrollment.students?.full_name)}</strong></td><td>${escapeHtml(enrollment.students?.student_id)}</td><td>${escapeHtml(enrollment.students?.gender || "Not specified")}</td><td>${escapeHtml(enrollment.created_at?.slice(0, 10) || "—")}</td><td><span class="status active">${escapeHtml((enrollment.enrollment_status || "active").toUpperCase())}</span></td></tr>`).join("") : `<tr><td colspan="5" class="empty">No students in this class yet.</td></tr>`;
  if(!enrollments.length || !subjects.length || !semester){
    document.getElementById("scoreHead").innerHTML = "";
    document.getElementById("scoreBody").innerHTML = `<tr><td class="empty">Add students, subjects and an active semester to enter scores.</td></tr>`;
    return;
  }
  const scores = await api(`/api/scores?semester_id=${encodeURIComponent(semester.id)}`);
  const scoreMap = new Map(scores.map(score => [`${score.enrollment_id}:${score.subject_id}`, score]));
  document.getElementById("scoreHead").innerHTML = `<tr><th>Student</th>${subjects.map(subject => `<th>${escapeHtml(subject.name)}<small class="score-subhead">Class / Exam</small></th>`).join("")}</tr>`;
  document.getElementById("scoreBody").innerHTML = enrollments.map(enrollment => `<tr><td><strong>${escapeHtml(enrollment.students?.full_name)}</strong></td>${subjects.map(subject => { const score = scoreMap.get(`${enrollment.id}:${subject.id}`) || {}; return `<td class="score-cell"><input type="number" min="0" step="0.01" placeholder="Class" value="${escapeHtml(score.class_score ?? "")}" data-score-field="class_score" data-enrollment-id="${enrollment.id}" data-subject-id="${subject.id}" data-semester-id="${semester.id}"><input type="number" min="0" step="0.01" placeholder="Exam" value="${escapeHtml(score.exam_score ?? "")}" data-score-field="exam_score" data-enrollment-id="${enrollment.id}" data-subject-id="${subject.id}" data-semester-id="${semester.id}"><button class="outline save-score" data-action="save-score" data-enrollment-id="${enrollment.id}" data-subject-id="${subject.id}" data-semester-id="${semester.id}">Save</button></td>`; }).join("")}</tr>`).join("");
}

async function saveScore(button){
  const cell = button.closest(".score-cell");
  const classScore = cell.querySelector('[data-score-field="class_score"]').value;
  const examScore = cell.querySelector('[data-score-field="exam_score"]').value;
  const payload = {enrollment_id:button.dataset.enrollmentId, subject_id:button.dataset.subjectId, semester_id:button.dataset.semesterId, class_score:classScore, exam_score:examScore};
  const res = await fetch("/api/scores", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)});
  const result = await res.json();
  if(!res.ok) throw new Error(result.error || "Unable to save score");
  button.textContent = "Saved";
  setTimeout(() => { button.textContent = "Save"; }, 1200);
}

async function loadFees(){
  const body = document.getElementById("feesTable");
  body.innerHTML = `<tr><td colspan="5" class="empty">Loading...</td></tr>`;
  try{
    const fees = await api("/api/fees");
    body.innerHTML = fees.length ? fees.map(fee => `<tr><td>${escapeHtml(fee.students?.full_name || "Unknown")}</td><td>${escapeHtml(fee.description)}</td><td>${escapeHtml(fee.amount)}</td><td>${escapeHtml(fee.due_date || "—")}</td><td><span class="status active">${escapeHtml(fee.status.toUpperCase())}</span></td></tr>`).join("") : `<tr><td colspan="5" class="empty">No fee records yet.</td></tr>`;
  }catch(error){ body.innerHTML = `<tr><td colspan="5" class="empty">Unable to load fee records.</td></tr>`; }
}

async function loadAcademicFilters(sessionSelectId, semesterSelectId, classSelectId){
  const [sessions, classes] = await Promise.all([api("/api/sessions"), api("/api/classes")]);
  const sessionSelect = document.getElementById(sessionSelectId);
  const semesterSelect = document.getElementById(semesterSelectId);
  const classSelect = classSelectId ? document.getElementById(classSelectId) : null;
  sessionSelect.innerHTML = sessions.map(session => `<option value="${escapeHtml(session.id)}">${escapeHtml(session.name)}</option>`).join("");
  if(classSelect) classSelect.innerHTML = classes.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  async function updateSemesters(){
    const current = sessions.find(session => session.id === sessionSelect.value);
    const semesters = current?.semesters || [];
    semesterSelect.innerHTML = semesters.map(semester => `<option value="${escapeHtml(semester.id)}">${escapeHtml(semester.name)}</option>`).join("");
  }
  sessionSelect.addEventListener("change", updateSemesters);
  await updateSemesters();
  return {sessions, classes};
}

async function loadResultsFilters(){
  const {classes} = await loadAcademicFilters("resultsSession", "resultsSemester", "resultsClass");
  const scope = document.getElementById("resultsScope");
  const classLabel = document.getElementById("resultsClassLabel");
  const refresh = () => { classLabel.hidden = scope.value !== "class"; loadResults(); };
  scope.onchange = refresh;
  document.getElementById("resultsSession").onchange = refresh;
  document.getElementById("resultsSemester").onchange = refresh;
  document.getElementById("resultsClass").onchange = refresh;
  classLabel.hidden = scope.value !== "class";
  if(classes.length) await loadResults();
}

async function loadResults(){
  const semesterId = document.getElementById("resultsSemester")?.value;
  if(!semesterId) return;
  const classId = document.getElementById("resultsScope")?.value === "class" ? document.getElementById("resultsClass")?.value : "";
  const query = new URLSearchParams({semester_id:semesterId});
  if(classId) query.set("class_id", classId);
  const body = document.getElementById("resultsTable");
  body.innerHTML = `<tr><td colspan="6" class="empty">Loading rankings...</td></tr>`;
  try{
    const results = await api(`/api/results?${query}`);
    body.innerHTML = results.length ? results.map(result => `<tr><td><strong>#${escapeHtml(result.position)}</strong></td><td>${escapeHtml(result.full_name)}</td><td>${escapeHtml(result.student_id)}</td><td>${escapeHtml(result.class_name)}</td><td>${escapeHtml(result.average)}</td><td>${escapeHtml(result.subjects)}</td><td><button class="outline" data-action="view-result" data-enrollment-id="${escapeHtml(result.enrollment_id)}" data-semester-id="${escapeHtml(semesterId)}">View</button></td></tr>`).join("") : `<tr><td colspan="7" class="empty">No scores have been entered for this selection.</td></tr>`;
  }catch(error){ body.innerHTML = `<tr><td colspan="7" class="empty">Unable to load rankings.</td></tr>`; }
}

async function loadReportFilters(){
  await loadAcademicFilters("reportSessionSelect", "reportSemesterSelect");
  document.getElementById("reportSessionSelect").onchange = () => loadReportFilters();
  document.getElementById("reportSemesterSelect").onchange = () => clearReport();
  clearReport();
}

function clearReport(){
  const body = document.getElementById("reportsTable");
  body.innerHTML = `<tr><td colspan="6" class="empty">Enter a student name and generate the report.</td></tr>`;
  document.getElementById("reportStudentHeading").textContent = "Student Report";
  document.getElementById("reportClassPosition").textContent = "";
  document.getElementById("reportSummary").hidden = true;
  updateReportHeading();
}

function updateReportHeading(){
  const session = document.getElementById("reportSessionSelect")?.selectedOptions[0]?.textContent || "Academic Year";
  const semester = document.getElementById("reportSemesterSelect")?.selectedOptions[0]?.textContent || "Semester";
  const heading = document.getElementById("reportExamTitle");
  if(heading) heading.textContent = `End of ${session} ${semester} Examination Report`;
}

async function generateStudentReport(){
  const semesterId = document.getElementById("reportSemesterSelect")?.value;
  const studentName = document.getElementById("reportStudentName")?.value.trim();
  if(!semesterId || !studentName){ alert("Select an academic year, semester and enter a student name first."); return; }
  try{
    const res = await fetch(`/api/reports/student?semester_id=${encodeURIComponent(semesterId)}&student_name=${encodeURIComponent(studentName)}`);
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || "Unable to generate report");
    const body = document.getElementById("reportsTable");
    body.innerHTML = result.subjects.length ? result.subjects.map(subject => `<tr><td>${escapeHtml(subject.name)}</td><td>${escapeHtml(subject.class_score)}</td><td>${escapeHtml(subject.exam_score)}</td><td>${escapeHtml(subject.average)}</td><td>#${escapeHtml(subject.position)} / ${escapeHtml(subject.subject_size)}</td></tr>`).join("") : `<tr><td colspan="5" class="empty">No scores found for this student.</td></tr>`;
    document.getElementById("reportStudentHeading").textContent = `${result.student.full_name} · ${result.class.name}`;
    document.getElementById("reportClassPosition").textContent = `Overall class position: #${result.class_position} of ${result.class_size}`;
    document.getElementById("reportSummary").innerHTML = `<span>Academic report</span><strong>${escapeHtml(result.class.name)}</strong><span>Position</span><strong>#${escapeHtml(result.class_position)} of ${escapeHtml(result.class_size)}</strong>`;
    document.getElementById("reportSummary").hidden = false;
    document.getElementById("reportMessage").textContent = "Report generated successfully.";
  }catch(error){ alert(error.message); }
}

async function viewResult(button){
  const profile = document.getElementById("resultProfile");
  try{
    const result = await api(`/api/results?semester_id=${encodeURIComponent(button.dataset.semesterId)}&enrollment_id=${encodeURIComponent(button.dataset.enrollmentId)}`);
    const student = result[0];
    if(!student) throw new Error("No result found for this student.");
    document.getElementById("resultProfileName").textContent = `${student.full_name} · ${student.class_name}`;
    document.getElementById("resultProfileSummary").textContent = `Overall class position: #${student.position} of ${student.class_size}`;
    document.getElementById("resultProfileTable").innerHTML = student.subject_results.map(subject => `<tr><td>${escapeHtml(subject.name)}</td><td>${escapeHtml(subject.class_score)}</td><td>${escapeHtml(subject.exam_score)}</td><td>${escapeHtml(subject.total_score)}</td><td>#${escapeHtml(subject.position)} / ${escapeHtml(subject.subject_size)}</td></tr>`).join("");
    profile.hidden = false;
    profile.scrollIntoView({behavior:"smooth", block:"start"});
  }catch(error){ alert(error.message); }
}

async function saveSession(button){
  const card = button.closest(".session-editor");
  try{
    const res = await fetch(`/api/sessions/${button.dataset.sessionId}`, {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:card.querySelector("[data-field=name]").value, start_date:card.querySelector("[data-field=start_date]").value || null, end_date:card.querySelector("[data-field=end_date]").value || null, status:card.querySelector("[data-field=status]").value})});
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || "Unable to save session");
    alert("Academic session updated.");
    await loadSessions();
    await loadDashboard();
  }catch(error){ alert(error.message); }
}

async function addSession(){
  const name = prompt("Session year (for example, 2027/2028):");
  if(!name?.trim()) return;
  const semesterChoice = prompt("Semester: enter 1 for First Semester or 2 for Second Semester:", "1");
  const semester = semesterChoice === "2" ? "Second Semester" : "First Semester";
  try{
    const res = await fetch("/api/sessions", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:name.trim(), semester, status:"planned"})});
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || "Unable to create session");
    await loadSessions();
  }catch(error){ alert(error.message); }
}

async function addFee(){
  const studentId = prompt("Student ID:");
  const description = prompt("Fee description:");
  const amount = prompt("Amount:");
  if(!studentId?.trim() || !description?.trim() || !amount?.trim()) return;
  try{
    const res = await fetch("/api/fees", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({student_id:studentId.trim(), description:description.trim(), amount:Number(amount)})});
    const result = await res.json();
    if(!res.ok) throw new Error(result.error || "Unable to add fee");
    await loadFees();
    alert("Fee record added.");
  }catch(error){ alert(error.message); }
}

async function loadSessions(){
  const box = document.getElementById("sessionsList");
  try{
    const sessions = await api("/api/sessions");
    box.innerHTML = sessions.map(s => `<div class="period-card session-editor" style="margin-bottom:10px"><label>Session year<input data-field="name" value="${escapeHtml(s.name)}"></label><label>Semester<select data-field="semester_id">${(s.semesters || []).map(semester => `<option value="${escapeHtml(semester.id)}">${escapeHtml(semester.name)}</option>`).join("")}</select></label><label>Start date<input type="date" data-field="start_date" value="${escapeHtml(s.start_date || "")}"></label><label>End date<input type="date" data-field="end_date" value="${escapeHtml(s.end_date || "")}"></label><label>Status<select data-field="status"><option value="planned" ${s.status === "planned" ? "selected" : ""}>Planned</option><option value="active" ${s.status === "active" ? "selected" : ""}>Active</option><option value="closed" ${s.status === "closed" ? "selected" : ""}>Closed</option></select></label><button class="primary" data-action="save-session" data-session-id="${escapeHtml(s.id)}">Save session</button></div>`).join("");
  }catch(e){ box.innerHTML = `<div class="empty">Unable to load sessions.</div>`; }
}

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

if(localStorage.getItem("school_access_token")){
  showApp();
  loadDashboard();
}else{
  showLogin();
}