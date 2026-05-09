"use client";

import { useState } from "react";
import Link from "next/link";
import type { Mistake } from "@/lib/types";
import { relativeTime, shortId, SEVERITY_COLORS } from "@/lib/utils";
import { PromoteButton } from "./PromoteButton";

interface Props {
  mistake: Mistake;
}

export function MistakeCard({ mistake }: Props) {
  const [ledgerId, setLedgerId] = useState<string | null>(
    mistake.ledger_entry_id
  );

  let detailsPreview = "";
  if (mistake.details_json) {
    try {
      const d = JSON.parse(mistake.details_json);
      detailsPreview = d.message ?? JSON.stringify(d).slice(0, 120);
    } catch {
      detailsPreview = mistake.details_json.slice(0, 120);
    }
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              SEVERITY_COLORS[mistake.severity] ??
              "text-gray-600 bg-gray-100"
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
        <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
          {relativeTime(mistake.detected_at)}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <Link
          href={`/sessions/${mistake.session_id}`}
          className="text-blue-500 hover:underline font-mono"
        >
          session:{shortId(mistake.session_id)}
        </Link>
        {mistake.session?.project && (
          <span>{mistake.session.project}</span>
        )}
        {mistake.session?.branch && (
          <span className="font-mono">{mistake.session.branch}</span>
        )}
      </div>

      {detailsPreview && (
        <p className="text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-800 rounded px-2 py-1 break-all">
          {detailsPreview}
        </p>
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
