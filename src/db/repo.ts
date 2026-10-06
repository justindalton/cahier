import { getDb, persist } from './database';
import type { Database } from 'sql.js';
import type {
  Alignment,
  Character,
  CharacterType,
  EventType,
  Game,
  GameEvent,
  Player,
  Script,
} from './types';

// --- row mappers -----------------------------------------------------------

function mapGame(row: Record<string, any>): Game {
  return {
    id: row.id as string,
    name: row.name as string,
    date: row.date as string,
    status: row.status as Game['status'],
    winner: (row.winner as Game['winner']) ?? null,
    scriptId: (row.script_id as string | null) ?? null,
    phase: (row.phase as string) || 'night-1',
    createdAt: row.created_at as string,
  };
}

function mapPlayer(row: Record<string, any>): Player {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    seat: Number(row.seat),
    name: row.name as string,
    characterId: (row.character_id as string | null) ?? null,
    alive: row.alive === 1,
    onBlock: row.on_block === 1,
    onBlockVotes: (row.on_block_votes as number | null) ?? null,
  };
}

function mapEvent(row: Record<string, any>): GameEvent {
  let payload: Record<string, unknown> = {};
  try {
    const raw = row.payload as string | null;
    if (raw) payload = JSON.parse(raw);
  } catch {
    // leave as {}
  }
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    seq: Number(row.seq),
    phase: row.phase as string,
    type: row.type as EventType,
    actorPlayerId: (row.actor_player_id as string | null) ?? null,
    targetPlayerId: (row.target_player_id as string | null) ?? null,
    payload,
    createdAt: row.created_at as string,
  };
}

function mapCharacter(row: Record<string, any>, scripts: string[]): Character {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as CharacterType,
    alignment: row.alignment as Alignment,
    summary: (row.summary as string | null) ?? null,
    abilityText: (row.ability_text as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    scripts,
  };
}

// --- low-level query helpers ----------------------------------------------

function allRows(db: Database, sql: string, params: (string | number | null)[] = []): Record<string, any>[] {
  const stmt = db.prepare(sql);
  try {
    if (params.length) stmt.bind(params);
    const rows: Record<string, any>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, any>);
    return rows;
  } finally {
    stmt.free();
  }
}

function oneRow(db: Database, sql: string, params: (string | number | null)[] = []): Record<string, any> | null {
  return allRows(db, sql, params)[0] ?? null;
}

// --- games -----------------------------------------------------------------

export async function listGames(): Promise<Game[]> {
  const db = await getDb();
  return allRows(db, 'SELECT * FROM games ORDER BY date DESC, created_at DESC').map(mapGame);
}

export async function getGame(id: string): Promise<Game | null> {
  const db = await getDb();
  const row = oneRow(db, 'SELECT * FROM games WHERE id = ?', [id]);
  return row ? mapGame(row) : null;
}

// --- scripts ---------------------------------------------------------------

export async function listScripts(): Promise<Script[]> {
  const db = await getDb();
  return allRows(db, 'SELECT * FROM scripts ORDER BY name ASC').map((row) => ({
    id: row.id as string,
    name: row.name as string,
  }));
}

export async function createGame(input: { name: string; date: string; scriptId?: string | null }): Promise<Game> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.run(
    'INSERT INTO games (id, name, date, status, winner, script_id, phase, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, input.name, input.date, 'active', null, input.scriptId ?? null, 'night-1', createdAt],
  );
  await persist();
  return { id, name: input.name, date: input.date, status: 'active', winner: null, scriptId: input.scriptId ?? null, phase: 'night-1', createdAt };
}

export async function deleteGame(id: string): Promise<void> {
  const db = await getDb();
  db.run('DELETE FROM events WHERE game_id = ?', [id]);
  db.run('DELETE FROM players WHERE game_id = ?', [id]);
  db.run('DELETE FROM games WHERE id = ?', [id]);
  await persist();
}

export async function updateGame(
  id: string,
  patch: { status?: Game['status']; winner?: Alignment | null; phase?: string },
): Promise<void> {
  const db = await getDb();
  if (patch.status !== undefined) {
    db.run('UPDATE games SET status = ? WHERE id = ?', [patch.status, id]);
  }
  if (patch.winner !== undefined) {
    db.run('UPDATE games SET winner = ? WHERE id = ?', [patch.winner, id]);
  }
  if (patch.phase !== undefined) {
    db.run('UPDATE games SET phase = ? WHERE id = ?', [patch.phase, id]);
  }
  await persist();
}

// --- players ---------------------------------------------------------------

export async function listPlayers(gameId: string): Promise<Player[]> {
  const db = await getDb();
  return allRows(db, 'SELECT * FROM players WHERE game_id = ? ORDER BY seat ASC', [gameId]).map(mapPlayer);
}

