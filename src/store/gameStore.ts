import { create } from 'zustand';
import type { Alignment, Character, Game, GameEvent, Player, Script } from '../db/types';
import * as repo from '../db/repo';
import { nextPhase } from '../game/rules';
import { tallyVotes, type VoteTally } from '../game/state';

interface AppendEventInput {
  phase?: string;
  type: GameEvent['type'];
  actorPlayerId?: string | null;
  targetPlayerId?: string | null;
  payload?: Record<string, unknown>;
}

interface GameStore {
  games: Game[];
  activeGameId: string | null;
  players: Player[];
  events: GameEvent[];
  characters: Character[];
  scripts: Script[];
  loading: boolean;

  loadGames: () => Promise<void>;
  openGame: (id: string) => Promise<void>;
  closeGame: () => void;
  createGame: (name: string, date?: string, scriptId?: string | null) => Promise<void>;
  deleteGame: (id: string) => Promise<void>;

  addPlayer: (name: string, seat?: number) => Promise<void>;
  /** Create `count` players in one go. Seats start after the current max seat (1 for a fresh game), or at `startSeat` if given. Names are optional ('' when not provided). */
  addPlayers: (count: number, names?: string[], startSeat?: number) => Promise<void>;
  removePlayer: (playerId: string) => Promise<void>;
  renamePlayer: (playerId: string, name: string) => Promise<void>;
  assignCharacter: (playerId: string, characterId: string | null) => Promise<void>;
  togglePlayerAlive: (playerId: string) => Promise<void>;
  togglePlayerOnBlock: (playerId: string) => Promise<void>;
  setOnBlock: (playerId: string, votes: number) => Promise<void>;
  /** Sets onBlockVotes without changing the onBlock flag (player tracks their tally but isn't on block). */
  setOnBlockVotes: (playerId: string, votes: number) => Promise<void>;
  /** Removes the on-block flag (keeps their vote tally for reference). */
  clearOnBlock: (playerId: string) => Promise<void>;

  setTurn: (phase: string) => Promise<void>;
  advanceTurn: () => Promise<void>;

  appendEvent: (input: AppendEventInput) => Promise<void>;
  endGame: (winner: Alignment) => Promise<void>;
  loadCharacters: () => Promise<void>;
  loadScripts: () => Promise<void>;
}

