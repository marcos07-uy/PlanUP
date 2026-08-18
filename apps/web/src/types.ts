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

export interface TrainingSession {
  athleteId: string;
  date: string;
  content: string;
  updatedAt: string;
}

