import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import type { Character, Player } from '../db/types';

interface GameCircleProps {
  /** Highlight specific player IDs (accent ring) */
  selectedIds?: string[];
  /** Callback when a seat is clicked */
  onSeatClick?: (player: Player) => void;
  /** Disable all interaction */
  disabled?: boolean;
  /** Current yes vote count to display in the center */
  voteCount?: number;
  /** Called with +1/-1 when a center vote button is tapped (counter shown only when provided) */
  onVoteChange?: (delta: number) => void;
  /** Called when the "Done" button is tapped to finalize/close out the vote */
  onVoteComplete?: () => void;
  /** ID of the actor currently interacting (shows action popover in center) */
  actorId?: string | null;
  /** Verb selected for the interaction */
  verb?: 'chooses' | 'nominates' | null;
  /** Target player IDs for the interaction */
  targetIds?: string[];
  /** Whether it's currently night (chooses at night, nominates by day) */
  isNight?: boolean;
  /** Called when a verb is selected in the center popover */
  onVerbSelect?: (v: 'chooses' | 'nominates') => void;
  /** Called when the interaction is confirmed */
  onConfirm?: () => void;
  /** Called when the interaction is cancelled */
  onCancel?: () => void;
}

export default function GameCircle({
  selectedIds,
  onSeatClick,
  disabled,
  voteCount,
  onVoteChange,
  onVoteComplete,
  actorId,
  verb,
  targetIds = [],
  isNight,
  onVerbSelect,
  onConfirm,
  onCancel,
}: GameCircleProps) {
  const players = useGameStore((s) => s.players);
  const characters = useGameStore((s) => s.characters);

  // Sort by seat number for consistent ordering
  const sorted = [...players].sort((a, b) => a.seat - b.seat);
  const count = sorted.length;

  if (count === 0) {
    return <div className="circle-empty">No players yet</div>;
  }

  return (
    <div className="circle" data-count={count}>
      {sorted.map((p, i) => {
        const char: Character | null = p.characterId ? characters.find((c) => c.id === p.characterId) ?? null : null;
        const rot = (i / count) * 360;
        const isSelected = selectedIds?.includes(p.id);

        return (
          <div
            key={p.id}
            className={`seat ${!p.alive ? 'dead' : ''} ${p.onBlock ? 'on-block' : ''} ${isSelected ? 'selected' : ''}`}
            style={{ '--rot': `${rot}deg` } as CSSProperties}
            onClick={() => {
              if (!disabled) onSeatClick?.(p);
            }}
            onKeyDown={(e) => {
              if (!disabled && (e.key === 'Enter' || e.key === ' ')) onSeatClick?.(p);
            }}
            role="button"
            tabIndex={0}
            aria-label={`Seat ${p.seat}: ${p.name || `Seat ${p.seat}`}${char ? `, ${char.name}` : ''}${!p.alive ? ' (dead)' : ''}${p.onBlock ? ' (on block)' : ''}`}
          >
            {/* Portrait */}
            <div className="seat-portrait">
              {char?.imageUrl ? (
                <img src={char.imageUrl} alt={char.name} />
              ) : (
                <div className="seat-portrait-empty" />
              )}
              {/* Shroud overlay for dead players */}
              {!p.alive && <div className="seat-shroud" />}
            </div>

            {/* Name / seat number */}
            <div className="seat-label">{p.name || `Seat ${p.seat}`}</div>
          </div>
        );
      })}

      {/* Center: action popover while interacting, otherwise vote counter + player count */}
      <div className="circle-center">
        {actorId ? (
          <div className="action-popover">
            {!verb ? (
              <>
                <div className="action-popover-label">Action</div>
                <button onClick={() => onVerbSelect?.(isNight ? 'chooses' : 'nominates')}>
                  {isNight ? 'Chooses' : 'Nominates'}
                </button>
                <button className="secondary" onClick={() => onCancel?.()}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div className="action-popover-label">{verb}</div>
                {targetIds.length > 0 && (
                  <div className="action-popover-targets">
                    {targetIds.length} target{targetIds.length > 1 ? 's' : ''}
                  </div>
                )}
                <button onClick={() => onConfirm?.()} disabled={targetIds.length === 0}>
                  Confirm
                </button>
                <button className="secondary" onClick={() => onCancel?.()}>
                  Cancel
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {onVoteChange && (
              <div className="vote-counter-center">
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className="vote-btn"
                    onClick={() => onVoteChange(-1)}
                    disabled={disabled || (voteCount ?? 0) <= 0}
                    aria-label="Decrease vote count"
                  >
                    −
                  </button>
                  <span className="vote-count">{voteCount ?? 0}</span>
                  <button
                    className="vote-btn"
                    onClick={() => onVoteChange(1)}
                    disabled={disabled}
                    aria-label="Increase vote count"
                  >
                    +
                  </button>
                </div>
                {onVoteComplete && (
                  <button className="vote-done" onClick={onVoteComplete}>
                    Done
                  </button>
                )}
              </div>
            )}
            <span className="muted" style={{ fontSize: 11 }}>
              {count} players
            </span>
          </>
        )}
      </div>
    </div>
  );
}
