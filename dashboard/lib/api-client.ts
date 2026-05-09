import type {
  Session,
  SessionDetail,
  Mistake,
  SkillCandidate,
  PromoteMistakeResponse,
  PromoteSkillResponse,
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

export async function getSessions(
  limit = 50,
  project?: string
): Promise<Session[]> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (project) qs.set("project", project);
  const result = await apiFetch<{ sessions: Session[]; count: number }>(`/sessions?${qs}`);
  return result?.sessions ?? [];
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
  limit?: number;
}

export async function getMistakes(
  params: GetMistakesParams = {}
): Promise<Mistake[]> {
  const qs = new URLSearchParams();
  if (params.reviewed !== undefined && params.reviewed !== "")
    qs.set("reviewed", params.reviewed);
  if (params.severity !== undefined && params.severity !== "")
    qs.set("severity", params.severity);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const result = await apiFetch<{ mistakes: Mistake[]; count: number }>(`/mistakes?${qs}`);
  return result?.mistakes ?? [];
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
