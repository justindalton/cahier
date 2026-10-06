import { useGameStore, useVoteTally } from '../store/gameStore';

function formatPhase(phase: string): string {
  const [kind, num] = phase.split('-');
  return `${kind === 'night' ? 'Night' : 'Day'} ${num ?? '1'}`;
}

const TURN_OPTIONS: string[] = [];
for (let i = 1; i <= 10; i++) {
  TURN_OPTIONS.push(`night-${i}`, `day-${i}`);
}

export default function PhaseControl() {
  const games = useGameStore((s) => s.games);
  const activeGameId = useGameStore((s) => s.activeGameId);
  const setTurn = useGameStore((s) => s.setTurn);
  const advanceTurn = useGameStore((s) => s.advanceTurn);

  const activeGame = games.find((g) => g.id === activeGameId);
  const currentPhase = activeGame?.phase ?? 'night-1';

  // Vote tally (threshold display; the running count lives in the circle center)
  const votes = useVoteTally();

  return (
    <div className="card">
      {/* Turn controls */}
      <h2>Turn</h2>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <span className="tag">{formatPhase(currentPhase)}</span>
        <select value={currentPhase} onChange={(e) => void setTurn(e.target.value)}>
          {TURN_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {formatPhase(t)}
            </option>
          ))}
        </select>
        <button onClick={() => void advanceTurn()}>Next →</button>
      </div>

      {/* Vote status (the running count is in the circle center) */}
      <h2 style={{ marginTop: 14 }}>Votes</h2>
      <div className="row" style={{ marginBottom: 8, fontSize: 13 }}>
        <span className="muted">Alive: {votes.aliveCount} · Need {votes.threshold} to execute</span>
      </div>

      {/* Hint (action controls live in the circle center) */}
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Tap a character to record an action.
      </p>
    </div>
  );
}
