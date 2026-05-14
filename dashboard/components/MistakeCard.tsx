"use client";

import { useState } from "react";
import Link from "next/link";
import type { Mistake } from "@/lib/types";
import { relativeTime, shortId } from "@/lib/utils";
import { normalizeProject, parseDetailsJson } from "@/lib/format";
import { PromoteButton } from "./PromoteButton";

// Severity badge: solid colored pill, dark-mode aware
const SEVERITY_BADGE: Record<string, string> = {
  high: "bg-red-600 text-white dark:bg-red-600 dark:text-white",
  medium: "bg-amber-500 text-gray-900 dark:bg-amber-500 dark:text-gray-900",
  low: "bg-blue-600 text-white dark:bg-blue-600 dark:text-white",
};

interface Props {
  mistake: Mistake;
}

function CopyableSessionId({ id }: { id: string }) {
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
        className="text-blue-500 hover:underline font-mono"
      >
        session:{shortId(id)}
      </Link>
      <button
        onClick={copy}
        title={copied ? "Copied!" : "Copy full ID"}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs transition-colors"
      >
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-gray-500 dark:text-gray-400 whitespace-nowrap">{label}:</dt>
      <dd className="text-gray-700 dark:text-gray-300 break-all truncate" title={value}>{value}</dd>
    </>
  );
}

export function MistakeCard({ mistake }: Props) {
  const [ledgerId, setLedgerId] = useState<string | null>(
    mistake.ledger_entry_id
  );

  const details = parseDetailsJson(mistake.details_json);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              SEVERITY_BADGE[mistake.severity] ??
              "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
            }`}
          >
            {mistake.severity.toUpperCase()}
          </span>
          <span className="font-mono text-sm font-semibold">
            {mistake.pattern}
          </span>
          {ledgerId && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
              {ledgerId}
            </span>
          )}
        </div>
        <span
          className="text-xs text-gray-400 whitespace-nowrap shrink-0"
          title={new Date(mistake.detected_at).toISOString()}
        >
          {relativeTime(mistake.detected_at)}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        <CopyableSessionId id={mistake.session_id} />
        {mistake.session?.project && (
          <span title={mistake.session.project}>
            {normalizeProject(mistake.session.project)}
          </span>
        )}
        {mistake.session?.branch && (
          <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">
            {mistake.session.branch}
          </span>
        )}
      </div>

      {details.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs font-mono bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5">
          {details.map(({ key, value }) => (
            <DetailRow key={key} label={key} value={value} />
          ))}
        </dl>
      )}

      <div className="pt-1">
        <PromoteButton
          mistakeId={mistake.id}
          alreadyPromoted={!!ledgerId}
          onPromoted={(id) => setLedgerId(id)}
        />
      </div>
    </div>
  );
}
