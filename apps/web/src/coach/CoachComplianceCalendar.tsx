import { CaretLeft, CaretRight, CheckCircle, Clock, MinusCircle, PlayCircle, WarningCircle } from "@phosphor-icons/react";
import type { Athlete, ComplianceSummary, TrainingSession } from "../types";

const statusCopy = {
  pending: { label: "Pendiente", icon: Clock },
  in_progress: { label: "En curso", icon: PlayCircle },
  completed: { label: "Completada", icon: CheckCircle },
  skipped: { label: "Omitida", icon: MinusCircle },
};

function shortDate(value: string) {
  return new Intl.DateTimeFormat("es-UY", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}

export function CoachComplianceCalendar({ from, to, sessions, athletes, summary, loading, onPrevious, onNext }: {
  from: string;
  to: string;
  sessions: TrainingSession[];
  athletes: Athlete[];
  summary: ComplianceSummary;
  loading: boolean;
  onPrevious(): void;
  onNext(): void;
}) {
  const athleteNames = new Map(athletes.map((athlete) => [athlete.id, athlete.name]));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Montevideo" });

  return <section className="compliance-panel">
    <div className="week-heading">
      <button aria-label="Semana anterior" onClick={onPrevious}><CaretLeft weight="bold" /></button>
      <div><span className="eyebrow">Cumplimiento semanal</span><h2>{shortDate(from)} — {shortDate(to)}</h2></div>
      <button aria-label="Semana siguiente" onClick={onNext}><CaretRight weight="bold" /></button>
    </div>
    <div className="compliance-summary">
      <span><strong>{summary.completed}</strong><small>Completadas</small></span>
      <span><strong>{summary.inProgress}</strong><small>En curso</small></span>
      <span><strong>{summary.pending}</strong><small>Pendientes</small></span>
      <span className={summary.overdue ? "alert" : ""}><strong>{summary.overdue}</strong><small>Vencidas</small></span>
      <span><strong>{summary.skipped}</strong><small>Omitidas</small></span>
    </div>
    {loading ? <p className="calendar-message">Cargando semana…</p> : sessions.length === 0 ? <p className="calendar-message">No hay sesiones asignadas en esta semana.</p> : <div className="compliance-list">
      {sessions.map((session) => {
        const overdue = session.status === "pending" && session.date < today;
        const state = statusCopy[session.status];
        const Icon = overdue ? WarningCircle : state.icon;
        return <article key={`${session.athleteId}-${session.coachId}-${session.date}`} className={`compliance-row ${overdue ? "overdue" : session.status}`}>
          <time dateTime={session.date}>{shortDate(session.date)}</time>
          <div><strong>{athleteNames.get(session.athleteId) ?? "Atleta"}</strong><small>{session.title ?? "Sesión planificada"}</small></div>
          <span><Icon weight="fill" />{overdue ? "Vencida" : state.label}</span>
          {session.status === "completed" && session.result?.rpe && <b>RPE {session.result.rpe}</b>}
        </article>;
      })}
    </div>}
  </section>;
}
