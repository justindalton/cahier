import { useGameStore, useVoteTally } from '../store/gameStore';

interface VoteTrackerProps {
  nomineeId: string;
  voteCount: number;
  onVoteChange: (delta: number) => void;
  onVoteComplete: () => void;
}

export default function VoteTracker({ nomineeId, voteCount, onVoteChange, onVoteComplete }: VoteTrackerProps) {
  const players = useGameStore((s) => s.players);
  const characters = useGameStore((s) => s.characters);
  const votes = useVoteTally();

  const nominee = players.find((p) => p.id === nomineeId);
  const char = nominee?.characterId ? characters.find((c) => c.id === nominee.characterId) : null;
  const nomineeName = nominee?.name || `Seat ${nominee?.seat ?? '?'}`;

  const threshold = votes.threshold; // Math.ceil(aliveCount / 2)

  // The highest tally above threshold (excluding this nominee's own stored votes,
  // since we're actively updating them). This is "the number to beat."
  const otherTallies = players
    .filter((p) => p.id !== nomineeId && p.onBlockVotes !== null)
    .map((p) => p.onBlockVotes!)
    .filter((v) => v >= threshold);
  const highestTally = otherTallies.length > 0 ? Math.max(...otherTallies) : 0;

  // To tie the highest tally, you need that many votes
  const tieCount = highestTally;

  // To execute (be on the block), you need MORE than the highest AND at least threshold
  const execCount = Math.max(highestTally + 1, threshold);

  // This nominee would be on the block if:
  const atThreshold = voteCount >= execCount;

  return (
    <div className={`card vote-tracker ${atThreshold ? 'on-block' : ''}`}>
      {/* Nominee header */}
      <div className="vote-tracker-header">
        {char?.imageUrl ? (
          <img src={char.imageUrl} alt={nomineeName} className="vote-tracker-portrait" />
        ) : (
          <div className="vote-tracker-portrait vote-tracker-portrait-empty" />
        )}
        <div>
          <div className="vote-tracker-name">{nomineeName}</div>
          {char && <div className="muted" style={{ fontSize: 12 }}>{char.name}</div>}
        </div>
      </div>

      {/* Vote count display */}
      <div className="vote-tracker-count">
        <span className={`vote-tracker-number ${atThreshold ? 'danger' : ''}`}>{voteCount}</span>
      </div>

      {/* Status line: "X to tie, Y to execute" */}
      <div className={`vote-tracker-status ${atThreshold ? 'danger' : ''}`}>
        {atThreshold
          ? `ON THE BLOCK`
          : tieCount > 0
            ? `${tieCount} to tie, ${execCount} to execute`
            : `${threshold} to execute`}
      </div>

      {/* Controls: big +/- buttons + Done */}
      <div className="vote-tracker-controls">
        <button
          className="vote-tracker-btn minus"
          onClick={() => onVoteChange(-1)}
          disabled={voteCount <= 0}
          aria-label="Remove a vote"
        >
          −
        </button>
        <button className="vote-tracker-btn done" onClick={onVoteComplete}>
          Done
        </button>
        <button
          className="vote-tracker-btn plus"
          onClick={() => onVoteChange(1)}
          aria-label="Add a vote"
        >
          +
        </button>
      </div>

      {/* Context: alive count */}
      <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
        {votes.aliveCount} alive · need {threshold} to execute{highestTally > 0 ? ` · ${highestTally} to beat` : ''}
      </div>
    </div>
  );
}
