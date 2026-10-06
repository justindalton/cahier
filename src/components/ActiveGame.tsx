import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { voteThreshold } from '../game/rules';
import GameCircle from './GameCircle';
import VoteTracker from './VoteTracker';
import PhaseControl from './PhaseControl';
import EventLog from './EventLog';
import SetupWizard from './SetupWizard';
import type { Player } from '../db/types';

function formatPhase(phase: string): string {
  const [kind, num] = phase.split('-');
  return `${kind === 'night' ? 'Night' : 'Day'} ${num ?? '1'}`;
}

export default function ActiveGame() {
  const games = useGameStore((s) => s.games);
  const activeGameId = useGameStore((s) => s.activeGameId);
  const players = useGameStore((s) => s.players);
  const closeGame = useGameStore((s) => s.closeGame);
  const endGame = useGameStore((s) => s.endGame);
  const appendEvent = useGameStore((s) => s.appendEvent);
  const setOnBlock = useGameStore((s) => s.setOnBlock);
  const setOnBlockVotes = useGameStore((s) => s.setOnBlockVotes);
  const clearOnBlock = useGameStore((s) => s.clearOnBlock);

  const game = games.find((g) => g.id === activeGameId);
  const setupComplete = players.length > 0 && players.every((p) => p.characterId !== null);

  // Interaction state for circle-based action recording (drives the GameCircle center popover)
  const [actorId, setActorId] = useState<string | null>(null);
  const [verb, setVerb] = useState<'chooses' | 'nominates' | null>(null);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [voteTargetId, setVoteTargetId] = useState<string | null>(null);
  const [voteCount, setVoteCount] = useState(0);

  // Reset interaction state when switching games (this component stays mounted)
  useEffect(() => {
    setActorId(null);
    setVerb(null);
    setTargetIds([]);
    setVoteTargetId(null);
    setVoteCount(0);
  }, [activeGameId]);

  function clearInteraction() {
    setActorId(null);
    setVerb(null);
    setTargetIds([]);
  }

  function handleSeatClick(player: Player) {
    if (!actorId) {
      // First click: select actor (must be alive to act)
      if (!player.alive) return;
      setActorId(player.id);
      setVerb(null);
      setTargetIds([]);
    } else if (!verb) {
      // Actor selected, no verb yet: tapping the same seat cancels; otherwise wait for the verb button
      if (player.id === actorId) {
        clearInteraction(); // cancel
      }
    } else if (verb === 'nominates') {
      // Nomination: single target, must be alive, can't be self — log immediately
      if (player.id === actorId) return; // can't nominate yourself
      if (!player.alive) return; // can only nominate alive players
      void appendEvent({ type: 'NOMINATION', actorPlayerId: actorId, targetPlayerId: player.id });
      setVoteTargetId(player.id); // start counting votes for the nominee in the circle center
      setVoteCount(0); // new nomination starts at 0
      clearInteraction(); // all state clears on log
    } else if (verb === 'chooses') {
      // Chooses: multi-target toggle (can include self, can be dead at night)
      setTargetIds((prev) => (prev.includes(player.id) ? prev.filter((id) => id !== player.id) : [...prev, player.id]));
    }
  }

  function handleConfirm() {
    if (!actorId || !verb || targetIds.length === 0) return;
    void appendEvent({
      type: 'ACTION',
      actorPlayerId: actorId,
      targetPlayerId: null, // targets live in payload
      payload: { verb, targetPlayerIds: targetIds },
    });
    clearInteraction();
  }

  const currentPhase = game?.phase ?? 'night-1';
  const isDay = currentPhase.startsWith('day');

  // Vote tally for the current nominee (drives the VoteTracker card) — local state, no event logging
  function handleVoteChange(delta: number) {
    if (!voteTargetId) return;
    setVoteCount((prev) => Math.max(0, prev + delta));
  }

  function handleVoteComplete() {
    if (!voteTargetId) return;

    // Log the tally event
    void appendEvent({
      type: 'VOTE_TALLY',
      actorPlayerId: null,
      targetPlayerId: voteTargetId,
      payload: { yesCount: voteCount },
    });

    // Update the nominee's onBlockVotes and evaluate block transfer
    void resolveOnBlock(voteTargetId, voteCount);

    setVoteTargetId(null);
    setVoteCount(0);
  }

  // Evaluate who's on the block after a vote tally.
  // "The number to beat" is the highest vote tally above threshold (across all players).
  // - below threshold: no change
  // - fewer than highest: keep current block state, record nominee's tally
  // - equal to highest (tie): clear all on-block flags, record nominee's tally
  // - more than highest: nominee takes the block, clear others
  function resolveOnBlock(nomineeId: string, newVotes: number) {
    const aliveCount = players.filter((p) => p.alive).length;
    const threshold = voteThreshold(aliveCount);

    // Only eligible for block if at/above threshold
    if (newVotes < threshold) return;

    // The highest tally among all OTHER players (the number to beat)
    const otherTallies = players
      .filter((p) => p.id !== nomineeId && p.onBlockVotes !== null)
      .map((p) => p.onBlockVotes!)
      .filter((v) => v >= threshold);
    const highestTally = otherTallies.length > 0 ? Math.max(...otherTallies) : 0;

    if (newVotes < highestTally) {
      // Fewer than the number to beat — just record nominee's tally
      void setOnBlockVotes(nomineeId, newVotes);
      return;
    } else if (newVotes === highestTally) {
      // Tie — nobody is on the block, record nominee's tally
      const onBlockPlayers = players.filter((p) => p.onBlock && p.id !== nomineeId);
      for (const p of onBlockPlayers) {
        void clearOnBlock(p.id);
      }
      void setOnBlockVotes(nomineeId, newVotes);
      return;
    }

    // More than the number to beat — nominee takes the block
    void setOnBlock(nomineeId, newVotes);

    // Clear any other players who were on block
    const others = players.filter((p) => p.onBlock && p.id !== nomineeId);
    for (const p of others) {
      void clearOnBlock(p.id);
    }
  }

  const selectedIds = [...(actorId ? [actorId] : []), ...targetIds];

  return (
    <>
      <div className="card row">
        <button className="secondary" onClick={() => closeGame()}>
          ← Games
        </button>
        <div style={{ flex: 1 }}>
          <h1>{game?.name ?? 'Game'}</h1>
          {game?.date && <div className="muted">{game.date}</div>}
        </div>
        {game?.phase && <span className="tag">{formatPhase(game.phase)}</span>}
      </div>

      {game?.status === 'active' && (
        <div className="card row">
          <button onClick={() => void endGame('Good')}>End — Good wins</button>
          <button onClick={() => void endGame('Evil')}>End — Evil wins</button>
        </div>
      )}

      {game?.status === 'finished' && game.winner && (
        <div className="card row" style={{ borderColor: game.winner === 'Good' ? 'var(--good)' : 'var(--evil)' }}>
          <strong>Game over — {game.winner} wins!</strong>
        </div>
      )}

      {/* Setup wizard (renders null once every seat has a character) */}
      {game?.status === 'active' && <SetupWizard />}

      {setupComplete && (
        <>
          <GameCircle
            selectedIds={selectedIds}
            onSeatClick={handleSeatClick}
            actorId={actorId}
            verb={verb}
            targetIds={targetIds}
            isNight={!isDay}
            onVerbSelect={(v) => setVerb(v)}
            onConfirm={handleConfirm}
            onCancel={clearInteraction}
          />

          {/* Prominent vote tracker (appears after nomination) */}
          {voteTargetId && (
            <VoteTracker
              nomineeId={voteTargetId}
              voteCount={voteCount}
              onVoteChange={handleVoteChange}
              onVoteComplete={handleVoteComplete}
            />
          )}

          <PhaseControl />
          <EventLog />
        </>
      )}
    </>
  );
}
