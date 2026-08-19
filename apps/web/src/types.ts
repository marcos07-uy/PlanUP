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
  content: string;
  updatedAt: string;
}

export interface CoachSession {
  id: string;
  title?: string;
  date: string;
  content: string;
  updatedAt: string;
}
