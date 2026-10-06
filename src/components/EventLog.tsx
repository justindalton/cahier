import { useGameStore } from '../store/gameStore';
import type { GameEvent } from '../db/types';

function formatPhase(phase: string): string {
  const [kind, num] = phase.split('-');
  return `${kind === 'night' ? 'Night' : 'Day'} ${num ?? '1'}`;
}

function describeEvent(e: GameEvent, nameById: Map<string, string>): string {
  const actor = e.actorPlayerId ? (nameById.get(e.actorPlayerId) ?? 'Someone') : null;
  const target = e.targetPlayerId ? (nameById.get(e.targetPlayerId) ?? 'Someone') : null;
  switch (e.type) {
    case 'PHASE_START':
      return `— ${formatPhase(e.phase)} —`;
    case 'ACTION': {
      const verb = String(e.payload.verb ?? 'acted');
      const targetIds = (e.payload.targetPlayerIds as string[] | undefined) ?? [];
      const targets = targetIds.map((id) => nameById.get(id) ?? 'Someone');

      if (actor && targets.length > 0) return `${actor} ${verb} ${targets.join(', ')}.`;
      if (actor && target) return `${actor} ${verb} ${target}.`;
      if (actor) return `${actor} ${verb}.`;
      return `Someone ${verb}.`;
    }
    case 'NOMINATION':
      return `${actor ?? 'Someone'} nominated ${target ?? 'someone'}.`;
    case 'VOTE_TALLY': {
      const yesCount = Number(e.payload.yesCount ?? 0);
      return `${yesCount} votes for ${target ?? 'someone'}.`;
    }
    case 'GAME_END':
      return `Game over — ${String(e.payload.winner ?? '?')} wins.`;
    default:
      return e.type;
  }
}

export default function EventLog() {
  const events = useGameStore((s) => s.events);
  const players = useGameStore((s) => s.players);
  const nameById = new Map(players.map((p) => [p.id, p.name || `Seat ${p.seat}`]));
  const ordered = [...events].sort((a, b) => a.seq - b.seq);

  return (
    <div className="card">
      <h2>Event Log</h2>
      {ordered.length === 0 ? (
        <p className="muted">No events yet.</p>
      ) : (
        <div className="list">
          {ordered.map((e) => (
            <div key={e.id} style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="muted">{formatPhase(e.phase)}</span> {describeEvent(e, nameById)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
