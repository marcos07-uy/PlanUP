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
import { confirm, currentToken, signIn, signOut, signUp } from "./auth";
import { demoAthletes, demoProfile, demoSessions } from "./demo";
import type { Athlete, Role, TrainingSession, UserProfile } from "./types";

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
  const [mode, setMode] = useState<"login" | "signup" | "confirm">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState<Role>("coach");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      if (mode === "signup") { await signUp(name, email, password, role); setMode("confirm"); }
      else if (mode === "confirm") { await confirm(email, code); setMode("login"); }
      else {
        const nextToken = await signIn(email, password);
        onAuthenticated(nextToken, await api.me(nextToken));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos completar la operación"); }
    finally { setBusy(false); }
  }

  return <main className="auth-shell">
    <section className="auth-intro"><Brand /><h1>Tu entrenamiento,<br />bien organizado.</h1><p>El plan del coach, claro y disponible todos los dias.</p></section>
    <form className="auth-card" onSubmit={submit}>
      <span className="eyebrow">{mode === "login" ? "Bienvenido" : mode === "signup" ? "Crear cuenta" : "Verificar email"}</span>
      <h2>{mode === "login" ? "Inicia sesión" : mode === "signup" ? "Empezá con PlanUp" : "Revisá tu correo"}</h2>
      {mode === "signup" && <><label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} required /></label><div className="role-picker"><button type="button" className={role === "coach" ? "active" : ""} onClick={() => setRole("coach")}>Entrenador</button><button type="button" className={role === "athlete" ? "active" : ""} onClick={() => setRole("athlete")}>Atleta</button></div></>}
      {mode !== "confirm" && <><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label></>}
      {mode === "confirm" && <label>Codigo de verificacion<input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required /></label>}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Procesando…" : mode === "login" ? "Entrar" : mode === "signup" ? "Crear cuenta" : "Verificar"}</button>
      {mode !== "confirm" && <button type="button" className="text-button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "No tengo cuenta" : "Ya tengo cuenta"}</button>}
    </form>
  </main>;
}

