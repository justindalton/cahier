import type { GameEvent, Player } from '../db/types';
import { voteThreshold } from './rules';

export interface VoteTally {
  aliveCount: number;
  threshold: number;
  currentYesCount: number; // the latest VOTE_TALLY count (for display in center)
  currentTargetId: string | null; // who the votes are for (latest VOTE_TALLY target)
}

/**
 * Get the current vote state from events.
 * Uses the latest VOTE_TALLY event to show the running count.
 * No computed "on block" — that's a manual player flag now.
 */
export function tallyVotes(players: Player[], events: GameEvent[]): VoteTally {
  const aliveCount = players.filter((p) => p.alive).length;
  const threshold = voteThreshold(aliveCount);

  // Find the latest VOTE_TALLY event
  let currentYesCount = 0;
  let currentTargetId: string | null = null;

  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  for (const e of ordered) {
    if (e.type === 'VOTE_TALLY' && e.targetPlayerId) {
      currentYesCount = (e.payload.yesCount as number) ?? 0;
      currentTargetId = e.targetPlayerId;
    }
  }

  return { aliveCount, threshold, currentYesCount, currentTargetId };
}
