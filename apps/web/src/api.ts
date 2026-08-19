import type { Athlete, Coach, CoachInvitation, CoachSession, CoachSessionPage, CoachSessionSummary, TrainingSession, UserProfile } from "./types";

const apiUrl = import.meta.env.VITE_API_URL;

async function request<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: "Ocurrio un error inesperado" }));
    throw new Error(payload.message ?? "Ocurrio un error inesperado");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  me: (token: string) => request<UserProfile>("/me", token),
  athletes: (token: string) => request<Athlete[]>("/athletes", token),
  inviteAthlete: (token: string, email: string) =>
    request<CoachInvitation>("/athletes", token, { method: "POST", body: JSON.stringify({ email }) }),
  coaches: (token: string) => request<Coach[]>("/coaches", token),
  coachInvitations: (token: string) => request<CoachInvitation[]>("/coach-invitations", token),
  answerCoachInvitation: (token: string, coachId: string, action: "accept" | "reject") =>
    request<Coach | void>(`/coach-invitations/${coachId}/${action}`, token, { method: "POST" }),
  coachSessions: (token: string, cursor?: string) =>
    request<CoachSessionPage>(`/coach-sessions?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, token),
  coachSession: (token: string, session: CoachSessionSummary) =>
    request<CoachSession>(`/coach-sessions/${session.date}/${session.id}`, token),
  createCoachSession: (token: string, date: string, title: string, content: string) =>
    request<CoachSession>("/coach-sessions", token, { method: "POST", body: JSON.stringify({ date, title, content }) }),
  assignCoachSession: (token: string, session: CoachSessionSummary, date: string, athleteIds: string[]) =>
    request<{ assigned: number }>(`/coach-sessions/${session.date}/${session.id}/assign`, token, {
      method: "POST",
      body: JSON.stringify({ date, athleteIds }),
    }),
  sessions: (token: string, athleteId: string, coachId: string, from: string, to: string) =>
    request<TrainingSession[]>(`/athletes/${athleteId}/sessions?coachId=${encodeURIComponent(coachId)}&from=${from}&to=${to}`, token),
  saveSession: (token: string, athleteId: string, date: string, content: string) =>
    request<TrainingSession>(`/athletes/${athleteId}/sessions/${date}`, token, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  deleteSession: (token: string, athleteId: string, date: string) =>
    request<void>(`/athletes/${athleteId}/sessions/${date}`, token, { method: "DELETE" }),
};
