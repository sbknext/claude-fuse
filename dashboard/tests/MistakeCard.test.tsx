import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MistakeCard } from "@/components/MistakeCard";
import type { Mistake } from "@/lib/types";

// Mock the api-client so promote calls don't hit network
vi.mock("@/lib/api-client", () => ({
  promoteMistake: vi.fn(),
}));

const baseMistake: Mistake = {
  id: 1,
  session_id: "abc123def456",
  event_id: 10,
  pattern: "failed_bash_retry",
  severity: "medium",
  details_json: JSON.stringify({ message: "Bash failed and retried within 60s" }),
  ledger_entry_id: null,
  reviewed: 0,
  detected_at: Date.now() - 300_000, // 5 min ago
  session: { project: "brain", branch: "master", started_at: Date.now() - 600_000 },
};

describe("MistakeCard", () => {
  it("renders pattern name", () => {
    render(<MistakeCard mistake={baseMistake} />);
    expect(screen.getByText("failed_bash_retry")).toBeTruthy();
  });

  it("renders severity badge", () => {
    render(<MistakeCard mistake={baseMistake} />);
    expect(screen.getByText("MEDIUM")).toBeTruthy();
  });

  it("renders promote button when not already promoted", () => {
    render(<MistakeCard mistake={baseMistake} />);
    expect(
      screen.getByRole("button", { name: /promote to mistakes_ledger/i })
    ).toBeTruthy();
  });

  it("shows already-promoted state when ledger_entry_id is set", () => {
    const promoted: Mistake = { ...baseMistake, ledger_entry_id: "M42" };
    render(<MistakeCard mistake={promoted} />);
    // Should show M42 and no promote button
    expect(screen.getByText("M42")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /promote to mistakes_ledger/i })
    ).toBeNull();
  });

  it("renders high severity with red styling", () => {
    const high: Mistake = { ...baseMistake, severity: "high", pattern: "user_halt" };
    render(<MistakeCard mistake={high} />);
    expect(screen.getByText("HIGH")).toBeTruthy();
    expect(screen.getByText("user_halt")).toBeTruthy();
  });

  it("renders session link", () => {
    render(<MistakeCard mistake={baseMistake} />);
    const link = screen.getByRole("link", { name: /session:abc123de/i });
    expect(link).toBeTruthy();
  });

  it("renders details preview from details_json", () => {
    render(<MistakeCard mistake={baseMistake} />);
    expect(screen.getByText(/Bash failed and retried/i)).toBeTruthy();
  });
});