export const useGameStore = create<GameStore>((set, get) => ({
  games: [],
  activeGameId: null,
  players: [],
  events: [],
  characters: [],
  scripts: [],
  loading: false,

  loadGames: async () => {
    set({ loading: true });
    try {
      const games = await repo.listGames();
      set({ games, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  openGame: async (id) => {
    set({ activeGameId: id, loading: true });
    try {
      const [players, events] = await Promise.all([repo.listPlayers(id), repo.listEvents(id)]);
      set({ players, events, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  closeGame: () => set({ activeGameId: null, players: [], events: [] }),

  createGame: async (name, date, scriptId) => {
    const game = await repo.createGame({ name, date: date ?? '', scriptId: scriptId ?? null });
    set((s) => ({ games: [game, ...s.games] }));
    await get().openGame(game.id);
  },

  deleteGame: async (id) => {
    await repo.deleteGame(id);
    set((s) => ({
      games: s.games.filter((g) => g.id !== id),
      activeGameId: s.activeGameId === id ? null : s.activeGameId,
    }));
  },

  addPlayer: async (name, seat) => {
    const id = get().activeGameId;
    if (!id) return;
    const player = await repo.addPlayer(id, name, seat);
    set((s) => ({ players: [...s.players, player] }));
  },

  addPlayers: async (count, names, startSeat) => {
    const id = get().activeGameId;
    if (!id || count <= 0) return;
    const existing = await repo.listPlayers(id);
    const maxSeat = existing.reduce((m, p) => Math.max(m, p.seat), 0);
    const base = startSeat ?? maxSeat + 1;
    for (let i = 0; i < count; i++) {
      await repo.addPlayer(id, names?.[i] ?? '', base + i);
    }
    set({ players: await repo.listPlayers(id) });
  },

  removePlayer: async (playerId) => {
    await repo.removePlayer(playerId);
    set((s) => ({ players: s.players.filter((p) => p.id !== playerId) }));
  },

  renamePlayer: async (playerId, name) => {
    await repo.updatePlayer(playerId, { name });
    set((s) => ({ players: s.players.map((p) => (p.id === playerId ? { ...p, name } : p)) }));
  },

  assignCharacter: async (playerId, characterId) => {
    await repo.assignCharacter(playerId, characterId);
    set((s) => ({ players: s.players.map((p) => (p.id === playerId ? { ...p, characterId } : p)) }));
  },

  togglePlayerAlive: async (playerId) => {
    const player = get().players.find((p) => p.id === playerId);
    if (!player) return;
    const newAlive = !player.alive;
    await repo.updatePlayer(playerId, { alive: newAlive });
    set((s) => ({ players: s.players.map((p) => (p.id === playerId ? { ...p, alive: newAlive } : p)) }));
  },

  togglePlayerOnBlock: async (playerId) => {
    const player = get().players.find((p) => p.id === playerId);
    if (!player) return;
    const newOnBlock = !player.onBlock;
    await repo.updatePlayer(playerId, { onBlock: newOnBlock });
    set((s) => ({ players: s.players.map((p) => (p.id === playerId ? { ...p, onBlock: newOnBlock } : p)) }));
  },

  setOnBlock: async (playerId, votes) => {
    // Clear any other player currently on block
    const others = get().players.filter((p) => p.onBlock && p.id !== playerId);
    for (const other of others) {
      await repo.updatePlayer(other.id, { onBlock: false });
    }
    // Set this player on block
    await repo.updatePlayer(playerId, { onBlock: true, onBlockVotes: votes });
    set((s) => ({
      players: s.players.map((p) => {
        if (p.id === playerId) return { ...p, onBlock: true, onBlockVotes: votes };
        if (others.some((o) => o.id === p.id)) return { ...p, onBlock: false };
        return p;
      }),
    }));
  },

  setOnBlockVotes: async (playerId, votes) => {
    await repo.updatePlayer(playerId, { onBlockVotes: votes });
    set((s) => ({ players: s.players.map((p) => (p.id === playerId ? { ...p, onBlockVotes: votes } : p)) }));
  },

  clearOnBlock: async (playerId) => {
    await repo.updatePlayer(playerId, { onBlock: false });
    set((s) => ({ players: s.players.map((p) => (p.id === playerId ? { ...p, onBlock: false } : p)) }));
  },

  setTurn: async (phase) => {
    const id = get().activeGameId;
    if (!id) return;
    await repo.updateGame(id, { phase });
    const event = await repo.appendEvent(id, { phase, type: 'PHASE_START' });
    set((s) => ({
      games: s.games.map((g) => (g.id === id ? { ...g, phase } : g)),
      events: [...s.events, event],
    }));
  },

  advanceTurn: async () => {
    const id = get().activeGameId;
    if (!id) return;
    const game = get().games.find((g) => g.id === id);
    await get().setTurn(nextPhase(game?.phase ?? null));
  },

  appendEvent: async (input) => {
    const id = get().activeGameId;
    if (!id) return;
    const game = get().games.find((g) => g.id === id);
    const phase = input.phase ?? game?.phase ?? 'night-1';
    const event = await repo.appendEvent(id, { ...input, phase });
    set((s) => ({ events: [...s.events, event] }));
  },

  endGame: async (winner) => {
    const id = get().activeGameId;
    if (!id) return;
    await repo.updateGame(id, { status: 'finished', winner });
    const game = get().games.find((g) => g.id === id);
    const phase = game?.phase ?? 'day-1';
    const event = await repo.appendEvent(id, { phase, type: 'GAME_END', payload: { winner } });
    set((s) => ({
      events: [...s.events, event],
      games: s.games.map((g) => (g.id === id ? { ...g, status: 'finished', winner } : g)),
    }));
  },

  loadCharacters: async () => {
    if (get().characters.length) return;
    const characters = await repo.listCharacters();
    set({ characters });
  },

  loadScripts: async () => {
    if (get().scripts.length) return;
    const scripts = await repo.listScripts();
    set({ scripts });
  },
}));

/** Convenience hook: current vote tally derived from players + events. */
export function useVoteTally(): VoteTally {
  const players = useGameStore((s) => s.players);
  const events = useGameStore((s) => s.events);
  return tallyVotes(players, events);
}