function Dashboard({ token, profile, onLogout }: { token: string; profile: UserProfile; onLogout(): void }) {
  const [athletes, setAthletes] = useState<Athlete[]>(demoMode ? demoAthletes : []);
  const [selected, setSelected] = useState<Athlete | null>(demoMode ? demoAthletes[0] : profile.role === "athlete" ? { id: profile.id, name: profile.name, email: profile.email } : null);
  const [sessions, setSessions] = useState<TrainingSession[]>(demoMode ? demoSessions : []);
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

  const session = useMemo(() => sessions.find((item) => item.athleteId === selected?.id && item.date === selectedDate), [sessions, selected, selectedDate]);
  useEffect(() => setContent(session?.content ?? ""), [session]);

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

  const visibleSessions = sessions.filter((item) => item.athleteId === selected?.id).sort((a, b) => a.date.localeCompare(b.date));

  return <div className="app-shell">
    <header><button className="mobile-menu" onClick={() => setMobileTeamOpen((open) => !open)} aria-label="Mostrar atletas"><List size={25} weight="bold" /></button><Brand /><div className="user-menu"><span>{profile.name}</span><button onClick={onLogout} aria-label="Salir"><SignOut size={22} weight="bold" /><span className="logout-label">Salir</span></button></div></header>
    <main className="dashboard">
      {profile.role === "coach" && <aside className={`athletes-panel ${mobileTeamOpen ? "mobile-open" : ""}`}><div className="panel-title"><div><span className="eyebrow">Equipo</span><h2>Atletas</h2></div><button className="icon-button" onClick={addAthlete} aria-label="Agregar atleta"><Plus size={22} weight="bold" /></button></div><div className="athlete-list">{athletes.map((athlete) => <button key={athlete.id} className={selected?.id === athlete.id ? "selected" : ""} onClick={() => { setSelected(athlete); setMobileTeamOpen(false); }}><span className="avatar">{athlete.name.slice(0, 1).toUpperCase()}</span><span><strong>{athlete.name}</strong><small>{athlete.email}</small></span></button>)}</div></aside>}
      <section className="session-panel">
        <div className="athlete-selector"><span>Atleta</span><button type="button">{profile.role === "coach" ? selected?.name ?? "Selecciona un atleta" : profile.name}<CaretDown size={26} weight="bold" /></button></div>
        <div className="date-strip">{Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index - 2); const value = date.toISOString().slice(0, 10); return <button key={value} className={selectedDate === value ? "active" : ""} onClick={() => setSelectedDate(value)}><span>{new Intl.DateTimeFormat("es", { weekday: "short" }).format(date)}</span><strong>{date.getDate()}</strong>{visibleSessions.some((item) => item.date === value) ? <CheckCircle className="session-state" size={13} weight="fill" /> : <Circle className="session-state" size={7} weight="fill" />}</button>; })}</div>
        <div className="session-heading"><div><h1>{prettyDate(selectedDate)}</h1></div></div>
        {!selected ? <div className="empty"><ClipboardText size={48} weight="bold" /><h3>Tu equipo está vacío</h3><p>Vinculá al primer atleta para comenzar a programar.</p></div> : editing ? <div className="editor"><label>Contenido de la sesión<textarea autoFocus value={content} onChange={(e) => setContent(e.target.value)} placeholder={"CALENTAMIENTO\n\nFUERZA\n\nWOD"} /></label><div><button className="secondary" onClick={() => { setEditing(false); setContent(session?.content ?? ""); }}>Cancelar</button><button className="primary" onClick={save}>Guardar sesión</button></div></div> : session ? <article className="workout"><div className="workout-title"><ClipboardText size={28} weight="fill" /><h2>Sesión del día</h2></div><WorkoutContent content={session.content} /><div className="workout-updated">Actualizado {new Intl.DateTimeFormat("es-UY", { hour: "2-digit", minute: "2-digit" }).format(new Date(session.updatedAt))}</div>{profile.role === "coach" && <button className="edit-session" onClick={() => setEditing(true)}><PencilSimple size={24} weight="fill" />Editar sesión</button>}</article> : <div className="empty"><CalendarDots size={48} weight="bold" /><h3>Día libre de momento</h3><p>{profile.role === "coach" ? "Todavía no cargaste una sesión para este día." : "Tu coach todavía no programó una sesión para este día."}</p>{profile.role === "coach" && <button className="primary compact" onClick={() => setEditing(true)}><Plus size={20} weight="bold" />Agregar sesión</button>}</div>}
      </section>
    </main>
    {notice && <div className="toast"><CheckCircle size={20} weight="fill" />{notice}</div>}
  </div>;
}

const sectionIcons = [Heartbeat, Barbell, PersonSimpleRun];

function WorkoutContent({ content }: { content: string }) {
  const blocks = content.split(/(?=^(?:CALENTAMIENTO|FUERZA|WOD)\b)/gim).filter((block) => block.trim());

  return <div className="workout-blocks">{blocks.map((block, index) => {
    const lines = block.trim().split("\n");
    const firstLine = lines.shift() ?? "Bloque";
    const heading = firstLine.match(/^(CALENTAMIENTO|FUERZA|WOD)\b/i)?.[1] ?? "Bloque";
    const firstDetail = firstLine.slice(heading.length).replace(/^\s*[—:-]\s*/, "");
    if (firstDetail) lines.unshift(firstDetail);
    const Icon = sectionIcons[index] ?? Barbell;
    return <section className="workout-block" key={`${heading}-${index}`}><div className="block-icon"><Icon size={34} weight="bold" /></div><div><h3>{heading}</h3><p>{lines.join("\n")}</p></div></section>;
  })}</div>;
}

export default App;
