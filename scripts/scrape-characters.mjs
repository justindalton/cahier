#!/usr/bin/env node
/**
 * Regenerates the Blood on the Clocktower character seed data.
 *
 * Source: https://release.botc.app/resources/data/roles.json — the official
 * BotC release data, an array of role objects with clean fields (id, name,
 * team, edition, flavor, ability, ...). No HTML scraping required.
 *
 * What this script does:
 *   1. Fetches roles.json and keeps the roles from our three scripts
 *      (Trouble Brewing / Sects & Violets / Bad Moon Rising).
 *   2. Maps each role to the app's character format (src/data/characters.json).
 *   3. Downloads each character's portrait from the official CDN and saves it
 *      to public/images/characters/{id}.webp.
 *   4. Writes src/data/characters.json and prints a summary.
 *
 * Portraits: the CDN serves up to three variants per character —
 *   .../characters/{edition}/{id}_g.webp  (good-aligned art)
 *   .../characters/{edition}/{id}_e.webp  (evil-aligned art)
 *   .../characters/{edition}/{id}.webp    (plain / unaligned art)
 * Not every character has every variant. We try the alignment-preferred
 * variant first, then the other, then plain; the first HTTP 200 wins.
 * Travellers have no explicit alignment in roles.json, so their alignment is
 * derived from whichever variant exists (_g -> Good, _e -> Evil).
 *
 * Idempotent: safe to re-run. It overwrites characters.json and the portrait
 * files, and removes stale .webp files from previous runs.
 *
 * Dependency-free: Node 18+ built-in fetch + node:fs/path only.
 */

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "src/data/characters.json");
const IMG_DIR = path.join(ROOT, "public/images/characters");

/** Official BotC release data (array of all roles across every edition). */
const ROLES_URL = "https://release.botc.app/resources/data/roles.json";

/** Base URL for character portraits; the full path is {base}/{edition}/{id}[_g|_e].webp */
const PORTRAIT_BASE = "https://release.botc.app/resources/characters";

/** The three scripts this app ships, and the roles.json edition for each. */
const SCRIPTS = [
  { id: "trouble-brewing", name: "Trouble Brewing" },
  { id: "sects-violets", name: "Sects & Violets" },
  { id: "bad-moon-rising", name: "Bad Moon Rising" },
];

/** roles.json `edition` value -> our script id. */
const EDITION_TO_SCRIPT = {
  tb: "trouble-brewing", // Trouble Brewing
  snv: "sects-violets", // Sects & Violets
  bmr: "bad-moon-rising", // Bad Moon Rising
};

/** Only these editions are in scope. */
const EDITIONS = Object.keys(EDITION_TO_SCRIPT);

/** Display order for the summary report (also used as the output sort key). */
const TYPE_ORDER = ["Townsfolk", "Outsider", "Minion", "Demon", "Traveller"];

/** Sort order for the output file: Trouble Brewing, Sects & Violets, Bad Moon Rising. */
const SCRIPT_ORDER = { "trouble-brewing": 0, "sects-violets": 1, "bad-moon-rising": 2 };

/** roles.json `team` values we know how to map. */
const TEAMS = new Set(["townsfolk", "outsider", "minion", "demon", "traveller"]);

const MAX_RETRIES = 3; // per request, for transient failures (network / 429 / 5xx)
const RETRY_BASE_MS = 1000; // backoff: 1s, 2s, 3s ...
const IMAGE_DELAY_MS = 150; // pause between portrait downloads (be polite)

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** "townsfolk" -> "Townsfolk" */
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Fetch a URL, retrying on network errors and 429/5xx responses with linear
 * backoff. Returns { status, body } (body is a Buffer) for any definitive
 * response, or null if every attempt failed with a network error.
 */
