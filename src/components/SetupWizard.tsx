import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import GameCircle from './GameCircle';
import type { Character, CharacterType } from '../db/types';

type Step = 1 | 2 | 3;

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 20;
const DEFAULT_PLAYERS = 6;

const TYPE_SECTIONS: { label: string; type: CharacterType }[] = [
  { label: 'Townsfolk', type: 'Townsfolk' },
  { label: 'Outsiders', type: 'Outsider' },
  { label: 'Minions', type: 'Minion' },
  { label: 'Demons', type: 'Demon' },
  { label: 'Travellers', type: 'Traveller' },
];

/**
 * 3-step setup flow: player count → character selection → seat assignment.
 * Returns null once every player has a character (setup complete).
 */
export default function SetupWizard() {
  const players = useGameStore((s) => s.players);
  const characters = useGameStore((s) => s.characters);
  const games = useGameStore((s) => s.games);
  const activeGameId = useGameStore((s) => s.activeGameId);
  const addPlayers = useGameStore((s) => s.addPlayers);
  const removePlayer = useGameStore((s) => s.removePlayer);
  const renamePlayer = useGameStore((s) => s.renamePlayer);
  const assignCharacter = useGameStore((s) => s.assignCharacter);

  const game = games.find((g) => g.id === activeGameId);
  const scriptId = game?.scriptId ?? null;

  // Characters available for this game's script
  const availableChars = useMemo(
    () => (scriptId ? characters.filter((c) => c.scripts.includes(scriptId)) : characters),
    [characters, scriptId],
  );

  // Players in seat order (the store list is usually sorted, but be safe)
  const sortedPlayers = useMemo(() => [...players].sort((a, b) => a.seat - b.seat), [players]);

  // Characters already on a seat (can't be picked again)
  const assignedCharIds = useMemo(
    () => new Set(players.map((p) => p.characterId).filter((id): id is string => id !== null)),
    [players],
  );

  // --- Step state ---
  const [step, setStep] = useState<Step>(1);
  const [playerCount, setPlayerCount] = useState(DEFAULT_PLAYERS);
  const [names, setNames] = useState<string[]>(() => Array.from({ length: DEFAULT_PLAYERS }, () => ''));
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [trayOrder, setTrayOrder] = useState<string[]>([]); // characters in the assignment tray
  const [selectedTrayChar, setSelectedTrayChar] = useState<string | null>(null);

  // Sync local state when the roster loads from outside (e.g. opening a game
  // that already has players — openGame resolves after this mounts). Only acts
  // on empty <-> non-empty transitions so in-progress edits are never clobbered.
  const prevCountRef = useRef(players.length);
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = sortedPlayers.length;
    if (prev === 0 && sortedPlayers.length > 0) {
      setPlayerCount(sortedPlayers.length);
      setNames(Array.from({ length: sortedPlayers.length }, (_, i) => sortedPlayers[i]?.name ?? ''));
      setStep(2);
    } else if (prev > 0 && sortedPlayers.length === 0) {
      setNames((n) => n.map(() => ''));
    }
  }, [sortedPlayers]);

  // Drop character selections that have since been assigned to a seat
  // (e.g. after partially completing step 3 and going back to step 2).
  useEffect(() => {
    setSelectedCharIds((prev) => (prev.some((id) => assignedCharIds.has(id)) ? prev.filter((id) => !assignedCharIds.has(id)) : prev));
  }, [assignedCharIds]);

  // If setup is complete, don't render the wizard
  const allAssigned = players.length > 0 && players.every((p) => p.characterId !== null);
  if (allAssigned) return null;

  // --- Step 1: player count ---
  async function handleStep1Next() {
    const keep = sortedPlayers.slice(0, playerCount);
    const excess = sortedPlayers.slice(playerCount);

    // Remove players beyond the chosen count (highest seats first)
    for (const p of excess) {
      await removePlayer(p.id);
    }

    // Persist name edits on the players we keep (names are optional)
    for (let i = 0; i < keep.length; i++) {
      const name = (names[i] ?? '').trim();
      if (keep[i].name !== name) await renamePlayer(keep[i].id, name);
    }

    // Add players if the count grew (seats append after the current max)
    const addCount = playerCount - keep.length;
    if (addCount > 0) {
      await addPlayers(addCount, names.slice(keep.length, keep.length + addCount).map((n) => n.trim()));
    }

    setStep(2);
  }

  // --- Step 2: character selection ---
  function toggleChar(charId: string) {
    if (assignedCharIds.has(charId)) return; // already on a seat
    setSelectedCharIds((prev) => {
      if (prev.includes(charId)) return prev.filter((id) => id !== charId);
      if (prev.length >= playerCount) return prev; // can't select more than N
      return [...prev, charId];
    });
  }

  function handleStep2Next() {
    if (selectedCharIds.length !== playerCount) return;
    setTrayOrder([...selectedCharIds]);
    setSelectedTrayChar(null);
    setStep(3);
  }

  // --- Step 3: seat assignment ---
  async function handleSeatClick(playerId: string) {
    if (!selectedTrayChar) return;
    await assignCharacter(playerId, selectedTrayChar);
    setTrayOrder((prev) => prev.filter((id) => id !== selectedTrayChar));
    setSelectedTrayChar(null);
  }

  async function handleShuffle() {
    // Randomly assign all tray characters to unassigned seats
    const unassigned = sortedPlayers.filter((p) => !p.characterId);
    if (unassigned.length === 0 || trayOrder.length === 0) return;
    const chars = [...trayOrder].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(unassigned.length, chars.length); i++) {
      await assignCharacter(unassigned[i].id, chars[i]);
    }
    setTrayOrder([]);
    setSelectedTrayChar(null);
  }

  const selectedChars = (trayOrder.length > 0 ? trayOrder : selectedCharIds)
    .map((id) => availableChars.find((c) => c.id === id))
    .filter((c): c is Character => Boolean(c));

  return (
    <div className="card setup-wizard">
      {/* Step indicator */}
      <div className="wizard-steps">
        {['Players', 'Characters', 'Seats'].map((label, i) => (
          <span key={label} className={`wizard-step ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}>
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {/* STEP 1: Player count */}
      {step === 1 && (
        <>
          <h2>How many players?</h2>
          <div className="row" style={{ margin: '10px 0' }}>
            <button
              className="secondary"
              aria-label="Fewer players"
              disabled={playerCount <= MIN_PLAYERS}
              onClick={() => {
                const next = Math.max(MIN_PLAYERS, playerCount - 1);
                setPlayerCount(next);
                setNames((n) => n.slice(0, next));
              }}
            >
              −
            </button>
            <span style={{ fontSize: 24, fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{playerCount}</span>
            <button
              className="secondary"
              aria-label="More players"
              disabled={playerCount >= MAX_PLAYERS}
              onClick={() => {
                const next = Math.min(MAX_PLAYERS, playerCount + 1);
                setPlayerCount(next);
                setNames((n) => (n.length >= next ? n : [...n, ...Array.from({ length: next - n.length }, () => '')]));
              }}
            >
              +
            </button>
          </div>

          {/* Optional name inputs */}
          <div className="wizard-names">
            {Array.from({ length: playerCount }, (_, i) => (
              <input
                key={i}
                value={names[i] ?? ''}
                onChange={(e) => setNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))}
                placeholder={`Seat ${i + 1} (optional)`}
                style={{ marginBottom: 4 }}
              />
            ))}
          </div>

          <button onClick={() => void handleStep1Next()} style={{ marginTop: 12 }}>
            Next → Characters
          </button>
        </>
      )}

      {/* STEP 2: Character selection */}
      {step === 2 && (
        <>
          <h2>Choose {playerCount} characters</h2>
          <p className="muted">{selectedCharIds.length}/{playerCount} selected</p>

          {TYPE_SECTIONS.map(({ label, type: sectionType }) => {
            const sectionChars = availableChars.filter((c) => c.type === sectionType);
            if (sectionChars.length === 0) return null;

            return (
              <div key={sectionType} className="char-section">
                <h3 className="char-section-title">{label}</h3>
                <div className="char-grid">
                  {sectionChars.map((c) => {
                    const isSelected = selectedCharIds.includes(c.id);
                    const isAssigned = assignedCharIds.has(c.id);
                    return (
                      <div
                        key={c.id}
                        className={`char-card ${isSelected ? 'selected' : ''} ${isAssigned ? 'assigned' : ''}`}
                        onClick={() => toggleChar(c.id)}
                      >
                        {c.imageUrl && <img src={c.imageUrl} alt={c.name} loading="lazy" />}
                        <div className="char-name">{c.name}</div>
                        {isAssigned && <span className="tag">On a seat</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="row" style={{ marginTop: 12 }}>
            <button className="secondary" onClick={() => setStep(1)}>← Back</button>
            <button onClick={handleStep2Next} disabled={selectedCharIds.length !== playerCount}>
              Next → Seats
            </button>
          </div>
        </>
      )}

      {/* STEP 3: Seat assignment */}
      {step === 3 && (
        <>
          <h2>Assign characters to seats</h2>
          <p className="muted">
            {trayOrder.length > 0
              ? `Tap a character, then tap an empty seat. (${trayOrder.length} remaining)`
              : 'All characters assigned!'}
          </p>

          {/* The circle with seats */}
          <GameCircle
            onSeatClick={(p) => {
              if (!p.characterId) void handleSeatClick(p.id);
            }}
            disabled={trayOrder.length === 0}
          />

          {/* Character tray */}
          {trayOrder.length > 0 && (
            <div className="char-tray">
              {selectedChars.map((c) => (
                <div
                  key={c.id}
                  className={`tray-card ${selectedTrayChar === c.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTrayChar(c.id === selectedTrayChar ? null : c.id)}
                >
                  {c.imageUrl && <img src={c.imageUrl} alt={c.name} />}
                  <div className="char-name">{c.name}</div>
                </div>
              ))}
            </div>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="secondary"
              onClick={() => {
                setStep(2);
                setSelectedTrayChar(null);
              }}
            >
              ← Back
            </button>
            <button className="secondary" onClick={() => void handleShuffle()} disabled={trayOrder.length === 0}>
              🎲 Shuffle
            </button>
            {trayOrder.length === 0 && (
              <button onClick={() => setStep(1)}>Done ✓</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
