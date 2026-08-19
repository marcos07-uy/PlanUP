import type { Athlete, CoachSession, TrainingSession, UserProfile } from "./types";

export const demoProfile: UserProfile = {
  id: "coach-demo",
  name: "Marcos",
  email: "coach@planup.app",
  role: "coach",
};

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
    date: iso(0),
    content: "==warmup\n3 rondas:\n• 10 air squats\n• 8 push-ups\n• 200 m remo\n\n==fuerza\nBack squat 5 × 5 al 75%\nDescanso: 2 minutos\n\n==wod\n12 min AMRAP\n8 thrusters (35/25 kg)\n10 pull-ups\n12 box jumps",
    updatedAt: new Date().toISOString(),
  },
  {
    athleteId: "athlete-1",
    date: iso(2),
    content: "==tecnica\n15 minutos de progresiones de handstand.\n\n==condicionamiento\n5 rondas por tiempo:\n400 m carrera\n15 kettlebell swings",
    updatedAt: new Date().toISOString(),
  },
];

export const demoCoachSessions: CoachSession[] = [
  {
    id: "coach-session-1",
    date: iso(0),
    content: "==warmup\n3 rondas:\n• 10 air squats\n• 8 push-ups\n• 200 m remo\n\n==fuerza\nBack squat 5 × 5 al 75%\nDescanso: 2 minutos\n\n==wod\n12 min AMRAP\n8 thrusters (35/25 kg)\n10 pull-ups\n12 box jumps",
    updatedAt: new Date().toISOString(),
  },
];
