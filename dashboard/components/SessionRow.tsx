import Link from "next/link";
import type { Session } from "@/lib/types";
import { relativeTime, shortId } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  completed:
    "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  crashed:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function SessionRow({ session }: { session: Session }) {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="py-2 px-3 font-mono text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
        <Link
          href={`/sessions/${session.id}`}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          {shortId(session.id)}
        </Link>
      </td>
      <td className="py-2 px-3 text-sm">{session.project ?? "—"}</td>
      <td className="py-2 px-3 text-sm font-mono text-xs">
        {session.branch ?? "—"}
      </td>
      <td className="py-2 px-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {relativeTime(session.started_at)}
      </td>
      <td className="py-2 px-3 text-center text-sm">
        {session.total_tool_calls ?? 0}
      </td>
      <td className="py-2 px-3 text-center text-sm">
        {(session.mistake_count ?? 0) > 0 ? (
          <span className="text-red-600 dark:text-red-400 font-semibold">
            {session.mistake_count}
          </span>
        ) : (
          <span className="text-gray-400">0</span>
        )}
      </td>
      <td className="py-2 px-3">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            STATUS_BADGE[session.status] ?? STATUS_BADGE.completed
          }`}
        >
          {session.status}
        </span>
      </td>
    </tr>
  );
}
