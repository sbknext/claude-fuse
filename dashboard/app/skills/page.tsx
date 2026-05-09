import { getSkills } from "@/lib/api-client";
import { SkillCard } from "@/components/SkillCard";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const skills = await getSkills(100);

  // Sort by frequency desc (API should already do this, but ensure client-side too)
  const sorted = [...skills].sort((a, b) => b.frequency - a.frequency);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Skill Candidates</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {skills.length} candidate{skills.length !== 1 ? "s" : ""}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          <p className="text-base font-medium mb-2">No skill candidates yet.</p>
          <p className="text-sm">
            Skill candidates appear when the same tool sequence (3–6 tools) recurs
            across ≥3 sessions with frequency ≥5. Run{" "}
            <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              npm run backfill -- --since 30d
            </code>{" "}
            to analyse existing JSONL files.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map((s) => (
            <SkillCard key={s.id} skill={s} />
          ))}
        </div>
      )}
    </div>
  );
}
