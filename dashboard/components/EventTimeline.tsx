import type { Event, Mistake } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { parseDetailsJson } from "@/lib/format";

const TYPE_ICON: Record<string, string> = {
  user_msg: "→",
  assistant_msg: "←",
  tool_use: "⚙",
  tool_result: "✓",
};

// Left-border color by event type (issue 11)
const TYPE_BORDER: Record<string, string> = {
  user_msg: "border-l-2 border-blue-400 dark:border-blue-500",
  assistant_msg: "border-l-2 border-gray-300 dark:border-gray-600",
  tool_use: "border-l-2 border-purple-400 dark:border-purple-500",
  tool_result: "border-l-2 border-green-400 dark:border-green-600",
};

// Severity badge colors (solid pills)
const SEVERITY_BADGE: Record<string, string> = {
  high: "bg-red-600 text-white",
  medium: "bg-amber-500 text-gray-900",
  low: "bg-blue-600 text-white",
};

interface Props {
  events: Event[];
  mistakes: Mistake[];
}

export function EventTimeline({ events, mistakes }: Props) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
        No events recorded.
      </p>
    );
  }

  // Build a map of event_id -> mistakes for inline annotation
  const mistakesByEvent = new Map<number, Mistake[]>();
  for (const m of mistakes) {
    if (m.event_id != null) {
      const list = mistakesByEvent.get(m.event_id) ?? [];
      list.push(m);
      mistakesByEvent.set(m.event_id, list);
    }
  }

  return (
    <ol className="space-y-1">
      {events.map((ev) => {
        const eventMistakes = mistakesByEvent.get(ev.id) ?? [];
        const borderClass =
          TYPE_BORDER[ev.type] ?? "border-l-2 border-gray-200 dark:border-gray-700";
        return (
          <li
            key={ev.id}
            className={`text-sm pl-2 ${borderClass}`}
          >
            <div className="flex items-start gap-2 py-1">
              <span className="shrink-0 text-gray-400 font-mono text-xs w-4 text-center">
                {TYPE_ICON[ev.type] ?? "•"}
              </span>
              <span
                className="shrink-0 font-mono text-xs text-gray-400 whitespace-nowrap"
                title={new Date(ev.ts).toISOString()}
              >
                {relativeTime(ev.ts)}
              </span>
              {ev.tool_name && (
                <span className="shrink-0 font-mono text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">
                  {ev.tool_name}
                </span>
              )}
              <span className="text-gray-700 dark:text-gray-300 break-all">
                {ev.summary ?? ev.type}
              </span>
              {ev.duration_ms != null && (
                <span className="shrink-0 text-gray-400 text-xs ml-auto whitespace-nowrap">
                  {ev.duration_ms}ms
                </span>
              )}
              {ev.success === 0 && (
                <span className="shrink-0 text-red-500 text-xs">✗</span>
              )}
            </div>
            {eventMistakes.length > 0 && (
              <div className="ml-6 space-y-1 mb-1">
                {eventMistakes.map((m) => {
                  const details = parseDetailsJson(m.details_json, 2, 80);
                  return (
                    <div
                      key={m.id}
                      className="text-xs rounded px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                    >
                      <span
                        className={`inline-block text-xs font-bold px-1.5 py-0.5 rounded-full mr-1.5 ${
                          SEVERITY_BADGE[m.severity] ?? "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {m.severity.toUpperCase()}
                      </span>
                      <span className="font-mono font-semibold">{m.pattern}</span>
                      {details.length > 0 && (
                        <span className="ml-1.5 text-gray-500 dark:text-gray-400">
                          — {details.map(d => `${d.key}: ${d.value}`).join(" · ")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
