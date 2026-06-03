"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { getMistakesPage, getRecentAlerts, type MistakesPage } from "@/lib/api-client";
import { MistakeCard } from "@/components/MistakeCard";
import type { Mistake, AlertLogEntry } from "@/lib/types";

const PATTERNS = [
  "failed_bash_retry",
  "user_halt",
  "repeated_grep_read",
  "panic_reset",
  "large_context_thrash",
];

const SEVERITY_OPTIONS = [
  { value: "", label: "All severities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const PER_PAGE = 20;

function MistakesInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageParam = Number(searchParams.get("page") || "1");
  const reviewedParam = (searchParams.get("reviewed") || "") as "0" | "1" | "";
  const severityParam = (searchParams.get("severity") || "") as "low" | "medium" | "high" | "";
  const patternParam = searchParams.get("pattern") || "";

  const [data, setData] = useState<MistakesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentAlerts, setRecentAlerts] = useState<AlertLogEntry[]>([]);

  const applyParams = useCallback(
    (updates: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      if (!("page" in updates)) sp.set("page", "1");
      router.push(`${pathname}?${sp.toString()}`);
    },
    [router, pathname, searchParams]
  );

  // Load recent alerts for badge
  useEffect(() => {
    getRecentAlerts(5).then((alerts) => setRecentAlerts(alerts));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMistakesPage({
      page: pageParam,
      per_page: PER_PAGE,
      reviewed: reviewedParam,
      severity: severityParam,
      pattern: patternParam,
    }).then((d) => {
      if (!cancelled) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pageParam, reviewedParam, severityParam, patternParam]);

  const mistakes: Mistake[] = data?.mistakes ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PER_PAGE)) : 1;

  const highCount = mistakes.filter((m) => m.severity === "high").length;
  const medCount = mistakes.filter((m) => m.severity === "medium").length;
  const lowCount = mistakes.filter((m) => m.severity === "low").length;

  const hasFilters = !!(reviewedParam || severityParam || patternParam);

  // Group by pattern (within current page)
  const grouped = new Map<string, Mistake[]>();
  for (const m of mistakes) {
    const list = grouped.get(m.pattern) ?? [];
    list.push(m);
    grouped.set(m.pattern, list);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight">Mistakes</h1>
          {recentAlerts.length > 0 && (
            <Link
              href="/alerts"
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-700 rounded-full px-2.5 py-1 hover:bg-orange-200 dark:hover:bg-orange-800/40 transition-colors"
              title="Recent real-time alerts (candidate detections)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse inline-block" />
              {recentAlerts.length} alert{recentAlerts.length !== 1 ? "s" : ""}
            </Link>
          )}
        </div>
        {data && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-2 items-center">
            <span>
              <span className="font-semibold text-gray-800 dark:text-gray-100">
                {data.count}
              </span>{" "}
              detected{hasFilters ? " (filtered)" : ""}
            </span>
            {highCount > 0 && (
              <span className="bg-red-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {highCount} high
              </span>
            )}
            {medCount > 0 && (
              <span className="bg-amber-500 text-gray-900 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {medCount} medium
              </span>
            )}
            {lowCount > 0 && (
              <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {lowCount} low
              </span>
            )}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-sm mb-5">
        {/* Pattern dropdown */}
        <select
          value={patternParam}
          onChange={(e) => applyParams({ pattern: e.target.value })}
          className="border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All patterns</option>
          {PATTERNS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        {/* Severity */}
        <select
          value={severityParam}
          onChange={(e) => applyParams({ severity: e.target.value })}
          className="border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {SEVERITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Reviewed toggle */}
        <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded overflow-hidden text-xs">
          {(
            [
              { value: "", label: "All" },
              { value: "0", label: "Unreviewed" },
              { value: "1", label: "Reviewed" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => applyParams({ reviewed: value })}
              className={`px-2.5 py-1.5 transition-colors ${
                reviewedParam === value
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 font-bold"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {hasFilters && (
          <button
            onClick={() => router.push(pathname)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
          Loading…
        </div>
      ) : mistakes.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          {hasFilters ? (
            <>
              <p className="text-base font-medium mb-2">No matches. Clear filters.</p>
              <button
                onClick={() => router.push(pathname)}
                className="text-sm text-blue-500 hover:underline"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="text-base font-medium mb-2">No mistakes detected yet.</p>
              <p className="text-sm">
                Run{" "}
                <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                  npm run backfill -- --since 30d
                </code>{" "}
                to ingest existing JSONL files and trigger detectors.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([pattern, items]) => (
            <section key={pattern}>
              <h2 className="text-sm font-semibold font-mono mb-2 text-gray-700 dark:text-gray-300 flex items-center gap-2">
                {pattern}
                <span className="font-normal text-gray-400">({items.length})</span>
              </h2>
              <div className="space-y-2">
                {items.map((m) => (
                  <MistakeCard key={m.id} mistake={m} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && data && data.count > PER_PAGE && (
        <div className="flex items-center justify-between mt-6 text-sm text-gray-500 dark:text-gray-400">
          <button
            disabled={pageParam <= 1}
            onClick={() => applyParams({ page: String(pageParam - 1) })}
            className="px-3 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Prev
          </button>
          <span className="text-xs">
            Page {pageParam} of {totalPages}
          </span>
          <button
            disabled={pageParam >= totalPages}
            onClick={() => applyParams({ page: String(pageParam + 1) })}
            className="px-3 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default function MistakesPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400 py-8 text-center">Loading…</div>}>
      <MistakesInner />
    </Suspense>
  );
}
