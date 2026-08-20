import { Plus, Trash } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type { Athlete, AthleteGroupSummary, CoachSessionSummary, TrainingProgram, TrainingProgramDay, TrainingProgramSummary } from "../types";

const weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function dayLabel(offset: number) {
  return `Semana ${Math.floor(offset / 7) + 1}, ${weekdays[offset % 7]}`;
}

type DraftDay = Pick<TrainingProgramDay, "dayOffset" | "sourcePlanningId" | "sourcePlanningDate"> & { title: string };

export function ProgramManager({ programs, selected, plannings, athletes, groups, hasMore, onCreate, onSelect, onDelete, onAssign, onLoadMore }: {
  programs: TrainingProgramSummary[];
  selected: TrainingProgram | null;
  plannings: CoachSessionSummary[];
  athletes: Athlete[];
  groups: AthleteGroupSummary[];
  hasMore: boolean;
  onCreate(name: string, weeks: number, days: DraftDay[]): Promise<void>;
  onSelect(program: TrainingProgramSummary): void;
  onDelete(): Promise<void>;
  onAssign(startDate: string, athleteIds: string[], groupIds: string[]): Promise<void>;
  onLoadMore(): Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [week, setWeek] = useState(1);
  const [weekday, setWeekday] = useState(0);
  const [planningKey, setPlanningKey] = useState("");
  const [days, setDays] = useState<DraftDay[]>([]);
  const [startDate, setStartDate] = useState("");
  const [athleteIds, setAthleteIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const chosenPlanning = useMemo(() => plannings.find((item) => `${item.date}#${item.id}` === planningKey), [planningKey, plannings]);
  const startIsMonday = !startDate || new Date(`${startDate}T12:00:00Z`).getUTCDay() === 1;

  function addDay() {
    if (!chosenPlanning) return;
    const dayOffset = (week - 1) * 7 + weekday;
    const next = { dayOffset, sourcePlanningId: chosenPlanning.id, sourcePlanningDate: chosenPlanning.date, title: chosenPlanning.title ?? "Planificación" };
    setDays((items) => [...items.filter((item) => item.dayOffset !== dayOffset), next].sort((a, b) => a.dayOffset - b.dayOffset));
  }

  async function create() {
    if (!name.trim() || !days.length) return;
    await onCreate(name.trim(), weeks, days);
    setName(""); setDays([]); setCreating(false);
  }

  return <section className="program-panel">
    <div className="coach-session-title"><div><span className="eyebrow">Trabajo reutilizable</span><h2>Programas</h2></div><button className="secondary compact" onClick={() => setCreating((value) => !value)}>{creating ? "Cerrar" : "Nuevo programa"}</button></div>
    {creating && <div className="program-builder">
      <div className="program-basics"><input aria-label="Nombre del programa" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej.: Base de fuerza 4 semanas" /><label>Duración<select aria-label="Duración del programa" value={weeks} onChange={(event) => { const value = Number(event.target.value); setWeeks(value); setWeek((current) => Math.min(current, value)); setDays((items) => items.filter((item) => item.dayOffset < value * 7)); }}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} semana{index ? "s" : ""}</option>)}</select></label></div>
      <div className="program-day-editor"><select aria-label="Semana del día" value={week} onChange={(event) => setWeek(Number(event.target.value))}>{Array.from({ length: weeks }, (_, index) => <option key={index + 1} value={index + 1}>Semana {index + 1}</option>)}</select><select aria-label="Día de la semana" value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>{weekdays.map((label, index) => <option key={label} value={index}>{label}</option>)}</select><select aria-label="Planificación del programa" value={planningKey} onChange={(event) => setPlanningKey(event.target.value)}><option value="">Elegí una planificación</option>{plannings.map((planning) => <option key={`${planning.date}#${planning.id}`} value={`${planning.date}#${planning.id}`}>{planning.title}</option>)}</select><button className="secondary compact" disabled={!chosenPlanning} onClick={addDay}><Plus />Agregar día</button></div>
      <div className="program-days">{days.map((day) => <div key={day.dayOffset}><span>{dayLabel(day.dayOffset)}</span><strong>{day.title}</strong><button aria-label={`Quitar ${dayLabel(day.dayOffset)}`} onClick={() => setDays((items) => items.filter((item) => item.dayOffset !== day.dayOffset))}><Trash /></button></div>)}{!days.length && <p>Agregá al menos un día usando una planificación existente.</p>}</div>
      <button className="primary compact" disabled={!name.trim() || !days.length} onClick={create}>Guardar programa</button>
    </div>}
    <div className="program-layout">
      <div className="group-list">{programs.map((program) => <button key={program.id} className={selected?.id === program.id ? "selected" : ""} onClick={() => onSelect(program)}><strong>{program.name}</strong><small>{program.weeks} semanas · {program.dayCount} sesiones</small></button>)}{!programs.length && <p>Todavía no creaste programas.</p>}{hasMore && <button className="secondary compact" onClick={onLoadMore}>Cargar más programas</button>}</div>
      {selected && <div className="program-detail"><div className="program-detail-heading"><div><h3>{selected.name}</h3><p>{selected.weeks} semanas · {selected.dayCount} sesiones por atleta</p></div><button aria-label="Eliminar programa" onClick={onDelete}><Trash /></button></div><div className="program-days">{selected.days.map((day) => <div key={day.dayOffset}><span>{dayLabel(day.dayOffset)}</span><strong>{day.title}</strong></div>)}</div>
        <div className="program-assignment"><label>Inicio (lunes)<input aria-label="Inicio del programa" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>{!startIsMonday && <small>Elegí un lunes.</small>}{groups.length > 0 && <><strong>Grupos</strong><div className="assign-list">{groups.map((group) => <label key={group.id}><input type="checkbox" checked={groupIds.includes(group.id)} onChange={() => setGroupIds((items) => items.includes(group.id) ? items.filter((id) => id !== group.id) : [...items, group.id])} />{group.name}</label>)}</div></>}<div className="assign-heading"><strong>Atletas</strong><button className="text-button" onClick={() => setAthleteIds(athleteIds.length === athletes.length ? [] : athletes.map((athlete) => athlete.id))}>{athleteIds.length === athletes.length ? "Limpiar" : "Seleccionar todos"}</button></div><div className="assign-list">{athletes.map((athlete) => <label key={athlete.id}><input type="checkbox" checked={athleteIds.includes(athlete.id)} onChange={() => setAthleteIds((items) => items.includes(athlete.id) ? items.filter((id) => id !== athlete.id) : [...items, athlete.id])} />{athlete.name}</label>)}</div><button className="primary compact" disabled={!startDate || !startIsMonday || (!athleteIds.length && !groupIds.length)} onClick={async () => { await onAssign(startDate, athleteIds, groupIds); setAthleteIds([]); setGroupIds([]); }}>Asignar programa</button></div>
      </div>}
    </div>
  </section>;
}
