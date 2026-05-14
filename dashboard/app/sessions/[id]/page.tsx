import { getSession } from "@/lib/api-client";
import { EventTimeline } from "@/components/EventTimeline";
import { relativeTime } from "@/lib/utils";
import { normalizeProject, compactNumber } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

// Severity badge (issue 5)
const SEVERITY_BADGE: Record<string, string> = {
  high: "bg-red-600 text-white",
  medium: "bg-amber-500 text-gray-900",
  low: "bg-blue-600 text-white",
};

export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    return (
      <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
        <p className="text-base font-medium mb-2">Session not found.</p>
        <p className="text-sm">
          The session may not have been ingested yet, or the api is offline.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-blue-500 hover:underline"
        >
          ← Back to sessions
        </Link>
      </div>
    );
  }

  const showCost = session.total_cost_usd > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/" className="text-sm text-blue-500 hover:underline">
          ← Sessions
        </Link>
      </div>

      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            {/* Issue 12: clear h1 */}
            <h1
              className="text-base font-semibold font-mono tracking-tight"
              title={session.id}
            >
              {session.id.slice(0, 8)}
              <span className="text-gray-400 dark:text-gray-500">
                {session.id.slice(8)}
              </span>
            </h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-600 dark:text-gray-300 flex-wrap">
              {session.project && (
                <span title={session.project}>
                  {normalizeProject(session.project)}
                </span>
              )}
              {session.branch && (
                <span className="font-mono text-xs bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                  {session.branch}
                </span>
              )}
            </div>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
              session.status === "active"
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : session.status === "crashed"
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
            }`}
          >
            {session.status}
          </span>
        </div>

        {/* cwd — show normalized, tooltip shows full */}
        {session.cwd && (
          <p
            className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all"
            title={session.cwd}
          >
            cwd: {normalizeProject(session.cwd)}
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Stat
            label="Started"
            value={relativeTime(session.started_at)}
            tooltip={new Date(session.started_at).toISOString()}
          />
          <Stat
            label="Ended"
            value={
              session.ended_at ? relativeTime(session.ended_at) : "ongoing"
            }
            tooltip={
              session.ended_at
                ? new Date(session.ended_at).toISOString()
                : undefined
            }
          />
          <Stat
            label="Tool calls"
            value={compactNumber(session.total_tool_calls)}
          />
          <Stat
            label="Mistakes"
            value={String(session.mistakes?.length ?? 0)}
            highlight={(session.mistakes?.length ?? 0) > 0}
          />
          <Stat
            label="Input tokens"
            value={compactNumber(session.total_input_tokens)}
            tooltip={session.total_input_tokens.toLocaleString()}
          />
          <Stat
            label="Output tokens"
            value={compactNumber(session.total_output_tokens)}
            tooltip={session.total_output_tokens.toLocaleString()}
          />
          {/* Issue 4: hide cost when 0 */}
          {showCost && (
            <Stat
              label="Cost"
              value={`$${session.total_cost_usd.toFixed(4)}`}
            />
          )}
          <Stat label="Events" value={String(session.events?.length ?? 0)} />
        </div>
      </div>

      {/* Event timeline */}
      <div>
        <h2 className="text-base font-semibold mb-3">Event Timeline</h2>
        <EventTimeline
          events={session.events ?? []}
          mistakes={session.mistakes ?? []}
        />
      </div>

      {/* Mistakes summary */}
      {(session.mistakes?.length ?? 0) > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">
            Mistakes ({session.mistakes.length})
          </h2>
          <div className="space-y-2">
            {session.mistakes.map((m) => (
              <div
                key={m.id}
                className="text-sm border border-gray-200 dark:border-gray-700 rounded p-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      SEVERITY_BADGE[m.severity] ??
                      "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {m.severity.toUpperCase()}
                  </span>
                  <span className="font-mono font-semibold">{m.pattern}</span>
                  <span
                    className="text-gray-400 text-xs ml-auto"
                    title={new Date(m.detected_at).toISOString()}
                  >
                    {relativeTime(m.detected_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  tooltip,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tooltip?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-700/50 rounded p-2" title={tooltip}>
      <div className="text-gray-500 dark:text-gray-400 uppercase tracking-wide text-xs">
        {label}
      </div>
      <div
        className={`font-semibold mt-0.5 ${
          highlight ? "text-red-600 dark:text-red-400" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
