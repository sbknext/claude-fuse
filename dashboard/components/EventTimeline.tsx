import type { Event, Mistake } from "@/lib/types";
import { formatDate, SEVERITY_COLORS } from "@/lib/utils";

const TYPE_ICON: Record<string, string> = {
  user_msg: "→",
  assistant_msg: "←",
  tool_use: "⚙",
  tool_result: "✓",
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
        return (
          <li key={ev.id} className="text-sm">
            <div className="flex items-start gap-2 py-1">
              <span className="shrink-0 text-gray-400 font-mono text-xs w-5 text-center">
                {TYPE_ICON[ev.type] ?? "•"}
              </span>
              <span className="shrink-0 font-mono text-xs text-gray-400 whitespace-nowrap">
                {formatDate(ev.ts)}
              </span>
              {ev.tool_name && (
                <span className="shrink-0 font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">
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
              <div className="ml-7 space-y-1 mb-1">
                {eventMistakes.map((m) => (
                  <div
                    key={m.id}
                    className={`text-xs rounded px-2 py-1 ${
                      SEVERITY_COLORS[m.severity] ??
                      "text-gray-600 bg-gray-50"
                    }`}
                  >
                    <span className="font-semibold">[{m.severity}]</span>{" "}
                    {m.pattern}
                    {m.details_json && (
                      <span className="ml-1 opacity-75">
                        —{" "}
                        {(() => {
                          try {
                            const d = JSON.parse(m.details_json);
                            return d.message ?? JSON.stringify(d).slice(0, 80);
                          } catch {
                            return m.details_json.slice(0, 80);
                          }
                        })()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
