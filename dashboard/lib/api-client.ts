import type {
  Session,
  SessionDetail,
  Mistake,
  SkillCandidate,
  PromoteMistakeResponse,
  PromoteSkillResponse,
  AlertLogEntry,
  SkillStubResponse,
  SkillStubEntry,
  TokenAnalyticsResponse,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_CLAUDE_FUSE_API_URL || "http://localhost:5457";

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      // Don't cache — always fresh data
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`API error ${res.status} for ${path}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    // API offline — graceful degradation
    console.warn(`API unavailable (${path}):`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

// Sessions

export interface GetSessionsParams {
  page?: number;
  per_page?: number;
  project?: string;
  status?: "active" | "completed" | "crashed" | "";
  q?: string;
  /** Legacy: if set, bypasses pagination and returns raw list */
  limit?: number;
}

export interface SessionsPage {
  sessions: Session[];
  count: number;
  page: number;
  per_page: number;
}

export async function getSessions(
  limitOrParams: number | GetSessionsParams = 50,
  project?: string
): Promise<Session[]> {
  // Backward-compat: old callers pass (limit, project?)
  const qs = new URLSearchParams();
  if (typeof limitOrParams === "number") {
    qs.set("limit", String(limitOrParams));
    if (project) qs.set("project", project);
  } else {
    const p = limitOrParams;
    if (p.limit !== undefined) qs.set("limit", String(p.limit));
    if (p.page !== undefined) qs.set("page", String(p.page));
    if (p.per_page !== undefined) qs.set("per_page", String(p.per_page));
    if (p.project) qs.set("project", p.project);
    if (p.status) qs.set("status", p.status);
    if (p.q) qs.set("q", p.q);
  }
  const result = await apiFetch<SessionsPage>(`/sessions?${qs}`);
  return result?.sessions ?? [];
}

export async function getSessionsPage(
  params: GetSessionsParams = {}
): Promise<SessionsPage> {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.per_page !== undefined) qs.set("per_page", String(params.per_page));
  if (params.project) qs.set("project", params.project);
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  const result = await apiFetch<SessionsPage>(`/sessions?${qs}`);
  return result ?? { sessions: [], count: 0, page: 1, per_page: 20 };
}

export async function getSession(id: string): Promise<SessionDetail | null> {
  const result = await apiFetch<{ session: Session; events: SessionDetail["events"]; mistakes: SessionDetail["mistakes"] }>(
    `/sessions/${id}`
  );
  if (!result?.session) return null;
  return { ...result.session, events: result.events ?? [], mistakes: result.mistakes ?? [] };
}

// Mistakes

export interface GetMistakesParams {
  reviewed?: "0" | "1" | "";
  severity?: "low" | "medium" | "high" | "";
  pattern?: string;
  session_id?: string;
  page?: number;
  per_page?: number;
  /** Legacy: bypasses pagination */
  limit?: number;
}

export interface MistakesPage {
  mistakes: Mistake[];
  count: number;
  page: number;
  per_page: number;
}

export async function getMistakes(
  params: GetMistakesParams = {}
): Promise<Mistake[]> {
  const result = await getMistakesPage(params);
  return result.mistakes;
}

export async function getMistakesPage(
  params: GetMistakesParams = {}
): Promise<MistakesPage> {
  const qs = new URLSearchParams();
  if (params.reviewed !== undefined && params.reviewed !== "")
    qs.set("reviewed", params.reviewed);
  if (params.severity !== undefined && params.severity !== "")
    qs.set("severity", params.severity);
  if (params.pattern) qs.set("pattern", params.pattern);
  if (params.session_id) qs.set("session_id", params.session_id);
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.per_page !== undefined) qs.set("per_page", String(params.per_page));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const result = await apiFetch<MistakesPage>(`/mistakes?${qs}`);
  return result ?? { mistakes: [], count: 0, page: 1, per_page: 50 };
}

export async function promoteMistake(
  id: number
): Promise<PromoteMistakeResponse | null> {
  return apiFetch<PromoteMistakeResponse>(`/mistakes/${id}/promote`, {
    method: "POST",
  });
}

// Skills

export async function getSkills(limit = 50): Promise<SkillCandidate[]> {
  const result = await apiFetch<{ skills: SkillCandidate[]; count: number }>(
    `/skills?promoted=null&limit=${limit}`
  );
  return result?.skills ?? [];
}

export async function promoteSkill(
  id: number,
  name: string,
  description: string
): Promise<PromoteSkillResponse | null> {
  return apiFetch<PromoteSkillResponse>(`/skills/${id}/promote`, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

// Alerts

export async function getRecentAlerts(limit = 20): Promise<AlertLogEntry[]> {
  const result = await apiFetch<{ alerts: AlertLogEntry[]; count: number }>(
    `/alerts/recent?limit=${limit}`
  );
  return result?.alerts ?? [];
}

// Skill stubs

export async function generateSkillStub(
  id: number,
  withAi = false
): Promise<SkillStubResponse | null> {
  return apiFetch<SkillStubResponse>(
    `/skills/${id}/stub${withAi ? "?ai=true" : ""}`,
    { method: "POST" }
  );
}

export async function getSkillStubs(): Promise<SkillStubEntry[]> {
  const result = await apiFetch<{ stubs: SkillStubEntry[]; count: number }>(
    "/skills/stubs"
  );
  return result?.stubs ?? [];
}

// Token + cost analytics (Story 1.5.7)

export async function getTokenAnalytics(): Promise<TokenAnalyticsResponse | null> {
  return apiFetch<TokenAnalyticsResponse>("/analytics/tokens");
}
