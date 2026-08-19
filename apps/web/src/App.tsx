import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Barbell,
  CalendarDots,
  CaretDown,
  CheckCircle,
  Circle,
  ClipboardText,
  Heartbeat,
  List,
  PersonSimpleRun,
  PencilSimple,
  Plus,
  SignOut,
} from "@phosphor-icons/react";
import { api } from "./api";
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
import type { Athlete, Coach, CoachInvitation, CoachSession, CoachSessionSummary, Role, TrainingSession, UserProfile } from "./types";

const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
const demoUserProfile = import.meta.env.VITE_DEMO_ROLE === "athlete" ? demoAthleteProfile : demoProfile;
const today = () => new Date().toISOString().slice(0, 10);
const monthRange = () => {
  const from = new Date();
  from.setDate(1);
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
  return [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)];
};
const prettyDate = (value: string) => {
  const formatted = new Intl.DateTimeFormat("es-UY", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${value}T12:00:00`),
  );
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

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
      if (mode === "login" && cause instanceof Error && cause.name === "UserNotConfirmedException") {
        setMode("confirm");
        setPassword("");
        setNotice("Tu cuenta todavía no está confirmada. Podés solicitar un código nuevo.");
      } else {
        setError(cause instanceof Error ? cause.message : "No pudimos completar la operación");
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
      setError(cause instanceof Error ? cause.message : "No pudimos reenviar el código");
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
      {mode !== "confirm" && mode !== "reset" && <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>}
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
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileTeamOpen, setMobileTeamOpen] = useState(false);

  useEffect(() => {
    if (demoMode || profile.role !== "coach") return;
    api.athletes(token).then((items) => { setAthletes(items); setSelected(items[0] ?? null); });
  }, [profile.role, token]);

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
    if (!selected || !activeCoachId) { setSessions([]); return; }
    const [from, to] = monthRange();
    if (demoMode) {
      setSessions(demoSessions.filter((item) => item.athleteId === selected.id && item.coachId === activeCoachId));
      return;
    }
    api.sessions(token, selected.id, activeCoachId, from, to).then(setSessions);
  }, [activeCoachId, selected, token]);

  useEffect(() => {
    if (demoMode || profile.role !== "coach") return;
    api.coachSessions(token).then((page) => { setCoachSessions(page.items); setPlanningCursor(page.nextCursor); });
  }, [profile.role, token]);

  const session = useMemo(() => sessions.find((item) => item.athleteId === selected?.id && item.date === selectedDate), [sessions, selected, selectedDate]);
  const planningLibrary = useMemo(() => [...coachSessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [coachSessions]);
  const selectedCoachSummary = useMemo(() => coachSessions.find((item) => item.id === selectedCoachSessionId) ?? planningLibrary[0] ?? null, [coachSessions, planningLibrary, selectedCoachSessionId]);
  useEffect(() => setContent(session?.content ?? ""), [session]);
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

  async function save() {
    if (!selected || !activeCoachId || !content.trim()) return;
    const saved = demoMode ? { athleteId: selected.id, coachId: activeCoachId, date: selectedDate, content, updatedAt: new Date().toISOString() } : await api.saveSession(token, selected.id, selectedDate, content);
    setSessions((items) => [...items.filter((item) => !(item.athleteId === saved.athleteId && item.date === saved.date)), saved]);
    setEditing(false); setNotice("Sesión guardada"); setTimeout(() => setNotice(""), 2200);
  }

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
      ? { id: `coach-session-${Date.now()}`, title: coachSessionTitle.trim(), date: today(), content: coachSessionContent, summary: planningSummary(coachSessionContent), updatedAt: new Date().toISOString() }
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
      const page = await api.coachSessions(token, planningCursor);
      setCoachSessions((items) => [...items, ...page.items.filter((next) => !items.some((item) => item.id === next.id))]);
      setPlanningCursor(page.nextCursor);
    } finally { setLoadingPlans(false); }
  }

  function toggleAssignment(athleteId: string) {
    setAssignAthleteIds((items) => items.includes(athleteId) ? items.filter((id) => id !== athleteId) : [...items, athleteId]);
  }

  async function assignCoachSession() {
    if (!selectedCoachSummary || !selectedCoachSession || !assignAthleteIds.length || !assignmentDate) return;
    if (!demoMode) await api.assignCoachSession(token, selectedCoachSummary, assignmentDate, assignAthleteIds);
    const assignedSessions = assignAthleteIds.map((athleteId) => ({
      athleteId,
      coachId: profile.id,
      date: assignmentDate,
      content: selectedCoachSession.content,
      updatedAt: new Date().toISOString(),
    }));
    setSessions((items) => [
      ...items.filter((item) => !assignedSessions.some((assigned) => assigned.athleteId === item.athleteId && assigned.date === item.date)),
      ...assignedSessions,
    ]);
    setAssignAthleteIds([]);
    setSelectedDate(assignmentDate);
    setNotice(`Sesión asignada a ${assignedSessions.length} atleta${assignedSessions.length === 1 ? "" : "s"}`); setTimeout(() => setNotice(""), 2200);
  }

  const visibleSessions = sessions.filter((item) => item.athleteId === selected?.id).sort((a, b) => a.date.localeCompare(b.date));

  return <div className="app-shell">
    <header>{profile.role === "coach" ? <button className="mobile-menu" onClick={() => setMobileTeamOpen((open) => !open)} aria-label="Mostrar atletas"><List size={25} weight="bold" /></button> : <span />}<Brand /><div className="user-menu"><span>{profile.name}</span><button onClick={onLogout} aria-label="Salir"><SignOut size={22} weight="bold" /><span className="logout-label">Salir</span></button></div></header>
    <main className="dashboard">
      {profile.role === "coach" && <aside className={`athletes-panel ${mobileTeamOpen ? "mobile-open" : ""}`}><div className="panel-title"><div><span className="eyebrow">Equipo</span><h2>Atletas</h2></div><button className="icon-button" onClick={addAthlete} aria-label="Agregar atleta"><Plus size={22} weight="bold" /></button></div><div className="athlete-list">{athletes.map((athlete) => <button key={athlete.id} className={selected?.id === athlete.id ? "selected" : ""} onClick={() => { setSelected(athlete); setMobileTeamOpen(false); }}><span className="avatar">{athlete.name.slice(0, 1).toUpperCase()}</span><span><strong>{athlete.name}</strong><small>{athlete.email}</small></span></button>)}</div></aside>}
      <section className="session-panel">
        {profile.role === "coach"
          ? <div className="athlete-selector"><span>Atleta</span><button type="button">{selected?.name ?? "Selecciona un atleta"}<CaretDown size={26} weight="bold" /></button></div>
          : <div className="athlete-selector coach-selector"><span>Coach</span><select aria-label="Coach seleccionado" value={selectedCoachId} onChange={(event) => setSelectedCoachId(event.target.value)} disabled={!coaches.length}><option value="">{coaches.length ? "Seleccioná un coach" : "Todavía no tenés coaches"}</option>{coaches.map((coachItem) => <option key={coachItem.id} value={coachItem.id}>{coachItem.name}</option>)}</select></div>}
        {profile.role === "athlete" && coachInvitations.length > 0 && <section className="invitation-panel"><div><span className="eyebrow">Solicitudes pendientes</span><h2>Invitaciones de coaches</h2></div>{coachInvitations.map((invitation) => <article key={invitation.coach.id}><div><strong>{invitation.coach.name}</strong><small>{invitation.coach.email}</small></div><div><button className="secondary compact" onClick={() => answerInvitation(invitation, "reject")}>Rechazar</button><button className="primary compact" onClick={() => answerInvitation(invitation, "accept")}>Aceptar</button></div></article>)}</section>}
        <div className="date-strip">{Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index - 2); const value = date.toISOString().slice(0, 10); return <button key={value} className={selectedDate === value ? "active" : ""} onClick={() => setSelectedDate(value)}><span>{new Intl.DateTimeFormat("es", { weekday: "short" }).format(date)}</span><strong>{date.getDate()}</strong>{visibleSessions.some((item) => item.date === value) ? <CheckCircle className="session-state" size={13} weight="fill" /> : <Circle className="session-state" size={7} weight="fill" />}</button>; })}</div>
        {profile.role === "coach" && <section className="coach-session-panel">
          <div className="coach-session-title"><div><span className="eyebrow">Biblioteca del entrenador</span><h2>Planificaciones</h2></div><button className="secondary compact" onClick={() => setCreatingCoachSession((value) => !value)}>{creatingCoachSession ? "Cerrar" : "Nueva planificación"}</button></div>
          {creatingCoachSession && <div className="coach-session-editor"><input aria-label="Nombre de la planificación" autoFocus maxLength={120} value={coachSessionTitle} onChange={(event) => setCoachSessionTitle(event.target.value)} placeholder="Ej.: Fuerza y AMRAP" /><textarea aria-label="Contenido de la planificación" value={coachSessionContent} onChange={(event) => setCoachSessionContent(event.target.value)} placeholder={"==warmup\n\n==fuerza\n\n==wod"} /><button className="primary compact" disabled={!coachSessionTitle.trim() || !coachSessionContent.trim()} onClick={createCoachSession}>Guardar planificación</button></div>}
          <div className="coach-session-grid">{planningLibrary.length ? planningLibrary.map((item) => <button key={item.id} className={selectedCoachSummary?.id === item.id ? "selected" : ""} onClick={() => { setSelectedCoachSessionId(item.id); setSelectedCoachSession(null); setAssignAthleteIds([]); }}><strong>{item.title ?? "Planificación"}</strong><small>Creada {new Intl.DateTimeFormat("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${item.date}T12:00:00`))}</small><span className="planning-card-preview" role="tooltip">{item.summary}</span></button>) : <p>Todavía no creaste planificaciones.</p>}</div>
          {planningCursor && <button className="secondary compact load-more" disabled={loadingPlans} onClick={loadMorePlans}>{loadingPlans ? "Cargando…" : "Cargar más planificaciones"}</button>}
          {selectedCoachSummary && !selectedCoachSession && <div className="planning-detail planning-loading">Cargando planificación…</div>}
          {selectedCoachSession && <div className="planning-detail"><span className="eyebrow">Vista previa</span><h3>{selectedCoachSession.title ?? "Planificación"}</h3><WorkoutContent content={selectedCoachSession.content} /></div>}
          {selectedCoachSummary && selectedCoachSession && athletes.length > 0 && <div className="assign-panel">
            <label className="assignment-date">Día de asignación<input type="date" value={assignmentDate} onChange={(event) => setAssignmentDate(event.target.value)} required /></label>
            <div className="assign-heading"><strong>Atletas</strong><button type="button" className="text-button" onClick={() => setAssignAthleteIds(assignAthleteIds.length === athletes.length ? [] : athletes.map((athlete) => athlete.id))}>{assignAthleteIds.length === athletes.length ? "Limpiar" : "Seleccionar todos"}</button></div>
            <div className="assign-list">{athletes.map((athlete) => <label key={athlete.id}><input type="checkbox" checked={assignAthleteIds.includes(athlete.id)} onChange={() => toggleAssignment(athlete.id)} />{athlete.name}</label>)}</div>
            <button className="primary compact" disabled={!assignAthleteIds.length || !assignmentDate} onClick={assignCoachSession}>Asignar a {assignAthleteIds.length} atleta{assignAthleteIds.length === 1 ? "" : "s"}</button>
          </div>}
        </section>}
        <div className="session-heading"><div><h1>{prettyDate(selectedDate)}</h1></div></div>
        {!activeCoachId ? <div className="empty"><ClipboardText size={48} weight="bold" /><h3>Elegí un coach</h3><p>Aceptá una invitación o seleccioná un coach para ver sus sesiones.</p></div> : !selected ? <div className="empty"><ClipboardText size={48} weight="bold" /><h3>Tu equipo está vacío</h3><p>Invitá al primer atleta para comenzar a programar.</p></div> : editing ? <div className="editor"><label>Contenido de la sesión<textarea autoFocus value={content} onChange={(e) => setContent(e.target.value)} placeholder={"==warmup\n\n==fuerza\n\n==wod"} /></label><div><button className="secondary" onClick={() => { setEditing(false); setContent(session?.content ?? ""); }}>Cancelar</button><button className="primary" onClick={save}>Guardar sesión</button></div></div> : session ? <article className="workout"><div className="workout-title"><ClipboardText size={28} weight="fill" /><h2>Sesión del día</h2></div><WorkoutContent content={session.content} /><div className="workout-updated">Actualizado {new Intl.DateTimeFormat("es-UY", { hour: "2-digit", minute: "2-digit" }).format(new Date(session.updatedAt))}</div>{profile.role === "coach" && <button className="edit-session" onClick={() => setEditing(true)}><PencilSimple size={24} weight="fill" />Editar sesión</button>}</article> : <div className="empty"><CalendarDots size={48} weight="bold" /><h3>Día libre de momento</h3><p>{profile.role === "coach" ? "Todavía no cargaste una sesión para este día." : "Este coach todavía no programó una sesión para este día."}</p>{profile.role === "coach" && <button className="primary compact" onClick={() => setEditing(true)}><Plus size={20} weight="bold" />Agregar sesión</button>}</div>}
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
