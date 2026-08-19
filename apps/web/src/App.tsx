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
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
} from "./auth";
import { demoAthletes, demoCoachSessions, demoProfile, demoSessions } from "./demo";
import type { Athlete, CoachSession, Role, TrainingSession, UserProfile } from "./types";

const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
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
  const [profile, setProfile] = useState<UserProfile | null>(demoMode ? demoProfile : null);
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

  function changeMode(nextMode: typeof mode) {
    setMode(nextMode);
    setError("");
    setNotice("");
    setCode("");
    setPassword("");
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos completar la operación"); }
    finally { setBusy(false); }
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
      {mode === "login" && <button type="button" className="text-button" onClick={() => changeMode("forgot")}>Olvidé mi contraseña</button>}
      {(mode === "login" || mode === "signup") && <button type="button" className="text-button" onClick={() => changeMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "No tengo cuenta" : "Ya tengo cuenta"}</button>}
      {(mode === "confirm" || mode === "forgot" || mode === "reset") && <button type="button" className="text-button" onClick={() => changeMode("login")}>Volver al inicio de sesión</button>}
    </form>
  </main>;
}

function Dashboard({ token, profile, onLogout }: { token: string; profile: UserProfile; onLogout(): void }) {
  const [athletes, setAthletes] = useState<Athlete[]>(demoMode ? demoAthletes : []);
  const [selected, setSelected] = useState<Athlete | null>(demoMode ? demoAthletes[0] : profile.role === "athlete" ? { id: profile.id, name: profile.name, email: profile.email } : null);
  const [sessions, setSessions] = useState<TrainingSession[]>(demoMode ? demoSessions : []);
  const [coachSessions, setCoachSessions] = useState<CoachSession[]>(demoMode ? demoCoachSessions : []);
  const [selectedCoachSessionId, setSelectedCoachSessionId] = useState<string | null>(demoMode ? demoCoachSessions[0]?.id ?? null : null);
  const [coachSessionContent, setCoachSessionContent] = useState("");
  const [creatingCoachSession, setCreatingCoachSession] = useState(false);
  const [assignAthleteIds, setAssignAthleteIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileTeamOpen, setMobileTeamOpen] = useState(false);

  useEffect(() => {
    if (demoMode || profile.role !== "coach") return;
    api.athletes(token).then((items) => { setAthletes(items); setSelected(items[0] ?? null); });
  }, [profile.role, token]);

  useEffect(() => {
    if (!selected || demoMode) return;
    const [from, to] = monthRange();
    api.sessions(token, selected.id, from, to).then(setSessions);
  }, [selected, token]);

  useEffect(() => {
    if (demoMode || profile.role !== "coach") return;
    const [from, to] = monthRange();
    api.coachSessions(token, from, to).then(setCoachSessions);
  }, [profile.role, token]);

  const session = useMemo(() => sessions.find((item) => item.athleteId === selected?.id && item.date === selectedDate), [sessions, selected, selectedDate]);
  const coachSessionsForDate = useMemo(() => coachSessions.filter((item) => item.date === selectedDate), [coachSessions, selectedDate]);
  const selectedCoachSession = useMemo(() => coachSessions.find((item) => item.id === selectedCoachSessionId) ?? coachSessionsForDate[0] ?? null, [coachSessions, coachSessionsForDate, selectedCoachSessionId]);
  useEffect(() => setContent(session?.content ?? ""), [session]);
  useEffect(() => { setSelectedCoachSessionId(coachSessionsForDate[0]?.id ?? null); setAssignAthleteIds([]); }, [coachSessionsForDate]);

  async function save() {
    if (!selected || !content.trim()) return;
    const saved = demoMode ? { athleteId: selected.id, date: selectedDate, content, updatedAt: new Date().toISOString() } : await api.saveSession(token, selected.id, selectedDate, content);
    setSessions((items) => [...items.filter((item) => !(item.athleteId === saved.athleteId && item.date === saved.date)), saved]);
    setEditing(false); setNotice("Sesión guardada"); setTimeout(() => setNotice(""), 2200);
  }

  async function addAthlete() {
    const email = window.prompt("Email del atleta registrado");
    if (!email) return;
    const added = demoMode ? { id: `athlete-${Date.now()}`, name: email.split("@")[0], email } : await api.addAthlete(token, email);
    setAthletes((items) => [...items, added]); setSelected(added);
  }

  async function createCoachSession() {
    if (!coachSessionContent.trim()) return;
    const created = demoMode
      ? { id: `coach-session-${Date.now()}`, date: selectedDate, content: coachSessionContent, updatedAt: new Date().toISOString() }
      : await api.createCoachSession(token, selectedDate, coachSessionContent);
    setCoachSessions((items) => [...items, created]);
    setSelectedCoachSessionId(created.id);
    setCoachSessionContent("");
    setCreatingCoachSession(false);
    setNotice("Sesión base creada"); setTimeout(() => setNotice(""), 2200);
  }

  function toggleAssignment(athleteId: string) {
    setAssignAthleteIds((items) => items.includes(athleteId) ? items.filter((id) => id !== athleteId) : [...items, athleteId]);
  }

  async function assignCoachSession() {
    if (!selectedCoachSession || !assignAthleteIds.length) return;
    if (!demoMode) await api.assignCoachSession(token, selectedCoachSession, assignAthleteIds);
    const assignedSessions = assignAthleteIds.map((athleteId) => ({
      athleteId,
      date: selectedCoachSession.date,
      content: selectedCoachSession.content,
      updatedAt: new Date().toISOString(),
    }));
    setSessions((items) => [
      ...items.filter((item) => !assignedSessions.some((assigned) => assigned.athleteId === item.athleteId && assigned.date === item.date)),
      ...assignedSessions,
    ]);
    setAssignAthleteIds([]);
    setNotice(`Sesión asignada a ${assignedSessions.length} atleta${assignedSessions.length === 1 ? "" : "s"}`); setTimeout(() => setNotice(""), 2200);
  }

  const visibleSessions = sessions.filter((item) => item.athleteId === selected?.id).sort((a, b) => a.date.localeCompare(b.date));

  return <div className="app-shell">
    <header><button className="mobile-menu" onClick={() => setMobileTeamOpen((open) => !open)} aria-label="Mostrar atletas"><List size={25} weight="bold" /></button><Brand /><div className="user-menu"><span>{profile.name}</span><button onClick={onLogout} aria-label="Salir"><SignOut size={22} weight="bold" /><span className="logout-label">Salir</span></button></div></header>
    <main className="dashboard">
      {profile.role === "coach" && <aside className={`athletes-panel ${mobileTeamOpen ? "mobile-open" : ""}`}><div className="panel-title"><div><span className="eyebrow">Equipo</span><h2>Atletas</h2></div><button className="icon-button" onClick={addAthlete} aria-label="Agregar atleta"><Plus size={22} weight="bold" /></button></div><div className="athlete-list">{athletes.map((athlete) => <button key={athlete.id} className={selected?.id === athlete.id ? "selected" : ""} onClick={() => { setSelected(athlete); setMobileTeamOpen(false); }}><span className="avatar">{athlete.name.slice(0, 1).toUpperCase()}</span><span><strong>{athlete.name}</strong><small>{athlete.email}</small></span></button>)}</div></aside>}
      <section className="session-panel">
        <div className="athlete-selector"><span>Atleta</span><button type="button">{profile.role === "coach" ? selected?.name ?? "Selecciona un atleta" : profile.name}<CaretDown size={26} weight="bold" /></button></div>
        <div className="date-strip">{Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index - 2); const value = date.toISOString().slice(0, 10); return <button key={value} className={selectedDate === value ? "active" : ""} onClick={() => setSelectedDate(value)}><span>{new Intl.DateTimeFormat("es", { weekday: "short" }).format(date)}</span><strong>{date.getDate()}</strong>{visibleSessions.some((item) => item.date === value) ? <CheckCircle className="session-state" size={13} weight="fill" /> : <Circle className="session-state" size={7} weight="fill" />}</button>; })}</div>
        {profile.role === "coach" && <section className="coach-session-panel"><div className="coach-session-title"><div><span className="eyebrow">Programa del coach</span><h2>Sesiones base</h2></div><button className="secondary compact" onClick={() => setCreatingCoachSession((value) => !value)}>{creatingCoachSession ? "Cerrar" : "Nueva base"}</button></div>{creatingCoachSession && <div className="coach-session-editor"><textarea autoFocus value={coachSessionContent} onChange={(event) => setCoachSessionContent(event.target.value)} placeholder={"==warmup\n\n==fuerza\n\n==wod"} /><button className="primary compact" onClick={createCoachSession}>Crear sesión base</button></div>}<div className="coach-session-grid">{coachSessionsForDate.length ? coachSessionsForDate.map((item) => <button key={item.id} className={selectedCoachSession?.id === item.id ? "selected" : ""} onClick={() => setSelectedCoachSessionId(item.id)}><strong>{parseWorkoutSections(item.content)[0]?.heading ?? "Sesión"}</strong><small>{parseWorkoutSections(item.content).length} bloque{parseWorkoutSections(item.content).length === 1 ? "" : "s"}</small></button>) : <p>No hay sesiones base para este día.</p>}</div>{selectedCoachSession && athletes.length > 0 && <div className="assign-panel"><div className="assign-list">{athletes.map((athlete) => <label key={athlete.id}><input type="checkbox" checked={assignAthleteIds.includes(athlete.id)} onChange={() => toggleAssignment(athlete.id)} />{athlete.name}</label>)}</div><button className="primary compact" disabled={!assignAthleteIds.length} onClick={assignCoachSession}>Asignar sesión</button></div>}</section>}
        <div className="session-heading"><div><h1>{prettyDate(selectedDate)}</h1></div></div>
        {!selected ? <div className="empty"><ClipboardText size={48} weight="bold" /><h3>Tu equipo está vacío</h3><p>Vinculá al primer atleta para comenzar a programar.</p></div> : editing ? <div className="editor"><label>Contenido de la sesión<textarea autoFocus value={content} onChange={(e) => setContent(e.target.value)} placeholder={"==warmup\n\n==fuerza\n\n==wod"} /></label><div><button className="secondary" onClick={() => { setEditing(false); setContent(session?.content ?? ""); }}>Cancelar</button><button className="primary" onClick={save}>Guardar sesión</button></div></div> : session ? <article className="workout"><div className="workout-title"><ClipboardText size={28} weight="fill" /><h2>Sesión del día</h2></div><WorkoutContent content={session.content} /><div className="workout-updated">Actualizado {new Intl.DateTimeFormat("es-UY", { hour: "2-digit", minute: "2-digit" }).format(new Date(session.updatedAt))}</div>{profile.role === "coach" && <button className="edit-session" onClick={() => setEditing(true)}><PencilSimple size={24} weight="fill" />Editar sesión</button>}</article> : <div className="empty"><CalendarDots size={48} weight="bold" /><h3>Día libre de momento</h3><p>{profile.role === "coach" ? "Todavía no cargaste una sesión para este día." : "Tu coach todavía no programó una sesión para este día."}</p>{profile.role === "coach" && <button className="primary compact" onClick={() => setEditing(true)}><Plus size={20} weight="bold" />Agregar sesión</button>}</div>}
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

function WorkoutContent({ content }: { content: string }) {
  const sections = parseWorkoutSections(content).filter((section) => section.heading || section.body);

  return <div className="workout-blocks">{sections.map((section, index) => {
    const Icon = sectionIcons[index] ?? Barbell;
    return <section className="workout-block" key={`${section.heading}-${index}`}><div className="block-icon"><Icon size={34} weight="bold" /></div><div><h3>{section.heading}</h3><p>{section.body}</p></div></section>;
  })}</div>;
}

export default App;
