/**
 * Cost tab — token + cost analytics (Story 1.5.7)
 *
 * Shows: weekly totals, daily bar chart (7 days, CSS-only), top-5 sessions by token count.
 * All cost figures carry "est." label — actual cost may differ due to caching and tier.
 */
import { getTokenAnalytics } from "@/lib/api-client";
import type { DailyTokenBreakdown, TopTokenSession } from "@/lib/types";

export const dynamic = "force-dynamic";

function fmtCost(v: number | null): string {
  if (v == null) return "unknown";
  return `$${v.toFixed(4)}`;
}

function fmtTokens(v: number | null): string {
  if (v == null) return "unknown";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(-12) : id;
}

// CSS-only bar chart — no chart library dep
function DailyBarChart({ daily }: { daily: DailyTokenBreakdown[] }) {
  if (!daily || daily.length === 0) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
        No daily data yet.
      </div>
    );
  }

  const maxTokens = Math.max(...daily.map((d) => d.input_tokens + d.output_tokens), 1);

  return (
    <div className="mt-2">
      <div className="flex items-end gap-2 h-28">
        {daily.map((day) => {
          const total = day.input_tokens + day.output_tokens;
          const heightPct = Math.round((total / maxTokens) * 100);
          return (
            <div
              key={day.date}
              className="flex-1 flex flex-col items-center gap-1 min-w-0"
              title={`${day.date}: ${fmtTokens(total)} tokens, est. ${fmtCost(day.estimated_cost)}`}
            >
              <div
                className="w-full bg-blue-500 dark:bg-blue-400 rounded-t transition-all"
                style={{ height: `${Math.max(heightPct, 2)}%` }}
              />
            </div>
          );
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex gap-2 mt-1">
        {daily.map((day) => {
          // Show only last 2 chars of date to save space (day number)
          const dayNum = day.date.slice(-2).replace(/^0/, "");
          return (
            <div
              key={day.date}
              className="flex-1 text-center text-xs text-gray-400 dark:text-gray-500 truncate"
              title={day.date}
            >
              {dayNum}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-0.5">
        {daily.map((day) => (
          <div
            key={day.date}
            className="flex-1 text-center text-xs text-gray-300 dark:text-gray-600 truncate"
          >
            {fmtCost(day.estimated_cost)}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">
        cost est. per day
      </p>
    </div>
  );
}

function TopSessionsTable({ sessions }: { sessions: TopTokenSession[] }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
        No sessions with token data yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <th className="py-2 px-3">Session</th>
            <th className="py-2 px-3">Project</th>
            <th className="py-2 px-3">Model</th>
            <th className="py-2 px-3 text-right">Input↑</th>
            <th className="py-2 px-3 text-right">Output↓</th>
            <th className="py-2 px-3 text-right">Cost (est.)</th>
            <th className="py-2 px-3">Started</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const isAssumed = s.extraction_note?.includes("(assumed)");
            return (
              <tr
                key={s.session_id}
                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td className="py-2 px-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                  …{shortId(s.session_id)}
                </td>
                <td className="py-2 px-3 text-xs max-w-[120px] truncate" title={s.project ?? ""}>
                  {s.project ?? <span className="text-gray-400">—</span>}
                </td>
                <td className="py-2 px-3 text-xs text-gray-500 dark:text-gray-400">
                  {s.model ? (
                    <>
                      {s.model}
                      {isAssumed && (
                        <span className="ml-1 text-amber-500 dark:text-amber-400" title="Model not detected from JSONL — using CLAUDE_FUSE_DEFAULT_MODEL">
                          (assumed)
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="py-2 px-3 text-right font-mono text-xs">
                  {fmtTokens(s.input_tokens)}
                </td>
                <td className="py-2 px-3 text-right font-mono text-xs">
                  {fmtTokens(s.output_tokens)}
                </td>
                <td className="py-2 px-3 text-right font-mono text-xs text-green-700 dark:text-green-400">
                  {s.estimated_cost_usd != null ? (
                    <span title="Estimated — actual cost may differ due to caching and tier">
                      {fmtCost(s.estimated_cost_usd)}{" "}
                      <span className="text-gray-400 text-[10px]">est.</span>
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="py-2 px-3 text-xs text-gray-500 dark:text-gray-400">
                  {fmtDate(s.started_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function CostPage() {
  const data = await getTokenAnalytics();

  if (!data) {
    return (
      <div className="p-6 text-sm text-gray-400 dark:text-gray-500">
        Token analytics unavailable — make sure the API is running.
      </div>
    );
  }

  const { weekly, daily, top_sessions, cost_note } = data;
  const hasData = weekly.session_count > 0;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cost</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Token usage + estimated cost. All cost figures are{" "}
          <strong className="text-amber-600 dark:text-amber-400">estimates</strong> — actual
          charges depend on caching and tier.
        </p>
      </div>

      {/* Weekly totals */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
          This week
        </h2>
        {!hasData ? (
          <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No token data for this week.{" "}
            <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs">
              npm run backfill -- --since 7d
            </code>{" "}
            to ingest recent sessions.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Input tokens"
              value={fmtTokens(weekly.total_input)}
              sub="↑ sent to model"
            />
            <StatCard
              label="Output tokens"
              value={fmtTokens(weekly.total_output)}
              sub="↓ received from model"
            />
            <StatCard
              label="Est. cost"
              value={fmtCost(weekly.total_cost)}
              sub={`est. · ${weekly.session_count} sessions`}
              accent="green"
            />
            {weekly.unknown_count > 0 && (
              <StatCard
                label="No token data"
                value={String(weekly.unknown_count)}
                sub="sessions with unknown tokens"
                accent="amber"
              />
            )}
          </div>
        )}
      </section>

      {/* Daily bar chart */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
          Daily breakdown (7 days)
        </h2>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <DailyBarChart daily={daily} />
        </div>
      </section>

      {/* Top sessions */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
          Top 5 sessions by input token count
        </h2>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <TopSessionsTable sessions={top_sessions} />
        </div>
      </section>

      {/* Disclaimer */}
      <section className="text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800 pt-4">
        <p>{cost_note}</p>
        <p className="mt-1">
          Prices from{" "}
          <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">
            api/src/pricing/models.json
          </code>{" "}
          — static + versioned, update manually when Anthropic changes rates.
        </p>
        <p className="mt-2 text-blue-500 dark:text-blue-400">
          High token sessions? Give your AI context memory →{" "}
          <a
            href="https://brain.sbknext.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-600"
          >
            Brain
          </a>{" "}
          reduces repeat context re-loading.
        </p>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "amber";
}) {
  const valueClass =
    accent === "green"
      ? "text-green-700 dark:text-green-400"
      : accent === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : "text-gray-900 dark:text-gray-100";

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold font-mono ${valueClass}`}>{value}</p>
      {sub && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>
      )}
    </div>
  );
}
