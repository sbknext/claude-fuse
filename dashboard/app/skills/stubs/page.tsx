"use client";

import { useEffect, useState } from "react";
import { getSkillStubs } from "@/lib/api-client";
import type { SkillStubEntry } from "@/lib/types";
import { shortDateTime } from "@/lib/utils";

export default function SkillStubsPage() {
  const [stubs, setStubs] = useState<SkillStubEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSkillStubs().then((data) => {
      if (!cancelled) {
        setStubs(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Skill Stubs</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Generated CANDIDATE skill templates — review and edit before promoting to a real skill.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">Loading…</div>
      ) : !stubs || stubs.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          <p className="text-base font-medium mb-2">No stubs generated yet.</p>
          <p className="text-sm">
            Click <span className="font-semibold">Generate stub</span> on any skill candidate in the{" "}
            <a href="/skills" className="text-indigo-600 dark:text-indigo-400 underline">Skills</a>{" "}
            tab to create a CANDIDATE template.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {stubs.map((stub) => (
            <div
              key={stub.filename}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-1"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-sm font-medium text-indigo-700 dark:text-indigo-400 break-all">
                  {stub.filename}
                </span>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {shortDateTime(stub.created_at)}
                </span>
              </div>
              <p className="font-mono text-xs text-gray-400 break-all">
                {stub.path}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(stub.size_bytes / 1024).toFixed(1)} KB ·{" "}
                <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                  CANDIDATE — edit before use
                </span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
