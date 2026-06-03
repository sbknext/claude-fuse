import { getSessions, getMistakes, getSkills } from "@/lib/api-client";
import { SessionRow } from "@/components/SessionRow";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [sessions, mistakes, skills] = await Promise.all([
    getSessions(50),
    getMistakes({ limit: 1 }), // just for total count approximation — use header later
    getSkills(1),
  ]);

  // Quick totals from what we have
  const allMistakes = await getMistakes({ limit: 500 });
  const allSkills = await getSkills(500);

  return (
    <div>
      {/* Page header — issue 12 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Sessions</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="font-semibold text-gray-800 dark:text-gray-100">{sessions.length}</span>
            sessions
          </span>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span className="inline-flex items-center gap-1">
            <span className="font-semibold text-red-600 dark:text-red-400">{allMistakes.length}</span>
            mistakes
          </span>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span className="inline-flex items-center gap-1">
            <span className="font-semibold text-purple-600 dark:text-purple-400">{allSkills.length}</span>
            skill candidates
          </span>
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          <p className="text-base font-medium mb-2">No sessions yet.</p>
          <p className="text-sm">
            Run{" "}
            <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              npm run seed:demo
            </code>{" "}
            to populate demo data, or{" "}
            <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              npm run backfill -- --since 30d
            </code>{" "}
            to ingest existing JSONL files.
          </p>
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
                <th className="py-2 px-3">Ended</th>
                <th className="py-2 px-3 text-center" title="Input↑ Output↓ tokens. See Cost tab for est. cost. Unknown = token fields absent from JSONL.">Tokens</th>
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
    </div>
  );
}