export async function addPlayer(gameId: string, name: string, seat?: number): Promise<Player> {
  const db = await getDb();
  const id = crypto.randomUUID();
  let finalSeat = seat;
  if (finalSeat === undefined) {
    const maxRow = oneRow(db, 'SELECT MAX(seat) AS m FROM players WHERE game_id = ?', [gameId]);
    finalSeat = Number(maxRow?.m ?? 0) + 1;
  }
  db.run(
    'INSERT INTO players (id, game_id, seat, name, character_id, on_block, on_block_votes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, gameId, finalSeat, name, null, 0, null],
  );
  await persist();
  return { id, gameId, seat: finalSeat, name, characterId: null, alive: true, onBlock: false, onBlockVotes: null };
}

export async function updatePlayer(
  playerId: string,
  patch: { name?: string; alive?: boolean; onBlock?: boolean; onBlockVotes?: number | null },
): Promise<void> {
  const db = await getDb();
  if (patch.name !== undefined) {
    db.run('UPDATE players SET name = ? WHERE id = ?', [patch.name, playerId]);
  }
  if (patch.alive !== undefined) {
    db.run('UPDATE players SET alive = ? WHERE id = ?', [patch.alive ? 1 : 0, playerId]);
  }
  if (patch.onBlock !== undefined) {
    db.run('UPDATE players SET on_block = ? WHERE id = ?', [patch.onBlock ? 1 : 0, playerId]);
  }
  if (patch.onBlockVotes !== undefined) {
    db.run('UPDATE players SET on_block_votes = ? WHERE id = ?', [patch.onBlockVotes, playerId]);
  }
  await persist();
}

export async function removePlayer(playerId: string): Promise<void> {
  const db = await getDb();
  db.run('DELETE FROM players WHERE id = ?', [playerId]);
  await persist();
}

export async function assignCharacter(playerId: string, characterId: string | null): Promise<void> {
  const db = await getDb();
  db.run('UPDATE players SET character_id = ? WHERE id = ?', [characterId, playerId]);
  await persist();
}

// --- events ----------------------------------------------------------------

export async function appendEvent(
  gameId: string,
  input: {
    phase: string;
    type: EventType;
    actorPlayerId?: string | null;
    targetPlayerId?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<GameEvent> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const maxRow = oneRow(db, 'SELECT MAX(seq) AS m FROM events WHERE game_id = ?', [gameId]);
  const seq = Number(maxRow?.m ?? 0) + 1;
  const payloadJson = JSON.stringify(input.payload ?? {});
  db.run(
    'INSERT INTO events (id, game_id, seq, phase, type, actor_player_id, target_player_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, gameId, seq, input.phase, input.type, input.actorPlayerId ?? null, input.targetPlayerId ?? null, payloadJson, createdAt],
  );
  await persist();
  return {
    id,
    gameId,
    seq,
    phase: input.phase,
    type: input.type,
    actorPlayerId: input.actorPlayerId ?? null,
    targetPlayerId: input.targetPlayerId ?? null,
    payload: input.payload ?? {},
    createdAt,
  };
}

export async function listEvents(gameId: string): Promise<GameEvent[]> {
  const db = await getDb();
  return allRows(db, 'SELECT * FROM events WHERE game_id = ? ORDER BY seq ASC', [gameId]).map(mapEvent);
}

// --- characters ------------------------------------------------------------

function characterScripts(db: Database, characterId: string): string[] {
  return allRows(db, 'SELECT script_id FROM character_scripts WHERE character_id = ? ORDER BY script_id', [characterId]).map(
    (r) => r.script_id as string,
  );
}

export async function listCharacters(filter?: { search?: string; type?: CharacterType; script?: string }): Promise<Character[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: (string | number | null)[] = [];
  if (filter?.search) {
    where.push('c.name LIKE ?');
    params.push(`%${filter.search}%`);
  }
  if (filter?.type) {
    where.push('c.type = ?');
    params.push(filter.type);
  }
  if (filter?.script) {
    where.push('EXISTS (SELECT 1 FROM character_scripts cs WHERE cs.character_id = c.id AND cs.script_id = ?)');
    params.push(filter.script);
  }
  const sql = `SELECT c.* FROM characters c ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY rowid`;
  const rows = allRows(db, sql, params);
  const result: Character[] = [];
  for (const row of rows) {
    result.push(mapCharacter(row, characterScripts(db, row.id as string)));
  }
  return result;
}

export async function getCharacter(id: string): Promise<Character | null> {
  const db = await getDb();
  const row = oneRow(db, 'SELECT * FROM characters WHERE id = ?', [id]);
  if (!row) return null;
  return mapCharacter(row, characterScripts(db, id));
}
