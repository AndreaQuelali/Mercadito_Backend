export const RRF_K = 60;

/**
 * Reciprocal Rank Fusion: each list contributes 1 / (k + rank) per id (rank starts at 1).
 * Returns ids ordered by score, best first; ties keep the order of first appearance.
 */
export function fuseRankings(lists: number[][], k: number = RRF_K): { id: number; score: number }[] {
  const scores = new Map<number, number>();
  for (const list of lists) {
    const seen = new Set<number>();
    list.forEach((id, index) => {
      if (seen.has(id)) return; // a duplicate within one list counts once, at its best rank
      seen.add(id);
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score); // Array.sort is stable: ties keep insertion order
}
