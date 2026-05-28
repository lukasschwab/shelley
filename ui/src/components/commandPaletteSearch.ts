// Conversation search helpers for CommandPalette.
import type { ConversationWithState } from "../types";

// Fuzzy match. Returns positive score (higher is better) or -1 if no match.
export function fuzzyMatch(query: string, text: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  if (lowerText === lowerQuery) return 1000;
  if (lowerText.startsWith(lowerQuery))
    return 500 + (lowerQuery.length / lowerText.length) * 100;
  if (lowerText.includes(lowerQuery))
    return 100 + (lowerQuery.length / lowerText.length) * 50;

  // All query chars must appear in order.
  let queryIdx = 0;
  let score = 0;
  let consecutiveBonus = 0;
  for (let i = 0; i < lowerText.length && queryIdx < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIdx]) {
      score += 1 + consecutiveBonus;
      consecutiveBonus += 0.5;
      queryIdx++;
    } else {
      consecutiveBonus = 0;
    }
  }
  if (queryIdx !== lowerQuery.length) return -1;
  return score;
}

// Score a conversation against a query, matching on slug (or id) and cwd.
// cwd matches are penalized so name matches always win.
export function scoreConversation(
  query: string,
  conv: ConversationWithState,
): number {
  const name = conv.slug || conv.conversation_id;
  let score = fuzzyMatch(query, name);
  if (conv.cwd) {
    const cwdScore = fuzzyMatch(query, conv.cwd) * 0.5;
    if (cwdScore > score) score = cwdScore;
  }
  return score;
}

// Merge instant in-memory matches with eventual server results, deduped by
// conversation_id. Local matches come first (sorted by score desc), then
// server results in their existing order.
export function mergeConversationMatches(
  query: string,
  inMemory: ConversationWithState[],
  serverResults: ConversationWithState[],
): ConversationWithState[] {
  const trimmed = query.trim();
  if (!trimmed) return inMemory;

  const scored: { conv: ConversationWithState; score: number }[] = [];
  for (const conv of inMemory) {
    const score = scoreConversation(trimmed, conv);
    if (score > 0) scored.push({ conv, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const localMatches = scored.map((s) => s.conv);

  const seen = new Set(localMatches.map((c) => c.conversation_id));
  const extras = serverResults.filter((c) => !seen.has(c.conversation_id));
  return [...localMatches, ...extras];
}
