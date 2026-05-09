import { getSessions } from "@/lib/api-client";
import { SessionRow } from "@/components/SessionRow";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const sessions = await getSessions(50);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Recent Sessions</h1>

      {sessions.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          <p className="text-base font-medium mb-2">No sessions yet.</p>
          <p className="text-sm">
            Run{" "}
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
