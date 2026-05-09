// Types matching Story 1.1 schema

export interface Session {
  id: string;
  user: string;
  project: string | null;
  branch: string | null;
  cwd: string | null;
  started_at: number; // epoch ms
  ended_at: number | null; // epoch ms
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tool_calls: number;
  status: "active" | "completed" | "crashed";
  jsonl_path: string | null;
  source: string;
  // Aggregated counts returned by API
  mistake_count?: number;
  event_count?: number;
}

export interface Event {
  id: number;
  session_id: string;
  ts: number; // epoch ms
  type: "user_msg" | "assistant_msg" | "tool_use" | "tool_result";
  tool_name: string | null;
  summary: string | null;
  duration_ms: number | null;
  success: 1 | 0 | null;
  jsonl_offset: number | null;
}

export interface Mistake {
  id: number;
  session_id: string;
  event_id: number | null;
  pattern: string;
  severity: "low" | "medium" | "high";
  details_json: string | null;
  ledger_entry_id: string | null;
  reviewed: 0 | 1;
  detected_at: number; // epoch ms
  // Joined fields from API
  session?: Pick<Session, "project" | "branch" | "started_at">;
}

export interface SkillCandidate {
  id: number;
  signature: string;
  name: string | null;
  description: string | null;
  tool_sequence_json: string; // JSON array of tool names
  frequency: number;
  example_session_ids_json: string | null; // JSON array of session ids
  first_seen: number; // epoch ms
  last_seen: number; // epoch ms
  promoted_at: number | null; // epoch ms
}

export interface SessionDetail extends Session {
  events: Event[];
  mistakes: Mistake[];
}

export interface PromoteMistakeResponse {
  ledger_entry_id: string;
}

export interface PromoteSkillResponse {
  id: number;
  promoted_at: number;
  name: string;
  description: string;
}
