import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { Athlete, ComplianceSummary, TrainingSession } from "../types";

const weekdayLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const statusLabels = { pending: "Pendiente", in_progress: "En curso", completed: "Completada", skipped: "Omitida" };

function monthTitle(value: string) {
  const text = new Intl.DateTimeFormat("es-UY", { month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function CoachMonthlyCalendar({ from, sessions, athletes, summary, loading, onPrevious, onNext }: {
  from: string;
  sessions: TrainingSession[];
  athletes: Athlete[];
  summary: ComplianceSummary;
  loading: boolean;
  onPrevious(): void;
  onNext(): void;
}) {
  const [selectedDate, setSelectedDate] = useState(from);
  useEffect(() => setSelectedDate(from), [from]);
  const athleteNames = useMemo(() => new Map(athletes.map((athlete) => [athlete.id, athlete.name])), [athletes]);
  const daysInMonth = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0)).getUTCDate();
  const leadingDays = (new Date(`${from}T12:00:00Z`).getUTCDay() || 7) - 1;
  const sessionsByDate = useMemo(() => {
    const result = new Map<string, TrainingSession[]>();
    for (const session of sessions) result.set(session.date, [...(result.get(session.date) ?? []), session]);
    return result;
  }, [sessions]);
  const selectedSessions = sessionsByDate.get(selectedDate) ?? [];

  return <section className="monthly-calendar-panel">
    <div className="week-heading"><button aria-label="Mes anterior" onClick={onPrevious}><CaretLeft weight="bold" /></button><div><span className="eyebrow">Calendario mensual</span><h2>{monthTitle(from)}</h2></div><button aria-label="Mes siguiente" onClick={onNext}><CaretRight weight="bold" /></button></div>
    {sessions.length > 0 && <div className="compliance-summary"><span><strong>{summary.completed}</strong><small>Completadas</small></span><span><strong>{summary.inProgress}</strong><small>En curso</small></span><span><strong>{summary.pending}</strong><small>Pendientes</small></span><span className={summary.overdue ? "alert" : ""}><strong>{summary.overdue}</strong><small>Vencidas</small></span><span><strong>{summary.skipped}</strong><small>Omitidas</small></span></div>}
    {loading ? <p className="calendar-message">Cargando mes…</p> : <><div className="month-weekdays">{weekdayLabels.map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{Array.from({ length: leadingDays }, (_, index) => <span key={`empty-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => { const date = `${from.slice(0, 8)}${String(index + 1).padStart(2, "0")}`; const daySessions = sessionsByDate.get(date) ?? []; const counts = { completed: 0, in_progress: 0, pending: 0, skipped: 0 }; daySessions.forEach((session) => { counts[session.status] += 1; }); return <button key={date} className={selectedDate === date ? "selected" : ""} aria-label={`${date}: ${daySessions.length} sesiones`} onClick={() => setSelectedDate(date)}><strong>{index + 1}</strong>{daySessions.length > 0 && <small>{daySessions.length}</small>}<span className="month-statuses">{Object.entries(counts).filter(([, count]) => count > 0).map(([status, count]) => <i key={status} className={status} title={`${statusLabels[status as keyof typeof statusLabels]}: ${count}`} />)}</span></button>; })}</div>
      <div className="month-day-detail"><h3>{new Intl.DateTimeFormat("es-UY", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${selectedDate}T12:00:00Z`))}</h3>{selectedSessions.length ? selectedSessions.map((session) => <article key={`${session.athleteId}-${session.date}`}><div><strong>{athleteNames.get(session.athleteId) ?? "Atleta"}</strong><small>{session.title ?? "Sesión planificada"}</small></div><span className={session.status}>{statusLabels[session.status]}{session.result?.rpe ? ` · RPE ${session.result.rpe}` : ""}</span></article>) : <p>No hay sesiones asignadas este día.</p>}</div>
    </>}
  </section>;
}
