"use client";

import Link from "next/link";
import { useState } from "react";
import type { Session } from "@/lib/types";
import { relativeTime, shortDateTime, shortId } from "@/lib/utils";
import { normalizeProject, compactNumber } from "@/lib/format";

const STATUS_BADGE: Record<string, string> = {
  active:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  completed: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  crashed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Link
        href={`/sessions/${id}`}
        title={id}
        className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-xs"
      >
        {shortId(id)}
      </Link>
      <button
        onClick={copy}
        title={copied ? "Copied!" : "Copy full ID"}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-xs"
      >
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}

export function SessionRow({ session }: { session: Session }) {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="py-2 px-3 whitespace-nowrap">
        <CopyableId id={session.id} />
      </td>
      <td className="py-2 px-3 text-sm" title={session.project ?? ""}>
        {normalizeProject(session.project)}
      </td>
      <td className="py-2 px-3 font-mono text-xs">
        {session.branch ?? "—"}
      </td>
      <td
        className="py-2 px-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap leading-tight"
        title={new Date(session.started_at).toISOString()}
      >
        <div>{shortDateTime(session.started_at)}</div>
        <div className="text-[10px] text-gray-400 dark:text-gray-500">
          {relativeTime(session.started_at)}
        </div>
      </td>
      <td
        className="py-2 px-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap leading-tight"
        title={session.ended_at ? new Date(session.ended_at).toISOString() : ""}
      >
        {session.ended_at ? (
          <>
            <div>{shortDateTime(session.ended_at)}</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500">
              {relativeTime(session.ended_at)}
            </div>
          </>
        ) : (
          <span className="text-green-600 dark:text-green-400 font-medium">● live</span>
        )}
      </td>
      <td className="py-2 px-3 text-center text-sm font-mono">
        {compactNumber(session.total_tool_calls)}
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
