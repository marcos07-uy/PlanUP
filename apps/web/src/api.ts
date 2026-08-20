import type { Athlete, AthleteGroup, AthleteGroupSummary, Coach, CoachCalendarPage, CoachInvitation, CoachSession, CoachSessionPage, CoachSessionSummary, SessionResult, TrainingSession, UserProfile } from "./types";

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
  coachSessions: (token: string, cursor?: string, query = "") =>
    request<CoachSessionPage>(`/coach-sessions?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}${query ? `&query=${encodeURIComponent(query)}` : ""}`, token),
  coachSession: (token: string, session: CoachSessionSummary) =>
    request<CoachSession>(`/coach-sessions/${session.date}/${session.id}`, token),
  createCoachSession: (token: string, date: string, title: string, content: string) =>
    request<CoachSession>("/coach-sessions", token, { method: "POST", body: JSON.stringify({ date, title, content }) }),
  updateCoachSession: (token: string, session: CoachSession, title: string, content: string) =>
    request<CoachSession>(`/coach-sessions/${session.date}/${session.id}`, token, { method: "PUT", body: JSON.stringify({ title, content, expectedVersion: session.version }) }),
  duplicateCoachSession: (token: string, session: CoachSession, operationId: string, date: string) =>
    request<CoachSession>(`/coach-sessions/${session.date}/${session.id}/duplicate`, token, { method: "POST", body: JSON.stringify({ operationId, date }) }),
  assignCoachSession: (token: string, session: CoachSessionSummary, date: string, athleteIds: string[], groupIds: string[] = [], replacePending = false) =>
    request<{ assigned: number; skipped: number; conflicts: { athleteId: string; reason: string }[] }>(`/coach-sessions/${session.date}/${session.id}/assign`, token, {
      method: "POST",
      body: JSON.stringify({ date, athleteIds, groupIds, replacePending }),
    }),
  sessions: (token: string, athleteId: string, coachId: string, from: string, to: string) =>
    request<TrainingSession[]>(`/athletes/${athleteId}/sessions?coachId=${encodeURIComponent(coachId)}&from=${from}&to=${to}`, token),
  updateSessionExecution: (token: string, coachId: string, date: string, status: "in_progress" | "completed" | "skipped", expectedVersion: number, clientMutationId: string, result?: SessionResult) =>
    request<TrainingSession>(`/me/sessions/${encodeURIComponent(coachId)}/${date}/execution`, token, {
      method: "PUT",
      body: JSON.stringify({ status, result, expectedVersion, clientMutationId }),
    }),
  coachCalendar: (token: string, from: string, to: string, cursor?: string) =>
    request<CoachCalendarPage>(`/coach/calendar?from=${from}&to=${to}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, token),
  duplicateWeek: (token: string, sourceFrom: string, targetFrom: string, operationId: string) =>
    request<{ created: number; unchanged: number; skipped: number; conflicts: { athleteId: string; date: string; reason: string }[] }>("/coach/calendar/duplicate", token, {
      method: "POST",
      body: JSON.stringify({ sourceFrom, targetFrom, operationId }),
    }),
  groups: (token: string) => request<AthleteGroupSummary[]>("/groups", token),
  group: (token: string, groupId: string) => request<AthleteGroup>(`/groups/${groupId}`, token),
  createGroup: (token: string, name: string) => request<AthleteGroup>("/groups", token, { method: "POST", body: JSON.stringify({ name }) }),
  addGroupAthlete: (token: string, groupId: string, athleteId: string) => request<Athlete>(`/groups/${groupId}/athletes/${athleteId}`, token, { method: "PUT" }),
  removeGroupAthlete: (token: string, groupId: string, athleteId: string) => request<void>(`/groups/${groupId}/athletes/${athleteId}`, token, { method: "DELETE" }),
  deleteGroup: (token: string, groupId: string) => request<void>(`/groups/${groupId}`, token, { method: "DELETE" }),
};
