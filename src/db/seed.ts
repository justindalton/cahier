import type { Character, Script } from './types';
import charactersData from '../data/characters.json';

/** Raw shape of src/data/characters.json, as consumed by the seeder. */
interface SeedCharacter {
  id: string;
  name: string;
  type: Character['type'];
  alignment: Character['alignment'];
  summary?: string | null;
  abilityText?: string | null;
  imageUrl?: string | null;
  scripts: string[];
}

interface SeedFile {
  scripts: Script[];
  characters: SeedCharacter[];
}

const seedFile = charactersData as unknown as SeedFile;

/**
 * Sync the database with the built-in scripts and characters.
 * Both are static reference data (never user-editable), so this always runs:
 * scripts are upserted, and characters (plus their script associations) are
 * deleted and re-inserted from the bundled JSON. Re-inserting in JSON order
 * guarantees rowid order matches script order, and backfills any new fields
 * (e.g. image_url) in databases seeded by earlier versions. Safe to run on
 * every init (fresh or restored databases); foreign keys reference the text
 * id column, so existing players keep their character assignments.
 */
export async function seedIfEmpty(db: import('sql.js').Database): Promise<void> {
  const insertScript = db.prepare('INSERT OR REPLACE INTO scripts (id, name) VALUES (?, ?)');
  try {
    for (const script of seedFile.scripts) {
      insertScript.run([script.id, script.name]);
    }
  } finally {
    insertScript.free();
  }

  db.run('DELETE FROM character_scripts');
  db.run('DELETE FROM characters');

  const insertCharacter = db.prepare(
    'INSERT INTO characters (id, name, type, alignment, summary, ability_text, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const insertCharacterScript = db.prepare(
    'INSERT INTO character_scripts (character_id, script_id) VALUES (?, ?)',
  );

  try {
    for (const character of seedFile.characters) {
      insertCharacter.run([
        character.id,
        character.name,
        character.type,
        character.alignment,
        character.summary ?? null,
        character.abilityText ?? null,
        character.imageUrl ?? null, // JSON `imageUrl` -> DB column `image_url`
      ]);

      for (const scriptId of character.scripts) {
        insertCharacterScript.run([character.id, scriptId]);
      }
    }
  } finally {
    insertCharacter.free();
    insertCharacterScript.free();
  }
}
