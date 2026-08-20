import { Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import type { Athlete, AthleteGroup, AthleteGroupSummary } from "../types";

export function GroupManager({ groups, selected, athletes, onCreate, onSelect, onToggle, onDelete }: {
  groups: AthleteGroupSummary[];
  selected: AthleteGroup | null;
  athletes: Athlete[];
  onCreate(name: string): Promise<void>;
  onSelect(group: AthleteGroupSummary): void;
  onToggle(athlete: Athlete, selected: boolean): Promise<void>;
  onDelete(): Promise<void>;
}) {
  const [name, setName] = useState("");
  return <section className="group-panel">
    <div className="coach-session-title"><div><span className="eyebrow">Organización</span><h2>Grupos de atletas</h2></div></div>
    <div className="group-create"><input aria-label="Nombre del grupo" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej.: CrossFit avanzados" /><button className="primary compact" disabled={!name.trim()} onClick={async () => { await onCreate(name.trim()); setName(""); }}><Plus /> Crear</button></div>
    <div className="group-layout">
      <div className="group-list">{groups.map((group) => <button key={group.id} className={selected?.id === group.id ? "selected" : ""} onClick={() => onSelect(group)}><strong>{group.name}</strong></button>)}{!groups.length && <p>Todavía no creaste grupos.</p>}</div>
      {selected && <div className="group-detail"><div><h3>{selected.name}</h3><button aria-label="Eliminar grupo" onClick={onDelete}><Trash /></button></div><p>Un atleta puede pertenecer a varios grupos.</p><div className="assign-list">{athletes.map((athlete) => { const checked = selected.athletes.some((item) => item.id === athlete.id); return <label key={athlete.id}><input type="checkbox" checked={checked} onChange={() => onToggle(athlete, !checked)} />{athlete.name}</label>; })}</div></div>}
    </div>
  </section>;
}
