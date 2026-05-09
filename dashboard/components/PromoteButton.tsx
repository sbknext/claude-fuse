"use client";

import { useState } from "react";
import { promoteMistake } from "@/lib/api-client";

interface Props {
  mistakeId: number;
  alreadyPromoted: boolean;
  onPromoted: (ledgerEntryId: string) => void;
}

export function PromoteButton({ mistakeId, alreadyPromoted, onPromoted }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(alreadyPromoted);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await promoteMistake(mistakeId);
      if (res) {
        setDone(true);
        setToast(`Promoted → ${res.ledger_entry_id}`);
        onPromoted(res.ledger_entry_id);
        setTimeout(() => setToast(null), 4000);
      } else {
        setError("API unavailable");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
        {toast ?? "Promoted"}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Promoting…" : "Promote to MISTAKES_LEDGER"}
      </button>
      {toast && (
        <span className="text-xs text-green-600 dark:text-green-400">
          {toast}
        </span>
      )}
      {error && (
        <span className="text-xs text-red-500">{error}</span>
      )}
    </div>
  );
}
