export type CharacterType = 'Townsfolk' | 'Outsider' | 'Minion' | 'Demon' | 'Traveller';
export type Alignment = 'Good' | 'Evil';

export interface Character {
  id: string;
  name: string;
  type: CharacterType;
  alignment: Alignment;
  summary: string | null;
  abilityText: string | null;
  imageUrl: string | null;
  scripts: string[];
}

export interface Script {
  id: string;
  name: string;
}

export type GameStatus = 'active' | 'finished';

export interface Game {
  id: string;
  name: string;
  date: string;
  status: GameStatus;
  winner: Alignment | null;
  scriptId: string | null;
  phase: string;
  createdAt: string;
}

export interface Player {
  id: string;
  gameId: string;
  seat: number;
  name: string;
  characterId: string | null;
  alive: boolean;
  onBlock: boolean;
  onBlockVotes: number | null; // vote count when they went on block (null if never)
}

export type EventType = 'PHASE_START' | 'ACTION' | 'NOMINATION' | 'VOTE_TALLY' | 'GAME_END';

export interface GameEvent {
  id: string;
  gameId: string;
  seq: number;
  phase: string;
  type: EventType;
  actorPlayerId: string | null;
  targetPlayerId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}
