import { getSession } from "@/lib/api-client";
import { EventTimeline } from "@/components/EventTimeline";
import { formatDate, relativeTime } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

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
            <h1 className="text-lg font-semibold font-mono">{session.id}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-600 dark:text-gray-300">
              {session.project && <span>{session.project}</span>}
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

        {session.cwd && (
          <p className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all">
            cwd: {session.cwd}
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Stat label="Started" value={relativeTime(session.started_at)} />
          <Stat
            label="Ended"
            value={
              session.ended_at ? relativeTime(session.ended_at) : "ongoing"
            }
          />
          <Stat label="Tool calls" value={String(session.total_tool_calls)} />
          <Stat
            label="Mistakes"
            value={String(session.mistakes?.length ?? 0)}
            highlight={(session.mistakes?.length ?? 0) > 0}
          />
          <Stat
            label="Input tokens"
            value={session.total_input_tokens.toLocaleString()}
          />
          <Stat
            label="Output tokens"
            value={session.total_output_tokens.toLocaleString()}
          />
          <Stat
            label="Cost"
            value={`$${session.total_cost_usd.toFixed(4)}`}
          />
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
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      m.severity === "high"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                        : m.severity === "medium"
                        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                    }`}
                  >
                    {m.severity.toUpperCase()}
                  </span>
                  <span className="font-mono font-semibold">{m.pattern}</span>
                  <span className="text-gray-400 text-xs ml-auto">
                    {formatDate(m.detected_at)}
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
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-700/50 rounded p-2">
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
