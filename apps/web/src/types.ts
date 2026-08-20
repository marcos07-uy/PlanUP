export type Role = "coach" | "athlete";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Athlete {
  id: string;
  name: string;
  email: string;
}

export interface Coach {
  id: string;
  name: string;
  email: string;
}

export interface CoachInvitation {
  coach: Coach;
  createdAt: string;
}

export interface TrainingSession {
  athleteId: string;
  coachId: string;
  date: string;
  title?: string;
  content: string;
  contentFormat: "text-v1";
  status: "pending" | "in_progress" | "completed" | "skipped";
  result?: SessionResult;
  startedAt?: string;
  completedAt?: string;
  skippedAt?: string;
  executionUpdatedAt?: string;
  executionVersion: number;
  updatedAt: string;
}

export type SessionMetric =
  | { id: string; type: "weight"; label: string; value: number; unit: "kg" | "lb" }
  | { id: string; type: "reps"; label: string; value: number }
  | { id: string; type: "time"; label: string; value: number; unit: "seconds" }
  | { id: string; type: "distance"; label: string; value: number; unit: "m" | "km" }
  | { id: string; type: "note"; label: string; note: string };

export interface SessionResult {
  metrics: SessionMetric[];
  rpe?: number;
  comment?: string;
}

export interface CoachSessionSummary {
  id: string;
  title?: string;
  date: string;
  summary: string;
  updatedAt: string;
}

export interface CoachSession extends CoachSessionSummary {
  content: string;
}

export interface CoachSessionPage {
  items: CoachSessionSummary[];
  nextCursor?: string;
}
