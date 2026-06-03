"use client";

import { useState } from "react";
import type { SkillCandidate } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { promoteSkill, generateSkillStub } from "@/lib/api-client";

interface Props {
  skill: SkillCandidate;
}

export function SkillCard({ skill }: Props) {
  const [promoted, setPromoted] = useState(!!skill.promoted_at);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState(skill.name ?? "");
  const [description, setDescription] = useState(skill.description ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Stub state
  const [stubLoading, setStubLoading] = useState(false);
  const [stubMarkdown, setStubMarkdown] = useState<string | null>(null);
  const [stubPath, setStubPath] = useState<string | null>(null);
  const [stubAiUsed, setStubAiUsed] = useState(false);
  const [stubError, setStubError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Show "Explain stub (AI)" button when NEXT_PUBLIC_CLAUDE_FUSE_AI_KEY_SET=1 is set.
  // Set this in .env.local when CLAUDE_FUSE_AI_API_KEY is configured server-side.
  const hasAiKey = process.env.NEXT_PUBLIC_CLAUDE_FUSE_AI_KEY_SET === "1";

  let toolSequence: string[] = [];
  try {
    toolSequence = JSON.parse(skill.tool_sequence_json) as string[];
  } catch {
    toolSequence = [];
  }

  let exampleSessions: string[] = [];
  try {
    exampleSessions = skill.example_session_ids_json
      ? (JSON.parse(skill.example_session_ids_json) as string[])
      : [];
  } catch {
    exampleSessions = [];
  }

  async function handleGenerateStub(withAi = false) {
    setStubLoading(true);
    setStubError(null);
    try {
      const res = await generateSkillStub(skill.id, withAi);
      if (res && res.success) {
        setStubMarkdown(res.markdown);
        setStubPath(res.path);
        setStubAiUsed(res.ai_used);
      } else {
        setStubError("Stub generation failed — API unavailable");
      }
    } catch (e) {
      setStubError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setStubLoading(false);
    }
  }

  async function handleCopyStub() {
    if (!stubMarkdown) return;
    try {
      await navigator.clipboard.writeText(stubMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function handlePromote() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await promoteSkill(skill.id, name.trim(), description.trim());
      if (res) {
        setPromoted(true);
        setShowForm(false);
        setToast(`Promoted as "${res.name}"`);
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

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-2 py-0.5 rounded-full">
            freq {skill.frequency}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {exampleSessions.length} session{exampleSessions.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="text-xs text-gray-400 whitespace-nowrap text-right">
          <div>first: {relativeTime(skill.first_seen)}</div>
          <div>last: {relativeTime(skill.last_seen)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {toolSequence.map((t, i) => (
          <span
            key={i}
            className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300"
          >
            {t}
          </span>
        ))}
      </div>

      <p className="font-mono text-xs text-gray-400 break-all">
        sig: {skill.signature.slice(0, 16)}…
      </p>

      {/* ── Stub section ── */}
      <div className="pt-1 space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleGenerateStub(false)}
            disabled={stubLoading}
            className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {stubLoading ? "Generating…" : "Generate stub"}
          </button>
          {hasAiKey && (
            <button
              onClick={() => handleGenerateStub(true)}
              disabled={stubLoading}
              className="text-xs px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {stubLoading ? "…" : "Explain stub (AI)"}
            </button>
          )}
        </div>

        {stubError && (
          <p className="text-xs text-red-500">{stubError}</p>
        )}

        {stubMarkdown && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
                Stub generated {stubAiUsed && <span className="text-teal-600 dark:text-teal-400">(AI fields included)</span>}
              </span>
              <button
                onClick={handleCopyStub}
                className="text-xs px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {copied ? "Copied!" : "Copy to clipboard"}
              </button>
            </div>
            {stubPath && (
              <p className="font-mono text-xs text-gray-400 break-all">
                saved: {stubPath}
              </p>
            )}
            <pre className="text-xs bg-gray-50 dark:bg-gray-800 rounded p-2 overflow-auto max-h-48 border border-gray-200 dark:border-gray-700 whitespace-pre-wrap break-words">
              {stubMarkdown}
            </pre>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              CANDIDATE — edit this file before using as a real skill.
            </p>
          </div>
        )}
      </div>

      {promoted ? (
        <div className="text-xs text-green-600 dark:text-green-400 font-medium">
          {toast ?? `Promoted${skill.name ? ` as "${skill.name}"` : ""}`}
        </div>
      ) : (
        <div className="pt-1 space-y-2">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="text-xs px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors"
            >
              Promote
            </button>
          ) : (
            <div className="space-y-2 bg-gray-50 dark:bg-gray-800 rounded p-3">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  placeholder="e.g. search-and-edit"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                  placeholder="What does this tool sequence accomplish?"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handlePromote}
                  disabled={loading}
                  className="text-xs px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Promoting…" : "Confirm Promote"}
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setError(null);
                  }}
                  className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