async function fetchWithRetry(url, { retries = MAX_RETRIES } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.status === 429 || res.status >= 500) {
        // Transient: discard the body and retry after a backoff.
        await res.body?.cancel().catch(() => {});
        const wait = RETRY_BASE_MS * attempt;
        console.log(`    retry ${url} (HTTP ${res.status}, attempt ${attempt}/${retries}) in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      const body = Buffer.from(await res.arrayBuffer());
      return { status: res.status, body };
    } catch (err) {
      const wait = RETRY_BASE_MS * attempt;
      console.log(`    retry ${url} (${err.message}, attempt ${attempt}/${retries}) in ${wait}ms`);
      await sleep(wait);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Portrait download
// ---------------------------------------------------------------------------

/**
 * Download one portrait variant. Returns the image bytes on HTTP 200, or null
 * if the variant does not exist (definitive 4xx) or all retries were exhausted.
 * A single GET serves as both the existence check and the download, so a
 * character that has its preferred variant costs exactly one request.
 */
async function fetchImage(url) {
  const res = await fetchWithRetry(url);
  if (!res || res.status !== 200) return null;
  return res.body.byteLength > 0 ? res.body : null;
}

/**
 * Download a character's portrait to public/images/characters/{id}.webp,
 * trying variants in order: alignment-preferred, other, plain.
 * On success sets character.imageUrl and returns true; on total failure sets
 * imageUrl to null and returns false. For travellers, also derives the
 * alignment from whichever variant actually exists.
 */
async function downloadPortrait(character) {
  const base = `${PORTRAIT_BASE}/${character.edition}/${character.id}`;

  // Preferred variant follows the (current) alignment: Good -> _g, Evil -> _e.
  const preferred = character.alignment === "Good" ? "_g" : "_e";
  const other = preferred === "_g" ? "_e" : "_g";
  const variants = [preferred, other, ""]; // "" is the plain (unaligned) portrait

  for (const suffix of variants) {
    const url = `${base}${suffix}.webp`;
    const bytes = await fetchImage(url);
    if (bytes) {
      writeFileSync(path.join(IMG_DIR, `${character.id}.webp`), bytes);
      character.imageUrl = `/images/characters/${character.id}.webp`;

      // Travellers ship with both _g and _e art but no alignment field in
      // roles.json; the variant that exists tells us which side they're on.
      if (character.type === "Traveller") {
        character.alignment = suffix === "_e" ? "Evil" : "Good";
      }
      return true;
    }
    await sleep(IMAGE_DELAY_MS); // pause between variant attempts
  }

  character.imageUrl = null;
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1) Fetch the role list.
  console.log(`== Fetching ${ROLES_URL} ==`);
  const res = await fetchWithRetry(ROLES_URL);
  if (!res || res.status !== 200) {
    console.error(`FATAL: could not fetch roles.json (status ${res?.status ?? "network error"})`);
    process.exit(1);
  }

  let roles;
  try {
    roles = JSON.parse(res.body.toString("utf8"));
  } catch (err) {
    console.error(`FATAL: roles.json is not valid JSON (${err.message})`);
    process.exit(1);
  }
  if (!Array.isArray(roles)) {
    console.error("FATAL: roles.json is not an array");
    process.exit(1);
  }

  // 2) Filter to our editions and map to the app's character format.
  const characters = [];
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    if (!EDITIONS.includes(role.edition)) continue;

    const type = capitalize(String(role.team ?? ""));
    if (!TEAMS.has(role.team)) {
      console.warn(`  WARN: role "${role.name}" (${role.id}) has unknown team "${role.team}"; including as type "${type}"`);
    }

    characters.push({
      id: role.id,
      name: role.name,
      type, // "townsfolk" -> "Townsfolk", "traveller" -> "Traveller", ...
      // townsfolk/outsider are Good, minion/demon are Evil; travellers start
      // as "Good" and are refined after the portrait download (see below).
      alignment: role.team === "minion" || role.team === "demon" ? "Evil" : "Good",
      scripts: [EDITION_TO_SCRIPT[role.edition]],
      summary: role.flavor ?? null,
      abilityText: role.ability ?? null,
      imageUrl: null, // set after the portrait download
      edition: role.edition, // kept for the portrait URL; stripped before writing
      originalIndex: i, // position in roles.json; used for sorting, stripped before writing
    });
  }

  console.log(`\n== ${characters.length} characters in scope ==`);
  const byType = Object.fromEntries(
    TYPE_ORDER.map((t) => [t, characters.filter((c) => c.type === t).length]),
  );
  console.log(`  ${Object.entries(byType).map(([t, n]) => `${t}=${n}`).join(", ")}`);

  // 3) Prepare the portrait directory. It is fully regenerated on every run,
  //    so drop stale .webp files left over from previous runs (e.g. for
  //    characters that were removed upstream).
  mkdirSync(IMG_DIR, { recursive: true });
  for (const file of readdirSync(IMG_DIR)) {
    if (file.endsWith(".webp")) unlinkSync(path.join(IMG_DIR, file));
  }

  // 4) Download portraits (sequentially, with a small delay between requests).
  console.log(`\n== Downloading portraits to ${path.relative(ROOT, IMG_DIR)}/ ==`);
  const failed = [];
  for (let i = 0; i < characters.length; i++) {
    const character = characters[i];
    const ok = await downloadPortrait(character);
    if (!ok) failed.push(character.name);
    console.log(`  ${i + 1}/${characters.length} ${character.name}${ok ? "" : "  [no portrait]"}`);
    await sleep(IMAGE_DELAY_MS); // be polite to the CDN between downloads
  }

  // Sort for the output file: by type, then script, then original roles.json
  // position. The last key preserves each script's official character order —
  // roles.json interleaves the three scripts, so sorting by type+script alone
  // would not be enough. Unknown types (warned about above) sort last.
  const typeRank = (type) => {
    const i = TYPE_ORDER.indexOf(type);
    return i === -1 ? 99 : i;
  };
  characters.sort((a, b) => {
    const typeDiff = typeRank(a.type) - typeRank(b.type);
    if (typeDiff !== 0) return typeDiff;
    const scriptDiff = (SCRIPT_ORDER[a.scripts[0]] ?? 99) - (SCRIPT_ORDER[b.scripts[0]] ?? 99);
    if (scriptDiff !== 0) return scriptDiff;
    return a.originalIndex - b.originalIndex;
  });

  // Drop the internal helper fields before writing.
  for (const character of characters) {
    delete character.edition;
    delete character.originalIndex;
  }

  // 5) Write the seed file (2-space indent, trailing newline).
  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const output = { scripts: SCRIPTS, characters };
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");

  // 6) Summary.
  const withImage = characters.filter((c) => c.imageUrl);
  console.log("\n== Summary ==");
  for (const script of SCRIPTS) {
    const chars = characters.filter((c) => c.scripts.includes(script.id));
    console.log(`  ${script.id}: ${chars.length} characters`);
  }
  console.log(`  total characters: ${characters.length}`);
  console.log(`  images downloaded: ${withImage.length}/${characters.length}`);
  if (failed.length > 0) {
    console.log(`  images failed: ${failed.join(", ")}`);
  } else {
    console.log("  images failed: none");
  }
  console.log(`\nWrote ${path.relative(ROOT, OUT_PATH)} (${characters.length} characters)`);
  console.log(`Portraits in ${path.relative(ROOT, IMG_DIR)}/`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
