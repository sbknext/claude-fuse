/**
 * AI explain (Story 1.5.6) — optional enhancement.
 *
 * Calls an AI API with tool sequence + session context summary to suggest
 * a trigger description and notes for a skill stub.
 *
 * GATING: only runs when CLAUDE_FUSE_AI_API_KEY is set.
 * BEST-EFFORT: any failure returns null — caller falls back to a non-AI stub.
 * HONESTY: all AI output is caller-labelled as "AI — candidate suggestion".
 *
 * Sends ONLY: tool names + call count. No raw JSONL content leaves the machine.
 */

/**
 * Suggest a trigger + notes for the given tool sequence using an LLM.
 *
 * @param {string[]} tools           - ordered tool name list
 * @param {number}   frequency       - how often this sequence appeared
 * @param {number}   distinctSessions - across how many sessions
 * @returns {Promise<{trigger: string, notes: string} | null>}
 */
export async function aiExplain(tools, frequency, distinctSessions) {
  const apiKey = process.env.CLAUDE_FUSE_AI_API_KEY;
  if (!apiKey) return null; // Gate: key absent → skip

  const toolsLabel = tools.join(' → ');
  const prompt = `You are helping document a reusable Claude Code skill.

The following tool sequence was detected ${frequency} times across ${distinctSessions} sessions:
  ${toolsLabel}

In 1-2 sentences, suggest:
1. A trigger description: when would a developer invoke this sequence as a skill? (label: trigger)
2. A brief note about what the pattern accomplishes. (label: notes)

Respond in JSON with exactly two keys: "trigger" (string) and "notes" (string).
Be concise. This is a candidate suggestion — do not overstate certainty.`;

  try {
    // Use Anthropic API by default; respect CLAUDE_FUSE_AI_BASE_URL for alternatives.
    const baseUrl = process.env.CLAUDE_FUSE_AI_BASE_URL || 'https://api.anthropic.com';
    const model = process.env.CLAUDE_FUSE_AI_MODEL || 'claude-haiku-4-5';

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000), // 15s hard limit
    });

    if (!response.ok) {
      console.warn(`[ai-explain] API returned ${response.status} — skipping AI fields`);
      return null;
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text || '';

    // Parse JSON from response — handle ``` fences if present
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.trigger !== 'string' || typeof parsed.notes !== 'string') return null;

    return {
      trigger: parsed.trigger.trim().slice(0, 300),
      notes: parsed.notes.trim().slice(0, 300),
    };
  } catch (err) {
    // Any failure (network, parse, timeout) → best-effort null
    console.warn('[ai-explain] failed (best-effort):', err?.message || String(err));
    return null;
  }
}
