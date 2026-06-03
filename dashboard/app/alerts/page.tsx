"use client";

import { useEffect, useState } from "react";
import { getRecentAlerts } from "@/lib/api-client";
import type { AlertLogEntry } from "@/lib/types";
import { relativeTime, shortId } from "@/lib/utils";

function channelBadge(channel: string) {
  if (channel.startsWith("telegram"))
    return "bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full";
  if (channel.startsWith("log"))
    return "bg-gray-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full";
  return "bg-gray-400 text-white text-xs font-bold px-1.5 py-0.5 rounded-full";
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertLogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRecentAlerts(20).then((data) => {
      if (!cancelled) {
        setAlerts(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Real-time mistake alerts (candidate — pattern detected, not mistake confirmed).
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">Loading…</div>
      ) : !alerts || alerts.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          <p className="text-base font-medium mb-2">No alerts yet.</p>
          <p className="text-sm">
            Set{" "}
            <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              CLAUDE_FUSE_ALERT_CHANNELS=telegram
            </code>{" "}
            or{" "}
            <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              =log
            </code>{" "}
            in your <code className="font-mono">.env</code> to enable mid-session nudges.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 flex flex-col gap-1 bg-white dark:bg-gray-900"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">
                  {a.pattern}
                </span>
                <span className={channelBadge(a.channel)}>{a.channel}</span>
                {a.success === 0 && (
                  <span className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs px-1.5 py-0.5 rounded-full">
                    failed
                  </span>
                )}
                <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                  {relativeTime(a.sent_at)}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                session: {shortId(a.session_id)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
