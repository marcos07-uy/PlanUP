import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Barbell,
  CalendarDots,
  CheckCircle,
  Circle,
  ClipboardText,
  Heartbeat,
  List,
  PersonSimpleRun,
  Plus,
  SignOut,
} from "@phosphor-icons/react";
import { api } from "./api";
import { SessionExecutionCard } from "./athlete/SessionExecutionCard";
import { CoachComplianceCalendar } from "./coach/CoachComplianceCalendar";
import {
  confirm,
  confirmPasswordReset,
  currentToken,
  resendConfirmation,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
} from "./auth";
import { demoAthleteProfile, demoAthletes, demoCoachInvitations, demoCoaches, demoCoachSessions, demoProfile, demoSessions } from "./demo";
import type { Athlete, Coach, CoachInvitation, CoachSession, CoachSessionSummary, ComplianceSummary, Role, SessionResult, TrainingSession, UserProfile } from "./types";

const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
const demoUserProfile = import.meta.env.VITE_DEMO_ROLE === "athlete" ? demoAthleteProfile : demoProfile;
const today = () => new Date().toISOString().slice(0, 10);
const monthRange = () => {
  const from = new Date();
  from.setDate(1);
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
  return [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)];
};
const weekRange = (offset = 0) => {
  const coachToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Montevideo" });
  const from = new Date(`${coachToday}T12:00:00Z`);
  const day = from.getUTCDay() || 7;
  from.setUTCDate(from.getUTCDate() - day + 1 + offset * 7);
  const to = new Date(from);
  to.setUTCDate(from.getUTCDate() + 6);
  return [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)] as const;
};
const emptyCompliance: ComplianceSummary = { total: 0, completed: 0, inProgress: 0, skipped: 0, pending: 0, overdue: 0 };
const summarizeCompliance = (items: TrainingSession[]) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Montevideo" });
  const summary = { ...emptyCompliance, total: items.length };
  for (const item of items) {
    if (item.status === "completed") summary.completed += 1;
    else if (item.status === "in_progress") summary.inProgress += 1;
    else if (item.status === "skipped") summary.skipped += 1;
    else if (item.date < today) summary.overdue += 1;
    else summary.pending += 1;
  }
  return summary;
};
const prettyDate = (value: string) => {
  const formatted = new Intl.DateTimeFormat("es-UY", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${value}T12:00:00`),
  );
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

function cognitoErrorCode(cause: unknown) {
  if (!cause || typeof cause !== "object") return "";
  const error = cause as { code?: unknown; name?: unknown };
  return typeof error.code === "string" ? error.code : typeof error.name === "string" ? error.name : "";
}

function errorMessage(cause: unknown) {
  if (cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string") return cause.message;
  return "No pudimos completar la operación";
}

function App() {
  const [token, setToken] = useState<string | null>(demoMode ? "demo" : null);
  const [profile, setProfile] = useState<UserProfile | null>(demoMode ? demoUserProfile : null);
  const [loading, setLoading] = useState(!demoMode);

  useEffect(() => {
    if (demoMode) return;
    currentToken().then(async (nextToken) => {
      if (nextToken) {
        setToken(nextToken);
        setProfile(await api.me(nextToken));
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="splash"><Brand /><p>Preparando tu plan…</p></div>;
  if (!token || !profile) return <Auth onAuthenticated={(nextToken, nextProfile) => { setToken(nextToken); setProfile(nextProfile); }} />;

  return (
    <Dashboard
      token={token}
      profile={profile}
      onLogout={() => { signOut(); setToken(null); setProfile(null); }}
    />
  );
}

function Brand() {
  return <div className="brand" aria-label="PlanUp"><span>Plan</span><strong>Up</strong></div>;
}

function Auth({ onAuthenticated }: { onAuthenticated(token: string, profile: UserProfile): void }) {
  const [mode, setMode] = useState<"login" | "signup" | "confirm" | "forgot" | "reset">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState<Role>("coach");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  function changeMode(nextMode: typeof mode) {
    setMode(nextMode);
    setError("");
    setNotice("");
    setCode("");
    setPassword("");
    setResendCooldown(0);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      if (mode === "signup") { await signUp(name, email, password, role); setMode("confirm"); }
      else if (mode === "confirm") { await confirm(email, code); setMode("login"); }
      else if (mode === "forgot") {
        try {
          await requestPasswordReset(email);
        } catch (cause) {
          if (!(cause instanceof Error) || cause.name !== "UserNotFoundException") throw cause;
        }
        setMode("reset");
        setNotice("Si existe una cuenta con ese email, vas a recibir un código de recuperación.");
      }
      else if (mode === "reset") {
        await confirmPasswordReset(email, code, password);
        changeMode("login");
        setNotice("Contraseña actualizada. Ya podés iniciar sesión.");
      }
      else {
        const nextToken = await signIn(email, password);
        onAuthenticated(nextToken, await api.me(nextToken));
      }
    } catch (cause) {
      const unconfirmed = cognitoErrorCode(cause) === "UserNotConfirmedException"
        || errorMessage(cause).toLowerCase().includes("not confirmed");
      if (mode === "login" && unconfirmed) {
        setMode("confirm");
        setPassword("");
        setNotice("Tu cuenta todavía no está confirmada. Podés solicitar un código nuevo.");
      } else {
        setError(errorMessage(cause));
      }
    }
    finally { setBusy(false); }
  }

  async function resendCode() {
    if (resending || resendCooldown > 0) return;
    setError(""); setNotice(""); setResending(true);
    try {
      await resendConfirmation(email);
      setNotice("Enviamos un nuevo código de verificación. Revisá también spam y promociones.");
      setResendCooldown(60);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setResending(false);
    }
  }

  const isPasswordMode = mode === "login" || mode === "signup" || mode === "reset";
  const title = mode === "login" ? "Inicia sesión"
    : mode === "signup" ? "Empezá con PlanUp"
      : mode === "confirm" ? "Revisá tu correo"
        : mode === "forgot" ? "Recuperá tu acceso"
          : "Creá una contraseña";
  const eyebrow = mode === "login" ? "Bienvenido"
    : mode === "signup" ? "Crear cuenta"
      : mode === "confirm" ? "Verificar email"
        : "Recuperar contraseña";
  const submitLabel = mode === "login" ? "Entrar"
    : mode === "signup" ? "Crear cuenta"
      : mode === "confirm" ? "Verificar"
        : mode === "forgot" ? "Enviar código"
          : "Cambiar contraseña";

  return <main className="auth-shell">
    <section className="auth-intro"><Brand /><h1>Tu entrenamiento,<br />bien organizado.</h1><p>El plan del coach, claro y disponible todos los dias.</p></section>
    <form className="auth-card" onSubmit={submit}>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {mode === "signup" && <><label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} required /></label><div className="role-picker"><button type="button" className={role === "coach" ? "active" : ""} onClick={() => setRole("coach")}>Entrenador</button><button type="button" className={role === "athlete" ? "active" : ""} onClick={() => setRole("athlete")}>Atleta</button></div></>}
      {mode !== "reset" && <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>}
      {(mode === "confirm" || mode === "reset") && <label>Código de verificación<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required /></label>}
      {isPasswordMode && <label>{mode === "reset" ? "Nueva contraseña" : "Contraseña"}<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label>}
      {(mode === "signup" || mode === "reset") && <p className="field-hint">Mínimo 8 caracteres, con mayúscula, minúscula y número.</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Procesando…" : submitLabel}</button>
      {mode === "confirm" && <button type="button" className="text-button" disabled={resending || resendCooldown > 0} onClick={resendCode}>
        {resending ? "Reenviando…" : resendCooldown > 0 ? `Reenviar código en ${resendCooldown}s` : "Reenviar código"}
      </button>}
      {mode === "login" && <button type="button" className="text-button" onClick={() => changeMode("forgot")}>Olvidé mi contraseña</button>}
      {mode === "login" && <button type="button" className="text-button" onClick={() => changeMode("confirm")}>Ya tengo un código de confirmación</button>}
      {(mode === "login" || mode === "signup") && <button type="button" className="text-button" onClick={() => changeMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "No tengo cuenta" : "Ya tengo cuenta"}</button>}
      {(mode === "confirm" || mode === "forgot" || mode === "reset") && <button type="button" className="text-button" onClick={() => changeMode("login")}>Volver al inicio de sesión</button>}
    </form>
  </main>;
}

function Dashboard({ token, profile, onLogout }: { token: string; profile: UserProfile; onLogout(): void }) {
  const [athletes, setAthletes] = useState<Athlete[]>(demoMode && profile.role === "coach" ? demoAthletes : []);
  const [selected, setSelected] = useState<Athlete | null>(profile.role === "athlete" ? { id: profile.id, name: profile.name, email: profile.email } : demoMode ? demoAthletes[0] : null);
  const [coaches, setCoaches] = useState<Coach[]>(demoMode && profile.role === "athlete" ? demoCoaches : []);
  const [coachInvitations, setCoachInvitations] = useState<CoachInvitation[]>(demoMode && profile.role === "athlete" ? demoCoachInvitations : []);
  const [selectedCoachId, setSelectedCoachId] = useState<string>(demoMode && profile.role === "athlete" ? demoCoaches[0]?.id ?? "" : "");
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [coachSessions, setCoachSessions] = useState<CoachSessionSummary[]>(demoMode && profile.role === "coach" ? demoCoachSessions : []);
  const [selectedCoachSession, setSelectedCoachSession] = useState<CoachSession | null>(demoMode && profile.role === "coach" ? demoCoachSessions[0] ?? null : null);
  const [planningCursor, setPlanningCursor] = useState<string | undefined>();
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [selectedCoachSessionId, setSelectedCoachSessionId] = useState<string | null>(demoMode && profile.role === "coach" ? demoCoachSessions[0]?.id ?? null : null);
  const [coachSessionTitle, setCoachSessionTitle] = useState("");
  const [coachSessionContent, setCoachSessionContent] = useState("");
  const [creatingCoachSession, setCreatingCoachSession] = useState(false);
  const [assignAthleteIds, setAssignAthleteIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [assignmentDate, setAssignmentDate] = useState(today());
  const [notice, setNotice] = useState("");
  const [mobileTeamOpen, setMobileTeamOpen] = useState(false);
  const [coachView, setCoachView] = useState<"week" | "plannings">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [calendarSessions, setCalendarSessions] = useState<TrainingSession[]>([]);
  const [compliance, setCompliance] = useState<ComplianceSummary>(emptyCompliance);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [planningSearch, setPlanningSearch] = useState("");
  const [appliedPlanningSearch, setAppliedPlanningSearch] = useState("");
  const [editingPlanning, setEditingPlanning] = useState(false);
  const [editPlanningTitle, setEditPlanningTitle] = useState("");
  const [editPlanningContent, setEditPlanningContent] = useState("");

  useEffect(() => {
    if (demoMode || profile.role !== "coach") return;
    api.athletes(token).then((items) => { setAthletes(items); setSelected(items[0] ?? null); });
  }, [profile.role, token]);

  useEffect(() => {
    if (demoMode || profile.role !== "coach" || coachView !== "week") return;
    const [from, to] = weekRange(weekOffset);
    setCalendarLoading(true);
    (async () => {
      const all: TrainingSession[] = [];
      let cursor: string | undefined;
      do {
        const page = await api.coachCalendar(token, from, to, cursor);
        all.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      setCalendarSessions(all.sort((a, b) => a.date.localeCompare(b.date) || a.athleteId.localeCompare(b.athleteId)));
      setCompliance(summarizeCompliance(all));
    })().catch((cause) => setNotice(errorMessage(cause))).finally(() => setCalendarLoading(false));
  }, [coachView, profile.role, token, weekOffset]);

  useEffect(() => {
    if (profile.role !== "athlete" || demoMode) return;
    Promise.all([api.coaches(token), api.coachInvitations(token)]).then(([coachItems, invitations]) => {
      setCoaches(coachItems);
      setCoachInvitations(invitations);
      setSelectedCoachId((current) => current || coachItems[0]?.id || "");
    });
  }, [profile.role, token]);

  const activeCoachId = profile.role === "coach" ? profile.id : selectedCoachId;

  useEffect(() => {
    if (profile.role !== "athlete" || !selected || !activeCoachId) { setSessions([]); return; }
    const [from, to] = monthRange();
    if (demoMode) {
      setSessions(demoSessions.filter((item) => item.athleteId === selected.id && item.coachId === activeCoachId));
      return;
    }
    api.sessions(token, selected.id, activeCoachId, from, to).then(setSessions);
  }, [activeCoachId, profile.role, selected, token]);

  useEffect(() => {
    if (demoMode || profile.role !== "coach") return;
    api.coachSessions(token).then((page) => { setCoachSessions(page.items); setPlanningCursor(page.nextCursor); });
  }, [profile.role, token]);

  const session = useMemo(() => sessions.find((item) => item.athleteId === selected?.id && item.date === selectedDate), [sessions, selected, selectedDate]);
  const planningLibrary = useMemo(() => [...coachSessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [coachSessions]);
  const selectedCoachSummary = useMemo(() => coachSessions.find((item) => item.id === selectedCoachSessionId) ?? planningLibrary[0] ?? null, [coachSessions, planningLibrary, selectedCoachSessionId]);
  useEffect(() => {
    if (!selectedCoachSessionId && planningLibrary[0]) setSelectedCoachSessionId(planningLibrary[0].id);
  }, [planningLibrary, selectedCoachSessionId]);
  useEffect(() => {
    if (!selectedCoachSummary) { setSelectedCoachSession(null); return; }
    if (demoMode) {
      setSelectedCoachSession((current) => current?.id === selectedCoachSummary.id
        ? current
        : demoCoachSessions.find((item) => item.id === selectedCoachSummary.id) ?? null);
      return;
    }
    setSelectedCoachSession(null);
    api.coachSession(token, selectedCoachSummary).then(setSelectedCoachSession);
  }, [selectedCoachSummary, token]);

  async function addAthlete() {
    const email = window.prompt("Email del atleta registrado");
    if (!email) return;
    if (!demoMode) await api.inviteAthlete(token, email);
    setNotice("Invitación enviada al atleta"); setTimeout(() => setNotice(""), 2200);
  }

  async function answerInvitation(invitation: CoachInvitation, action: "accept" | "reject") {
    const accepted = demoMode
      ? invitation.coach
      : await api.answerCoachInvitation(token, invitation.coach.id, action);
    setCoachInvitations((items) => items.filter((item) => item.coach.id !== invitation.coach.id));
    if (action === "accept" && accepted) {
      setCoaches((items) => [...items.filter((item) => item.id !== accepted.id), accepted]);
      setSelectedCoachId(accepted.id);
      setNotice(`${accepted.name} ahora es tu coach`);
    } else setNotice("Invitación rechazada");
    setTimeout(() => setNotice(""), 2200);
  }

  async function createCoachSession() {
    if (!coachSessionTitle.trim() || !coachSessionContent.trim()) return;
    const created = demoMode
      ? { id: `coach-session-${Date.now()}`, title: coachSessionTitle.trim(), date: today(), content: coachSessionContent, summary: planningSummary(coachSessionContent), version: 1, updatedAt: new Date().toISOString() }
      : await api.createCoachSession(token, today(), coachSessionTitle, coachSessionContent);
    const { content: _content, ...summary } = created;
    setCoachSessions((items) => [summary, ...items]);
    setSelectedCoachSession(created);
    setSelectedCoachSessionId(created.id);
    setCoachSessionTitle("");
    setCoachSessionContent("");
    setCreatingCoachSession(false);
    setNotice("Sesión base creada"); setTimeout(() => setNotice(""), 2200);
  }

  async function loadMorePlans() {
    if (!planningCursor || loadingPlans) return;
    setLoadingPlans(true);
    try {
      const page = await api.coachSessions(token, planningCursor, appliedPlanningSearch);
      setCoachSessions((items) => [...items, ...page.items.filter((next) => !items.some((item) => item.id === next.id))]);
      setPlanningCursor(page.nextCursor);
    } finally { setLoadingPlans(false); }
  }

  async function searchPlannings() {
    const query = planningSearch.trim();
    setLoadingPlans(true);
    try {
      const page = demoMode
        ? { items: coachSessions.filter((item) => item.title?.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))), nextCursor: undefined }
        : await api.coachSessions(token, undefined, query);
      setCoachSessions(page.items);
      setPlanningCursor(page.nextCursor);
      setAppliedPlanningSearch(query);
      const keepDemoSelection = demoMode && selectedCoachSession && page.items.some((item) => item.id === selectedCoachSession.id);
      if (!keepDemoSelection) setSelectedCoachSession(null);
      setSelectedCoachSessionId(keepDemoSelection ? selectedCoachSession.id : page.items[0]?.id ?? null);
    } finally { setLoadingPlans(false); }
  }

  async function clearPlanningSearch() {
    setPlanningSearch("");
    setAppliedPlanningSearch("");
    const page = demoMode ? { items: demoCoachSessions, nextCursor: undefined } : await api.coachSessions(token);
    setCoachSessions(page.items);
    setPlanningCursor(page.nextCursor);
    setSelectedCoachSessionId(page.items[0]?.id ?? null);
  }

  function beginPlanningEdit() {
    if (!selectedCoachSession) return;
    setEditPlanningTitle(selectedCoachSession.title ?? "");
    setEditPlanningContent(selectedCoachSession.content);
    setEditingPlanning(true);
  }

  async function savePlanningEdit() {
    if (!selectedCoachSession || !editPlanningTitle.trim() || !editPlanningContent.trim()) return;
    const updated = demoMode
      ? { ...selectedCoachSession, title: editPlanningTitle.trim(), content: editPlanningContent.trim(), summary: planningSummary(editPlanningContent), version: selectedCoachSession.version + 1, updatedAt: new Date().toISOString() }
      : await api.updateCoachSession(token, selectedCoachSession, editPlanningTitle, editPlanningContent);
    const { content: _content, ...summary } = updated;
    setCoachSessions((items) => items.map((item) => item.id === updated.id ? summary : item));
    setSelectedCoachSession(updated);
    setEditingPlanning(false);
    setNotice("Planificación actualizada; las sesiones ya asignadas no cambiaron"); setTimeout(() => setNotice(""), 2800);
  }

  async function duplicatePlanning() {
    if (!selectedCoachSession) return;
    const duplicate = demoMode
      ? { ...selectedCoachSession, id: crypto.randomUUID(), title: `${selectedCoachSession.title ?? "Planificación"} (copia)`, date: today(), version: 1, updatedAt: new Date().toISOString() }
      : await api.duplicateCoachSession(token, selectedCoachSession, crypto.randomUUID(), today());
    const { content: _content, ...summary } = duplicate;
    setCoachSessions((items) => [summary, ...items]);
    setSelectedCoachSession(duplicate);
    setSelectedCoachSessionId(duplicate.id);
    setEditingPlanning(false);
    setNotice("Planificación duplicada"); setTimeout(() => setNotice(""), 2200);
  }

  function toggleAssignment(athleteId: string) {
    setAssignAthleteIds((items) => items.includes(athleteId) ? items.filter((id) => id !== athleteId) : [...items, athleteId]);
  }

  async function assignCoachSession() {
    if (!selectedCoachSummary || !selectedCoachSession || !assignAthleteIds.length || !assignmentDate) return;
    let assignedCount = assignAthleteIds.length;
    let skippedCount = 0;
    if (!demoMode) {
      const first = await api.assignCoachSession(token, selectedCoachSummary, assignmentDate, assignAthleteIds);
      assignedCount = first.assigned;
      skippedCount = first.skipped;
      const pendingIds = first.conflicts.filter((item) => item.reason === "pending_session_exists").map((item) => item.athleteId);
      if (pendingIds.length && window.confirm(`Ya existen ${pendingIds.length} sesiones pendientes para ese día. ¿Querés reemplazarlas?`)) {
        const replacement = await api.assignCoachSession(token, selectedCoachSummary, assignmentDate, pendingIds, true);
        assignedCount += replacement.assigned;
        skippedCount = first.skipped - pendingIds.length + replacement.skipped;
      }
    }
    setAssignAthleteIds([]);
    setNotice(`Sesión asignada a ${assignedCount} atleta${assignedCount === 1 ? "" : "s"}${skippedCount ? `; ${skippedCount} sin cambios` : ""}`); setTimeout(() => setNotice(""), 2200);
  }

  async function updateSessionExecution(status: "in_progress" | "completed" | "skipped", result?: SessionResult) {
    if (!session || !activeCoachId) return;
    const updated = demoMode
      ? {
        ...session,
        status,
        result: result ?? session.result,
        startedAt: session.startedAt ?? (status === "in_progress" || status === "completed" ? new Date().toISOString() : undefined),
        completedAt: status === "completed" ? new Date().toISOString() : session.completedAt,
        skippedAt: status === "skipped" ? new Date().toISOString() : session.skippedAt,
        executionVersion: session.executionVersion + 1,
        executionUpdatedAt: new Date().toISOString(),
      } as TrainingSession
      : await api.updateSessionExecution(token, activeCoachId, session.date, status, session.executionVersion, crypto.randomUUID(), result);
    setSessions((items) => items.map((item) => item.coachId === updated.coachId && item.date === updated.date ? updated : item));
    setNotice(status === "completed" ? "Sesión completada" : status === "in_progress" ? "Sesión iniciada" : "Sesión omitida");
    setTimeout(() => setNotice(""), 2200);
  }

  const visibleSessions = sessions.filter((item) => item.athleteId === selected?.id).sort((a, b) => a.date.localeCompare(b.date));

  return <div className="app-shell">
    <header>{profile.role === "coach" ? <button className="mobile-menu" onClick={() => setMobileTeamOpen((open) => !open)} aria-label="Mostrar atletas"><List size={25} weight="bold" /></button> : <span />}<Brand /><div className="user-menu"><span>{profile.name}</span><button onClick={onLogout} aria-label="Salir"><SignOut size={22} weight="bold" /><span className="logout-label">Salir</span></button></div></header>
    <main className={`dashboard ${profile.role}`}>
      {profile.role === "coach" && <aside className={`athletes-panel ${mobileTeamOpen ? "mobile-open" : ""}`}><div className="panel-title"><div><span className="eyebrow">Equipo</span><h2>Atletas</h2></div><button className="icon-button" onClick={addAthlete} aria-label="Agregar atleta"><Plus size={22} weight="bold" /></button></div><div className="athlete-list">{athletes.map((athlete) => <button key={athlete.id} className={selected?.id === athlete.id ? "selected" : ""} onClick={() => { setSelected(athlete); setMobileTeamOpen(false); }}><span className="avatar">{athlete.name.slice(0, 1).toUpperCase()}</span><span><strong>{athlete.name}</strong><small>{athlete.email}</small></span></button>)}</div></aside>}
      <section className="session-panel">
        {profile.role === "coach" && <nav className="coach-navigation" aria-label="Secciones del entrenador"><button className={coachView === "week" ? "active" : ""} onClick={() => setCoachView("week")}>Semana</button><button className={coachView === "plannings" ? "active" : ""} onClick={() => setCoachView("plannings")}>Planificaciones</button></nav>}
        {profile.role === "athlete" && <div className="athlete-selector coach-selector"><span>Coach</span><select aria-label="Coach seleccionado" value={selectedCoachId} onChange={(event) => setSelectedCoachId(event.target.value)} disabled={!coaches.length}><option value="">{coaches.length ? "Seleccioná un coach" : "Todavía no tenés coaches"}</option>{coaches.map((coachItem) => <option key={coachItem.id} value={coachItem.id}>{coachItem.name}</option>)}</select></div>}
        {profile.role === "athlete" && coachInvitations.length > 0 && <section className="invitation-panel"><div><span className="eyebrow">Solicitudes pendientes</span><h2>Invitaciones de coaches</h2></div>{coachInvitations.map((invitation) => <article key={invitation.coach.id}><div><strong>{invitation.coach.name}</strong><small>{invitation.coach.email}</small></div><div><button className="secondary compact" onClick={() => answerInvitation(invitation, "reject")}>Rechazar</button><button className="primary compact" onClick={() => answerInvitation(invitation, "accept")}>Aceptar</button></div></article>)}</section>}
        {profile.role === "athlete" && <div className="date-strip">{Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index - 2); const value = date.toISOString().slice(0, 10); const planned = visibleSessions.find((item) => item.date === value); return <button key={value} className={selectedDate === value ? "active" : ""} onClick={() => setSelectedDate(value)}><span>{new Intl.DateTimeFormat("es", { weekday: "short" }).format(date)}</span><strong>{date.getDate()}</strong>{planned?.status === "completed" ? <CheckCircle className="session-state completed" size={13} weight="fill" /> : <Circle className={`session-state ${planned?.status ?? "empty"}`} size={planned ? 10 : 7} weight={planned?.status === "in_progress" ? "fill" : "regular"} />}</button>; })}</div>}
        {profile.role === "coach" && coachView === "week" && (() => { const [from, to] = weekRange(weekOffset); const demoCalendar = demoSessions.filter((item) => item.coachId === profile.id && item.date >= from && item.date <= to); return <CoachComplianceCalendar from={from} to={to} sessions={demoMode ? demoCalendar : calendarSessions} athletes={athletes} summary={demoMode ? summarizeCompliance(demoCalendar) : compliance} loading={calendarLoading} onPrevious={() => setWeekOffset((value) => value - 1)} onNext={() => setWeekOffset((value) => value + 1)} />; })()}
        {profile.role === "coach" && coachView === "plannings" && <section className="coach-session-panel">
          <div className="coach-session-title"><div><span className="eyebrow">Biblioteca del entrenador</span><h2>Planificaciones</h2></div><button className="secondary compact" onClick={() => setCreatingCoachSession((value) => !value)}>{creatingCoachSession ? "Cerrar" : "Nueva planificación"}</button></div>
          <div className="planning-search"><input aria-label="Buscar planificaciones" maxLength={80} value={planningSearch} onChange={(event) => setPlanningSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") searchPlannings(); }} placeholder="Buscar por nombre" /><button className="primary compact" disabled={loadingPlans} onClick={searchPlannings}>Buscar</button></div>
          {appliedPlanningSearch && <div className="search-state">Resultados para “{appliedPlanningSearch}” <button className="text-button" onClick={clearPlanningSearch}>Limpiar</button></div>}
          {creatingCoachSession && <div className="coach-session-editor"><input aria-label="Nombre de la planificación" autoFocus maxLength={120} value={coachSessionTitle} onChange={(event) => setCoachSessionTitle(event.target.value)} placeholder="Ej.: Fuerza y AMRAP" /><textarea aria-label="Contenido de la planificación" value={coachSessionContent} onChange={(event) => setCoachSessionContent(event.target.value)} placeholder={"==warmup\n\n==fuerza\n\n==wod"} /><button className="primary compact" disabled={!coachSessionTitle.trim() || !coachSessionContent.trim()} onClick={createCoachSession}>Guardar planificación</button></div>}
          <div className="coach-session-grid">{planningLibrary.length ? planningLibrary.map((item) => <button key={item.id} className={selectedCoachSummary?.id === item.id ? "selected" : ""} onClick={() => { setSelectedCoachSessionId(item.id); setSelectedCoachSession(null); setAssignAthleteIds([]); setEditingPlanning(false); }}><strong>{item.title ?? "Planificación"}</strong><small>Creada {new Intl.DateTimeFormat("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${item.date}T12:00:00`))}</small><span className="planning-card-preview" role="tooltip">{item.summary}</span></button>) : <p>{appliedPlanningSearch ? "No encontramos planificaciones con ese nombre." : "Todavía no creaste planificaciones."}</p>}</div>
          {planningCursor && <button className="secondary compact load-more" disabled={loadingPlans} onClick={loadMorePlans}>{loadingPlans ? "Cargando…" : "Cargar más planificaciones"}</button>}
          {selectedCoachSummary && !selectedCoachSession && <div className="planning-detail planning-loading">Cargando planificación…</div>}
          {selectedCoachSession && <div className="planning-detail"><div className="planning-detail-heading"><div><span className="eyebrow">Vista previa</span><h3>{selectedCoachSession.title ?? "Planificación"}</h3></div><div><button className="secondary compact" onClick={beginPlanningEdit}>Editar</button><button className="secondary compact" onClick={duplicatePlanning}>Duplicar</button></div></div>{editingPlanning ? <div className="coach-session-editor planning-edit"><input aria-label="Editar nombre de la planificación" maxLength={120} value={editPlanningTitle} onChange={(event) => setEditPlanningTitle(event.target.value)} /><textarea aria-label="Editar contenido de la planificación" value={editPlanningContent} onChange={(event) => setEditPlanningContent(event.target.value)} /><div><button className="primary compact" onClick={savePlanningEdit}>Guardar cambios</button><button className="secondary compact" onClick={() => setEditingPlanning(false)}>Cancelar</button></div></div> : <WorkoutContent content={selectedCoachSession.content} />}</div>}
          {selectedCoachSummary && selectedCoachSession && athletes.length > 0 && <div className="assign-panel">
            <label className="assignment-date">Día de asignación<input type="date" value={assignmentDate} onChange={(event) => setAssignmentDate(event.target.value)} required /></label>
            <div className="assign-heading"><strong>Atletas</strong><button type="button" className="text-button" onClick={() => setAssignAthleteIds(assignAthleteIds.length === athletes.length ? [] : athletes.map((athlete) => athlete.id))}>{assignAthleteIds.length === athletes.length ? "Limpiar" : "Seleccionar todos"}</button></div>
            <div className="assign-list">{athletes.map((athlete) => <label key={athlete.id}><input type="checkbox" checked={assignAthleteIds.includes(athlete.id)} onChange={() => toggleAssignment(athlete.id)} />{athlete.name}</label>)}</div>
            <button className="primary compact" disabled={!assignAthleteIds.length || !assignmentDate} onClick={assignCoachSession}>Asignar a {assignAthleteIds.length} atleta{assignAthleteIds.length === 1 ? "" : "s"}</button>
          </div>}
        </section>}
        {profile.role === "athlete" && <><div className="session-heading"><div><h1>{prettyDate(selectedDate)}</h1></div></div>
          {!activeCoachId ? <div className="empty"><ClipboardText size={48} weight="bold" /><h3>Elegí un coach</h3><p>Aceptá una invitación o seleccioná un coach para ver sus sesiones.</p></div> : session ? <article className="workout"><div className="workout-title"><ClipboardText size={28} weight="fill" /><h2>{session.title ?? "Sesión del día"}</h2></div><WorkoutContent content={session.content} /><SessionExecutionCard key={`${session.coachId}-${session.date}`} session={session} onUpdate={updateSessionExecution} /><div className="workout-updated">Actualizado {new Intl.DateTimeFormat("es-UY", { hour: "2-digit", minute: "2-digit" }).format(new Date(session.updatedAt))}</div></article> : <div className="empty"><CalendarDots size={48} weight="bold" /><h3>Día libre de momento</h3><p>Este coach todavía no programó una sesión para este día.</p></div>}
        </>}
      </section>
    </main>
    {notice && <div className="toast"><CheckCircle size={20} weight="fill" />{notice}</div>}
  </div>;
}

const sectionIcons = [Heartbeat, Barbell, PersonSimpleRun];

function parseWorkoutSections(content: string) {
  const sections: { heading: string; body: string }[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of content.split("\n")) {
    const heading = line.match(/^==\s*(.+?)\s*$/)?.[1]?.trim();
    if (heading) {
      if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
      current = { heading, lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      current = { heading: "Planificacion", lines: [line] };
    }
  }

  if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
  return sections;
}

function planningSummary(content: string) {
  const summary = content.replace(/^==\s*/gm, "").replace(/\s+/g, " ").trim();
  return summary.length > 180 ? `${summary.slice(0, 177)}…` : summary;
}

function WorkoutContent({ content }: { content: string }) {
  const sections = parseWorkoutSections(content).filter((section) => section.heading || section.body);

  return <div className="workout-blocks">{sections.map((section, index) => {
    const Icon = sectionIcons[index] ?? Barbell;
    return <section className="workout-block" key={`${section.heading}-${index}`}><div className="block-icon"><Icon size={34} weight="bold" /></div><div><h3>{section.heading}</h3><p>{section.body}</p></div></section>;
  })}</div>;
}

export default App;
