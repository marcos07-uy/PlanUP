import { CaretLeft, CaretRight, CheckCircle, Clock, MinusCircle, PlayCircle } from "@phosphor-icons/react";
import type { TrainingSession } from "../types";

const statusCopy = {
  pending: { label: "Pendiente", icon: Clock },
  in_progress: { label: "En curso", icon: PlayCircle },
  completed: { label: "Completada", icon: CheckCircle },
  skipped: { label: "Omitida", icon: MinusCircle },
};

function monthTitle(value: string) {
  const text = new Intl.DateTimeFormat("es-UY", { month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function AthleteHistory({ from, sessions, selectedDate, loading, onSelect, onPrevious, onNext }: {
  from: string;
  sessions: TrainingSession[];
  selectedDate: string;
  loading: boolean;
  onSelect(date: string): void;
  onPrevious(): void;
  onNext(): void;
}) {
  return <section className="athlete-history">
    <div className="history-heading"><button aria-label="Mes anterior del historial" onClick={onPrevious}><CaretLeft weight="bold" /></button><div><span className="eyebrow">Historial</span><h2>{monthTitle(from)}</h2></div><button aria-label="Mes siguiente del historial" onClick={onNext}><CaretRight weight="bold" /></button></div>
    {loading ? <p>Cargando historial…</p> : sessions.length ? <div className="history-list">{[...sessions].sort((a, b) => b.date.localeCompare(a.date)).map((session) => { const state = statusCopy[session.status]; const Icon = state.icon; return <button key={`${session.coachId}-${session.date}`} className={selectedDate === session.date ? "selected" : ""} onClick={() => onSelect(session.date)}><time>{new Intl.DateTimeFormat("es-UY", { day: "2-digit", month: "short" }).format(new Date(`${session.date}T12:00:00Z`))}</time><div><strong>{session.title ?? "Sesión planificada"}</strong><small><Icon weight="fill" />{state.label}{session.result?.rpe ? ` · RPE ${session.result.rpe}` : ""}</small></div></button>; })}</div> : <p>No hay sesiones de este coach en el mes.</p>}
  </section>;
}
