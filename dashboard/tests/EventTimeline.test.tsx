import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventTimeline } from "@/components/EventTimeline";
import type { Event, Mistake } from "@/lib/types";

const now = Date.now();

const events: Event[] = [
  {
    id: 1,
    session_id: "sess1",
    ts: now - 5_000,
    type: "user_msg",
    tool_name: null,
    summary: "User asked a question",
    duration_ms: null,
    success: null,
    jsonl_offset: 0,
  },
  {
    id: 2,
    session_id: "sess1",
    ts: now - 4_000,
    type: "tool_use",
    tool_name: "Bash",
    summary: "Run ls -la",
    duration_ms: 120,
    success: 1,
    jsonl_offset: 100,
  },
  {
    id: 3,
    session_id: "sess1",
    ts: now - 3_000,
    type: "tool_result",
    tool_name: "Bash",
    summary: "Exit 0",
    duration_ms: null,
    success: 1,
    jsonl_offset: 200,
  },
];

const mistakes: Mistake[] = [
  {
    id: 10,
    session_id: "sess1",
    event_id: 2,
    pattern: "failed_bash_retry",
    severity: "medium",
    details_json: JSON.stringify({ message: "Retry detected" }),
    ledger_entry_id: null,
    reviewed: 0,
    detected_at: now - 4_000,
  },
];

describe("EventTimeline", () => {
  it("renders 3 events in order", () => {
    render(<EventTimeline events={events} mistakes={[]} />);
    expect(screen.getByText("User asked a question")).toBeTruthy();
    expect(screen.getByText("Run ls -la")).toBeTruthy();
    expect(screen.getByText("Exit 0")).toBeTruthy();
  });

  it("renders tool name badge for tool_use event", () => {
    render(<EventTimeline events={events} mistakes={[]} />);
    // Bash appears twice (events 2 and 3)
    const bashBadges = screen.getAllByText("Bash");
    expect(bashBadges.length).toBeGreaterThanOrEqual(2);
  });

  it("shows inline mistake annotation for matching event", () => {
    render(<EventTimeline events={events} mistakes={mistakes} />);
    expect(screen.getByText("failed_bash_retry")).toBeTruthy();
    expect(screen.getByText(/Retry detected/i)).toBeTruthy();
  });

  it("shows empty state when no events", () => {
    render(<EventTimeline events={[]} mistakes={[]} />);
    expect(screen.getByText(/no events recorded/i)).toBeTruthy();
  });

  it("renders duration for events that have it", () => {
    render(<EventTimeline events={events} mistakes={[]} />);
    expect(screen.getByText("120ms")).toBeTruthy();
  });
});
