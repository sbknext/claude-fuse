import { getMistakes } from "@/lib/api-client";
import { MistakeCard } from "@/components/MistakeCard";
import type { Mistake } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    reviewed?: string;
    severity?: string;
  }>;
}

export default async function MistakesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const reviewed = sp.reviewed as "0" | "1" | "" | undefined;
  const severity = sp.severity as "low" | "medium" | "high" | "" | undefined;

  const mistakes = await getMistakes({ reviewed, severity, limit: 100 });

  // Group by pattern
  const grouped = new Map<string, Mistake[]>();
  for (const m of mistakes) {
    const list = grouped.get(m.pattern) ?? [];
    list.push(m);
    grouped.set(m.pattern, list);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Mistakes</h1>

        {/* Filters */}
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-gray-500 dark:text-gray-400">Filter:</span>
          <FilterLink
            href="/mistakes"
            active={!reviewed && !severity}
            label="All"
          />
          <FilterLink
            href="/mistakes?reviewed=0"
            active={reviewed === "0"}
            label="Unreviewed"
          />
          <FilterLink
            href="/mistakes?reviewed=1"
            active={reviewed === "1"}
            label="Reviewed"
          />
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <FilterLink
            href="/mistakes?severity=high"
            active={severity === "high"}
            label="High"
            colorClass="text-red-600 dark:text-red-400"
          />
          <FilterLink
            href="/mistakes?severity=medium"
            active={severity === "medium"}
            label="Medium"
            colorClass="text-yellow-600 dark:text-yellow-400"
          />
          <FilterLink
            href="/mistakes?severity=low"
            active={severity === "low"}
            label="Low"
            colorClass="text-blue-600 dark:text-blue-400"
          />
        </div>
      </div>

      {mistakes.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          <p className="text-base font-medium mb-2">No mistakes detected yet.</p>
          <p className="text-sm">
            Run{" "}
            <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              npm run backfill -- --since 30d
            </code>{" "}
            to ingest existing JSONL files and trigger detectors.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([pattern, items]) => (
            <section key={pattern}>
              <h2 className="text-sm font-semibold font-mono mb-2 text-gray-700 dark:text-gray-300 flex items-center gap-2">
                {pattern}
                <span className="font-normal text-gray-400">
                  ({items.length})
                </span>
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
    </div>
  );
}

function FilterLink({
  href,
  active,
  label,
  colorClass,
}: {
  href: string;
  active: boolean;
  label: string;
  colorClass?: string;
}) {
  return (
    <Link
      href={href}
      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
        active
          ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
          : `hover:bg-gray-100 dark:hover:bg-gray-700 ${colorClass ?? "text-gray-600 dark:text-gray-400"}`
      }`}
    >
      {label}
    </Link>
  );
}
