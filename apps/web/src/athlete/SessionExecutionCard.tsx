import { useState } from "react";
import { CheckCircle, Flag, Play, Plus, Trash } from "@phosphor-icons/react";
import type { SessionMetric, SessionResult, TrainingSession } from "../types";

type EditableMetric = {
  id: string;
  type: SessionMetric["type"];
  label: string;
  value: string;
  unit: string;
  note: string;
};

const metricLabels: Record<SessionMetric["type"], string> = {
  weight: "Peso",
  reps: "Repeticiones",
  time: "Tiempo",
  distance: "Distancia",
  note: "Nota",
};

function emptyMetric(): EditableMetric {
  return { id: crypto.randomUUID(), type: "weight", label: "", value: "", unit: "kg", note: "" };
}

function toEditable(metric: SessionMetric): EditableMetric {
  return {
    id: metric.id,
    type: metric.type,
    label: metric.label,
    value: metric.type === "note" ? "" : String(metric.value),
    unit: "unit" in metric ? metric.unit : "",
    note: metric.type === "note" ? metric.note : "",
  };
}

function parseMetric(metric: EditableMetric): SessionMetric | null {
  const label = metric.label.trim();
  if (!label) return null;
  if (metric.type === "note") return metric.note.trim() ? { id: metric.id, type: "note", label, note: metric.note.trim() } : null;
  const value = Number(metric.value);
  if (!Number.isFinite(value) || value < 0) return null;
  if (metric.type === "weight") return { id: metric.id, type: "weight", label, value, unit: metric.unit === "lb" ? "lb" : "kg" };
  if (metric.type === "time") return { id: metric.id, type: "time", label, value, unit: "seconds" };
  if (metric.type === "distance") return { id: metric.id, type: "distance", label, value, unit: metric.unit === "km" ? "km" : "m" };
  return Number.isInteger(value) ? { id: metric.id, type: "reps", label, value } : null;
}

export function SessionExecutionCard({ session, onUpdate }: {
  session: TrainingSession;
  onUpdate(status: "in_progress" | "completed" | "skipped", result?: SessionResult): Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [metrics, setMetrics] = useState<EditableMetric[]>(() => session.result?.metrics.map(toEditable) ?? []);
  const [rpe, setRpe] = useState(session.result?.rpe ? String(session.result.rpe) : "");
  const [comment, setComment] = useState(session.result?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function update(status: "in_progress" | "completed" | "skipped", result?: SessionResult) {
    setSaving(true);
    setError("");
    try {
      await onUpdate(status, result);
      if (status === "completed") setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos guardar el progreso");
    } finally {
      setSaving(false);
    }
  }

  async function complete() {
    const parsed = metrics.map(parseMetric);
    if (parsed.some((metric) => metric === null)) {
      setError("Completá la etiqueta y el valor de cada resultado, o eliminá la fila vacía.");
      return;
    }
    await update("completed", {
      metrics: parsed as SessionMetric[],
      rpe: rpe ? Number(rpe) : undefined,
      comment: comment.trim() || undefined,
    });
  }

  function changeMetric(id: string, changes: Partial<EditableMetric>) {
    setMetrics((items) => items.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...changes };
      if (changes.type === "weight") next.unit = "kg";
      if (changes.type === "distance") next.unit = "m";
      if (changes.type === "time") next.unit = "seconds";
      return next;
    }));
  }

  return <section className={`execution-card status-${session.status}`} aria-label="Seguimiento de la sesión">
    <div className="execution-heading">
      <div><span className="eyebrow">Tu progreso</span><strong>{session.status === "pending" ? "Pendiente" : session.status === "in_progress" ? "En curso" : session.status === "completed" ? "Completada" : "Omitida"}</strong></div>
      {session.status === "completed" && !editing && <button className="text-button" onClick={() => setEditing(true)}>Corregir resultado</button>}
    </div>

    {session.status === "pending" && <div className="execution-actions">
      <button className="primary" disabled={saving} onClick={() => update("in_progress")}><Play weight="fill" /> Iniciar sesión</button>
      <button className="secondary" disabled={saving} onClick={() => update("skipped")}><Flag /> Omitir</button>
    </div>}

    {session.status === "in_progress" && !editing && <div className="execution-actions">
      <button className="primary" onClick={() => setEditing(true)}><CheckCircle weight="fill" /> Completar sesión</button>
      <button className="secondary" disabled={saving} onClick={() => update("skipped")}><Flag /> Omitir</button>
    </div>}

    {session.status === "skipped" && <div className="execution-actions">
      <button className="primary" disabled={saving} onClick={() => update("in_progress")}><Play weight="fill" /> Entrenar igualmente</button>
    </div>}

    {session.status === "completed" && !editing && session.result && <div className="saved-result">
      {session.result.rpe && <span><small>RPE</small><strong>{session.result.rpe}/10</strong></span>}
      {session.result.metrics.map((metric) => <span key={metric.id}><small>{metric.label}</small><strong>{metric.type === "note" ? metric.note : `${metric.value}${"unit" in metric ? ` ${metric.unit}` : " reps"}`}</strong></span>)}
      {session.result.comment && <p>{session.result.comment}</p>}
    </div>}

    {editing && <div className="result-form">
      <div className="result-intro"><strong>Resultados opcionales</strong><small>Podés completar la sesión sin agregar métricas.</small></div>
      {metrics.map((metric) => <div className="metric-row" key={metric.id}>
        <select aria-label="Tipo de resultado" value={metric.type} onChange={(event) => changeMetric(metric.id, { type: event.target.value as SessionMetric["type"] })}>
          {Object.entries(metricLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input aria-label="Nombre del resultado" placeholder="Ej.: Front squat" maxLength={80} value={metric.label} onChange={(event) => changeMetric(metric.id, { label: event.target.value })} />
        {metric.type === "note"
          ? <input aria-label="Nota del resultado" placeholder="Resultado" maxLength={500} value={metric.note} onChange={(event) => changeMetric(metric.id, { note: event.target.value })} />
          : <div className="metric-value"><input aria-label="Valor del resultado" type="number" min="0" step={metric.type === "reps" ? "1" : "any"} value={metric.value} onChange={(event) => changeMetric(metric.id, { value: event.target.value })} />
            {(metric.type === "weight" || metric.type === "distance") && <select aria-label="Unidad del resultado" value={metric.unit} onChange={(event) => changeMetric(metric.id, { unit: event.target.value })}>{metric.type === "weight" ? <><option>kg</option><option>lb</option></> : <><option>m</option><option>km</option></>}</select>}
            {metric.type === "time" && <span>seg</span>}
          </div>}
        <button className="remove-metric" aria-label="Eliminar resultado" onClick={() => setMetrics((items) => items.filter((item) => item.id !== metric.id))}><Trash /></button>
      </div>)}
      {metrics.length < 5 && <button className="secondary add-metric" onClick={() => setMetrics((items) => [...items, emptyMetric()])}><Plus /> Agregar resultado</button>}
      <label>RPE — dificultad percibida
        <select aria-label="RPE" value={rpe} onChange={(event) => setRpe(event.target.value)}><option value="">Sin indicar</option>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}/10</option>)}</select>
      </label>
      <label>Comentario final
        <textarea aria-label="Comentario final" maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="¿Cómo te sentiste?" />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="execution-actions"><button className="primary" disabled={saving} onClick={complete}>{saving ? "Guardando…" : "Guardar como completada"}</button>{session.status === "completed" && <button className="secondary" onClick={() => setEditing(false)}>Cancelar</button>}</div>
    </div>}
    {!editing && error && <p className="error">{error}</p>}
  </section>;
}
