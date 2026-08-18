import type { Athlete, TrainingSession, UserProfile } from "./types";

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
  addAthlete: (token: string, email: string) =>
    request<Athlete>("/athletes", token, { method: "POST", body: JSON.stringify({ email }) }),
  sessions: (token: string, athleteId: string, from: string, to: string) =>
    request<TrainingSession[]>(`/athletes/${athleteId}/sessions?from=${from}&to=${to}`, token),
  saveSession: (token: string, athleteId: string, date: string, content: string) =>
    request<TrainingSession>(`/athletes/${athleteId}/sessions/${date}`, token, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  deleteSession: (token: string, athleteId: string, date: string) =>
    request<void>(`/athletes/${athleteId}/sessions/${date}`, token, { method: "DELETE" }),
};

