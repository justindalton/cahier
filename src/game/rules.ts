/** Advance a phase label: "night-1" -> "day-1", "day-1" -> "night-2"; null -> "night-1". */
export function nextPhase(current: string | null): string {
  if (!current) return 'night-1';
  const [kind, numStr] = current.split('-');
  const n = parseInt(numStr ?? '1', 10) || 1;
  if (kind === 'night') return `day-${n}`;
  return `night-${n + 1}`;
}

/** Yes votes required to put someone on the block (half or more of alive players). */
export function voteThreshold(aliveCount: number): number {
  return Math.ceil(aliveCount / 2);
}
