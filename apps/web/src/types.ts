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

export interface AthleteGroupSummary {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
}

export interface AthleteGroup extends AthleteGroupSummary {
  athletes: Athlete[];
}

export interface TrainingProgramDay {
  dayOffset: number;
  title: string;
  content: string;
  sourcePlanningId: string;
  sourcePlanningDate: string;
}

export interface TrainingProgramSummary {
  id: string;
  name: string;
  weeks: number;
  dayCount: number;
  updatedAt: string;
}

export interface TrainingProgram extends TrainingProgramSummary {
  days: TrainingProgramDay[];
}

export interface TrainingProgramPage {
  items: TrainingProgramSummary[];
  nextCursor?: string;
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

export interface ComplianceSummary {
  total: number;
  completed: number;
  inProgress: number;
  skipped: number;
  pending: number;
  overdue: number;
}

export interface CoachCalendarPage {
  items: TrainingSession[];
  summary: ComplianceSummary;
  nextCursor?: string;
}

export interface CoachSessionSummary {
  id: string;
  title?: string;
  date: string;
  summary: string;
  version: number;
  updatedAt: string;
}

export interface CoachSession extends CoachSessionSummary {
  content: string;
}

export interface CoachSessionPage {
  items: CoachSessionSummary[];
  nextCursor?: string;
}
