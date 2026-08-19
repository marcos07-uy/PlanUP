import type { Athlete, Coach, CoachInvitation, CoachSession, TrainingSession, UserProfile } from "./types";

export const demoProfile: UserProfile = {
  id: "coach-demo",
  name: "Marcos",
  email: "coach@planup.app",
  role: "coach",
};

export const demoAthleteProfile: UserProfile = {
  id: "athlete-1",
  name: "Sofia Rodriguez",
  email: "sofia@example.com",
  role: "athlete",
};

export const demoCoaches: Coach[] = [
  { id: "coach-demo", name: "Marcos", email: "coach@planup.app" },
  { id: "coach-2", name: "Ana", email: "ana@planup.app" },
];

export const demoCoachInvitations: CoachInvitation[] = [
  { coach: { id: "coach-3", name: "Diego", email: "diego@planup.app" }, createdAt: new Date().toISOString() },
];

export const demoAthletes: Athlete[] = [
  { id: "athlete-1", name: "Sofia Rodriguez", email: "sofia@example.com" },
  { id: "athlete-2", name: "Martin Silva", email: "martin@example.com" },
];

const today = new Date();
const iso = (offset: number) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

export const demoSessions: TrainingSession[] = [
  {
    athleteId: "athlete-1",
    coachId: "coach-demo",
    date: iso(0),
    content: "==warmup\n3 rondas:\n• 10 air squats\n• 8 push-ups\n• 200 m remo\n\n==fuerza\nBack squat 5 × 5 al 75%\nDescanso: 2 minutos\n\n==wod\n12 min AMRAP\n8 thrusters (35/25 kg)\n10 pull-ups\n12 box jumps",
    updatedAt: new Date().toISOString(),
  },
  {
    athleteId: "athlete-1",
    coachId: "coach-demo",
    date: iso(2),
    content: "==tecnica\n15 minutos de progresiones de handstand.\n\n==condicionamiento\n5 rondas por tiempo:\n400 m carrera\n15 kettlebell swings",
    updatedAt: new Date().toISOString(),
  },
  {
    athleteId: "athlete-1",
    coachId: "coach-2",
    date: iso(0),
    content: "==movilidad\nTrabajo de cadera y tobillo.\n\n==técnica\nProgresiones de carrera.",
    updatedAt: new Date().toISOString(),
  },
];

export const demoCoachSessions: CoachSession[] = [
  {
    id: "coach-session-1",
    title: "Fuerza y AMRAP",
    date: iso(0),
    content: "==warmup\n3 rondas:\n• 10 air squats\n• 8 push-ups\n• 200 m remo\n\n==fuerza\nBack squat 5 × 5 al 75%\nDescanso: 2 minutos\n\n==wod\n12 min AMRAP\n8 thrusters (35/25 kg)\n10 pull-ups\n12 box jumps",
    updatedAt: new Date().toISOString(),
  },
];
