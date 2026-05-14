"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { getSessionsPage, type SessionsPage } from "@/lib/api-client";
import { SessionRow } from "@/components/SessionRow";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "crashed", label: "Crashed" },
];

const PER_PAGE = 20;

function SessionsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageParam = Number(searchParams.get("page") || "1");
  const projectParam = searchParams.get("project") || "";
  const statusParam = searchParams.get("status") || "";
  const qParam = searchParams.get("q") || "";

  const [data, setData] = useState<SessionsPage | null>(null);
  const [loading, setLoading] = useState(true);

  // Local controlled filter state (debounced q)
  const [qInput, setQInput] = useState(qParam);
  const [projectInput, setProjectInput] = useState(projectParam);

  const applyParams = useCallback(
    (updates: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      // Reset page on filter change
      if (!("page" in updates)) sp.set("page", "1");
      router.push(`${pathname}?${sp.toString()}`);
    },
    [router, pathname, searchParams]
  );

  // Debounce q
  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput !== qParam) applyParams({ q: qInput });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  // Debounce project input
  useEffect(() => {
    const t = setTimeout(() => {
      if (projectInput !== projectParam) applyParams({ project: projectInput });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectInput]);

  // Fetch on param change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSessionsPage({
      page: pageParam,
      per_page: PER_PAGE,
      project: projectParam,
      status: statusParam as "active" | "completed" | "crashed" | "",
      q: qParam,
    }).then((d) => {
      if (!cancelled) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pageParam, projectParam, statusParam, qParam]);

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PER_PAGE)) : 1;
  const sessions = data?.sessions ?? [];

  const hasFilters = !!(projectParam || statusParam || qParam);

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">All Sessions</h1>
        {data && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              {data.count}
            </span>{" "}
            session{data.count !== 1 ? "s" : ""}
            {hasFilters ? " matching filters" : " ingested"}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Search ID / project / branch…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          className="border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
        />
        <input
          type="text"
          placeholder="Project filter…"
          value={projectInput}
          onChange={(e) => setProjectInput(e.target.value)}
          className="border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
        />
        <select
          value={statusParam}
          onChange={(e) => applyParams({ status: e.target.value })}
          className="border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setQInput("");
              setProjectInput("");
              router.push(pathname);
            }}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
          Loading…
        </div>
      ) : sessions.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          {hasFilters ? (
            <>
              <p className="text-base font-medium mb-2">No matches.</p>
              <button
                onClick={() => {
                  setQInput("");
                  setProjectInput("");
                  router.push(pathname);
                }}
                className="text-sm text-blue-500 hover:underline"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="text-base font-medium mb-2">No sessions yet.</p>
              <p className="text-sm">
                Run{" "}
                <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                  npm run backfill -- --since 30d
                </code>{" "}
                to ingest existing JSONL files.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <th className="py-2 px-3">ID</th>
                <th className="py-2 px-3">Project</th>
                <th className="py-2 px-3">Branch</th>
                <th className="py-2 px-3">Started</th>
                <th className="py-2 px-3 text-center">Tools</th>
                <th className="py-2 px-3 text-center">Mistakes</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <SessionRow key={s.id} session={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && data && data.count > PER_PAGE && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-gray-400">
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

export default function SessionsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400 py-8 text-center">Loading…</div>}>
      <SessionsInner />
    </Suspense>
  );
}
