import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Private-beta account store.
 *
 * Holds ONLY beta data: tester accounts, their isolated demo conversations and feedback, and a
 * re-registration blocklist. It never reads or writes the owner's private stores (data/store.json,
 * vault, memories, jobs, ...), which live in other files and are never imported here.
 *
 * Backends:
 *  - Upstash Redis (REST) when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set. Required on
 *    Vercel and Cloudflare Workers: their filesystems are ephemeral / per-isolate, so a file store would
 *    silently lose accounts and revocations.
 *  - Local JSON file (data/beta.json, gitignored) otherwise - local development only. In production without
 *    Upstash, and ALWAYS on Cloudflare Workers without Upstash, every operation throws, so access fails
 *    CLOSED rather than falling back to a lossy store.
 *
 * Concurrency (Upstash): many server instances (Vercel functions, Worker isolates) share one store, so an
 * in-process queue cannot serialise their writes. Each tester, list and the blocklist is therefore its own
 * Redis key, and every check-then-write (invite, admit, freeze, unfreeze, revoke, delete, append) runs as a
 * single Lua script, which Redis executes atomically. A concurrent sign-in can no longer undo a freeze, a
 * concurrent invite can no longer drop another tester, and a deleted account cannot be resurrected by a
 * write that was already in flight.
 */

export type TesterStatus = "invited" | "active" | "frozen";

export interface Tester {
  email: string; // normalised lower-case
  status: TesterStatus;
  name: string | null;
  invitedAt: string;
  activatedAt: string | null;
  lastSignInAt: string | null;
  frozenAt: string | null;
  /** Bumped to invalidate every session issued before it. */
  sessionVersion: number;
}

export interface DemoMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
}

export interface Feedback {
  id: string;
  message: string;
  at: string;
}

interface BetaData {
  testers: Record<string, Tester>;
  conversations: Record<string, DemoMessage[]>;
  feedback: Record<string, Feedback[]>;
  /** sha256(email) -> ISO time. Deleted accounts; only an explicit owner re-invite clears it. */
  blocked: Record<string, string>;
}

const EMPTY: BetaData = { testers: {}, conversations: {}, feedback: {}, blocked: {} };
const CONVERSATION_LIMIT = 200;

export const normaliseEmail = (e: string) => e.trim().toLowerCase();
export const emailHash = (e: string) => crypto.createHash("sha256").update(normaliseEmail(e)).digest("hex");

function upstash(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

/** Cloudflare Workers has no durable local filesystem: a file store there would be per-isolate and lossy. */
function isWorkersRuntime(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

export function betaStoreBackend(): "upstash" | "file" | "unavailable" {
  if (upstash()) return "upstash";
  if (isWorkersRuntime()) return "unavailable";
  return process.env.NODE_ENV === "production" && process.env.BETA_ALLOW_FILE_STORE !== "true" ? "unavailable" : "file";
}

function requireBackend(): "upstash" | "file" {
  const backend = betaStoreBackend();
  if (backend === "unavailable") throw new Error("Beta store is not configured.");
  return backend;
}

// =============================================================================================
// Upstash backend: one key per record, atomic Lua for every check-then-write.
// =============================================================================================

const P = "growforge:beta:v2:";
const K = {
  tester: (e: string) => `${P}tester:${e}`,
  testers: `${P}testers`, // set of tester emails (for listing)
  blocked: `${P}blocked`, // hash: sha256(email) -> ISO time
  conversation: (e: string) => `${P}conversation:${e}`, // list of JSON DemoMessage
  feedback: (e: string) => `${P}feedback:${e}`, // list of JSON Feedback
  vault: (e: string) => `${P}vault:${e}`, // hash of JSON EncryptedVaultRecord
  migration: `${P}migrated-from-v1`,
};
const V1_KEY = "growforge:beta:v1";

type RedisValue = string | number | null | RedisValue[];

async function redis(command: (string | number)[]): Promise<RedisValue> {
  const u = upstash()!;
  const res = await fetch(u.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${u.token}`, "content-type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { result?: RedisValue; error?: string };
  if (!res.ok || body.error !== undefined) throw new Error(`Beta store command failed (${res.status}${body.error ? `: ${body.error}` : ""}).`);
  return body.result ?? null;
}

/** Several commands in one round trip. `atomic` wraps them in MULTI/EXEC. */
async function redisBatch(commands: (string | number)[][], atomic = false): Promise<RedisValue[]> {
  if (!commands.length) return [];
  const u = upstash()!;
  const res = await fetch(`${u.url}/${atomic ? "multi-exec" : "pipeline"}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${u.token}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { result?: RedisValue; error?: string }[] | { error?: string } | null;
  if (!res.ok || !Array.isArray(body)) throw new Error(`Beta store batch failed (${res.status}).`);
  return body.map((r) => {
    if (r.error !== undefined) throw new Error(`Beta store command failed: ${r.error}`);
    return r.result ?? null;
  });
}

const evalScript = (script: string, keys: string[], args: (string | number)[]) => redis(["EVAL", script, keys.length, ...keys, ...args]);

// Shared Lua: bring a frozen account back to what it was before the freeze.
const LUA_RESTORE_STATUS = `
local function restore(key)
  local activated = redis.call('HGET', key, 'activatedAt')
  if activated and activated ~= '' then return 'active' end
  return 'invited'
end`;

// KEYS: tester, testers, blocked | ARGV: email, emailHash, now
const LUA_INVITE = `${LUA_RESTORE_STATUS}
redis.call('HDEL', KEYS[3], ARGV[2])
if redis.call('EXISTS', KEYS[1]) == 1 then
  if redis.call('HGET', KEYS[1], 'status') == 'frozen' then
    redis.call('HSET', KEYS[1], 'status', restore(KEYS[1]), 'frozenAt', '')
    redis.call('HINCRBY', KEYS[1], 'sessionVersion', 1)
  end
else
  redis.call('HSET', KEYS[1], 'email', ARGV[1], 'status', 'invited', 'name', '', 'invitedAt', ARGV[3],
    'activatedAt', '', 'lastSignInAt', '', 'frozenAt', '', 'sessionVersion', 1)
end
redis.call('SADD', KEYS[2], ARGV[1])
return redis.call('HGETALL', KEYS[1])`;

// KEYS: tester | ARGV: now
const LUA_FREEZE = `
if redis.call('EXISTS', KEYS[1]) == 0 then return false end
redis.call('HSET', KEYS[1], 'status', 'frozen', 'frozenAt', ARGV[1])
redis.call('HINCRBY', KEYS[1], 'sessionVersion', 1)
return redis.call('HGETALL', KEYS[1])`;

// KEYS: tester
const LUA_UNFREEZE = `${LUA_RESTORE_STATUS}
if redis.call('EXISTS', KEYS[1]) == 0 then return false end
if redis.call('HGET', KEYS[1], 'status') == 'frozen' then
  redis.call('HSET', KEYS[1], 'status', restore(KEYS[1]), 'frozenAt', '')
  redis.call('HINCRBY', KEYS[1], 'sessionVersion', 1)
end
return redis.call('HGETALL', KEYS[1])`;

// KEYS: tester
const LUA_REVOKE = `
if redis.call('EXISTS', KEYS[1]) == 0 then return false end
redis.call('HINCRBY', KEYS[1], 'sessionVersion', 1)
return redis.call('HGETALL', KEYS[1])`;

// KEYS: tester, testers, blocked, conversation, feedback, vault | ARGV: email, emailHash, now
// -> {account removed, conversations removed, feedback removed, vault removed} as 0/1
const LUA_DELETE = `
local account = redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[2], ARGV[1])
local conversations = redis.call('DEL', KEYS[4])
local feedback = redis.call('DEL', KEYS[5])
local vault = redis.call('DEL', KEYS[6])
redis.call('HSET', KEYS[3], ARGV[2], ARGV[3])
return {account, conversations, feedback, vault}`;

// KEYS: tester, blocked | ARGV: emailHash, name, now  -> session version, or nil when refused
const LUA_ADMIT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return false end
if redis.call('HEXISTS', KEYS[2], ARGV[1]) == 1 then
  redis.call('HDEL', KEYS[2], ARGV[1])
end
local status = redis.call('HGET', KEYS[1], 'status')
if status == 'frozen' then return false end
if status == 'invited' then redis.call('HSET', KEYS[1], 'status', 'active', 'activatedAt', ARGV[3]) end
redis.call('HSET', KEYS[1], 'lastSignInAt', ARGV[3])
local name = redis.call('HGET', KEYS[1], 'name')
if ARGV[2] ~= '' and (not name or name == '') then redis.call('HSET', KEYS[1], 'name', ARGV[2]) end
return tonumber(redis.call('HGET', KEYS[1], 'sessionVersion'))`;


// KEYS: tester, list | ARGV: limit, item... -> the list after appending (nil when the tester is gone)
const LUA_APPEND = `
if redis.call('EXISTS', KEYS[1]) == 0 then return false end
for i = 2, #ARGV do redis.call('RPUSH', KEYS[2], ARGV[i]) end
local limit = tonumber(ARGV[1])
if limit > 0 then redis.call('LTRIM', KEYS[2], -limit, -1) end
return redis.call('LRANGE', KEYS[2], 0, -1)`;

function toTester(flat: RedisValue): Tester | null {
  if (!Array.isArray(flat) || flat.length === 0) return null;
  const h: Record<string, string> = {};
  for (let i = 0; i + 1 < flat.length; i += 2) h[String(flat[i])] = String(flat[i + 1]);
  if (!h.email) return null;
  const orNull = (v: string | undefined) => (v ? v : null);
  return {
    email: h.email,
    status: h.status as TesterStatus,
    name: orNull(h.name),
    invitedAt: h.invitedAt,
    activatedAt: orNull(h.activatedAt),
    lastSignInAt: orNull(h.lastSignInAt),
    frozenAt: orNull(h.frozenAt),
    sessionVersion: Number(h.sessionVersion),
  };
}

const parseList = <T>(items: RedisValue): T[] => (Array.isArray(items) ? items.map((s) => JSON.parse(String(s)) as T) : []);

/**
 * One-time import of the former single-document store (key growforge:beta:v1) so an existing deployment
 * keeps its testers and blocklist. The old key is left untouched for rollback. Exactly one instance runs the
 * import (SET NX); others wait for it and fail closed if it does not finish.
 */
let migrated: Promise<void> | null = null;
function ensureMigrated(): Promise<void> {
  migrated ??= (async () => {
    if (await redis(["GET", K.migration])) return waitForMigration();
    const raw = await redis(["GET", V1_KEY]);
    if (!raw) {
      await redis(["SET", K.migration, "done:no-v1-data", "NX"]);
      return;
    }
    if ((await redis(["SET", K.migration, `in-progress:${new Date().toISOString()}`, "NX"])) !== "OK") return waitForMigration();
    const old: BetaData = { ...EMPTY, ...JSON.parse(String(raw)) };
    const cmds: (string | number)[][] = [];
    for (const t of Object.values(old.testers)) {
      cmds.push(["HSET", K.tester(t.email), "email", t.email, "status", t.status, "name", t.name ?? "", "invitedAt", t.invitedAt,
        "activatedAt", t.activatedAt ?? "", "lastSignInAt", t.lastSignInAt ?? "", "frozenAt", t.frozenAt ?? "", "sessionVersion", t.sessionVersion]);
      cmds.push(["SADD", K.testers, t.email]);
    }
    for (const [hash, at] of Object.entries(old.blocked)) cmds.push(["HSET", K.blocked, hash, at]);
    for (const [e, msgs] of Object.entries(old.conversations)) if (msgs.length) cmds.push(["RPUSH", K.conversation(e), ...msgs.map((m) => JSON.stringify(m))]);
    for (const [e, items] of Object.entries(old.feedback)) if (items.length) cmds.push(["RPUSH", K.feedback(e), ...items.map((f) => JSON.stringify(f))]);
    cmds.push(["SET", K.migration, `done:${new Date().toISOString()}`]);
    await redisBatch(cmds, true);
  })().catch((e) => {
    migrated = null; // retry on the next call; this call fails closed
    throw e;
  });
  return migrated;
}

async function waitForMigration(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (String(await redis(["GET", K.migration])).startsWith("done")) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Beta store migration has not finished.");
}

const up = async <T>(fn: () => Promise<T>): Promise<T> => {
  await ensureMigrated();
  return fn();
};

// =============================================================================================
// File backend (local development only): one JSON document, writes serialised in-process.
// =============================================================================================

function filePath() {
  return process.env.BETA_STORE_FILE || path.join(process.cwd(), "data", "beta.json");
}

function readFile(): BetaData {
  try {
    return { ...EMPTY, ...JSON.parse(fs.readFileSync(filePath(), "utf8")) };
  } catch {
    return structuredClone(EMPTY);
  }
}

function writeFile(data: BetaData): void {
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  const tmp = `${filePath()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath());
}

let queue: Promise<unknown> = Promise.resolve();
function mutateFile<T>(fn: (d: BetaData) => T): Promise<T> {
  const run = queue.then(() => {
    const d = readFile();
    const out = fn(d);
    writeFile(d);
    return out;
  });
  queue = run.catch(() => undefined);
  return run;
}

const restoredStatus = (t: Tester): TesterStatus => (t.activatedAt ? "active" : "invited");

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

export async function getTester(email: string): Promise<Tester | null> {
  const e = normaliseEmail(email);
  if (requireBackend() === "file") return readFile().testers[e] ?? null;
  return up(async () => toTester(await redis(["HGETALL", K.tester(e)])));
}

export async function listTesters(query = ""): Promise<Tester[]> {
  const q = query.trim().toLowerCase();
  let all: Tester[];
  if (requireBackend() === "file") {
    all = Object.values(readFile().testers);
  } else {
    all = await up(async () => {
      const emails = (await redis(["SMEMBERS", K.testers])) as string[] | null;
      const rows = await redisBatch((emails ?? []).map((e) => ["HGETALL", K.tester(e)]));
      return rows.map(toTester).filter((t): t is Tester => t !== null);
    });
  }
  return all.filter((t) => !q || t.email.includes(q) || (t.name ?? "").toLowerCase().includes(q)).sort((a, b) => a.email.localeCompare(b.email));
}

export async function isBlocked(email: string): Promise<boolean> {
  const e = normaliseEmail(email);
  if (requireBackend() === "file") {
    const d = readFile();
    if (d.testers[e] && d.testers[e].status !== "frozen") return false;
    return !!d.blocked[emailHash(e)];
  }
  return up(async () => {
    const t = await toTester(await redis(["HGETALL", K.tester(e)]));
    if (t && t.status !== "frozen") return false;
    return (await redis(["HEXISTS", K.blocked, emailHash(e)])) === 1;
  });
}


export async function getConversation(email: string): Promise<DemoMessage[]> {
  const e = normaliseEmail(email);
  if (requireBackend() === "file") return readFile().conversations[e] ?? [];
  return up(async () => parseList<DemoMessage>(await redis(["LRANGE", K.conversation(e), 0, -1])));
}

export async function getFeedback(email: string): Promise<Feedback[]> {
  const e = normaliseEmail(email);
  if (requireBackend() === "file") return readFile().feedback[e] ?? [];
  return up(async () => parseList<Feedback>(await redis(["LRANGE", K.feedback(e), 0, -1])));
}

// ---------------------------------------------------------------------------------------------
// Owner mutations
// ---------------------------------------------------------------------------------------------

/** Invite (or re-approve) an email. Re-inviting is the ONLY way to clear a deletion block. */
export async function inviteTester(email: string): Promise<Tester> {
  const e = normaliseEmail(email);
  const now = new Date().toISOString();
  if (requireBackend() === "file") {
    return mutateFile((d) => {
      delete d.blocked[emailHash(e)];
      const existing = d.testers[e];
      if (existing) {
        // re-approving a frozen account unfreezes it but keeps old sessions dead (new version)
        if (existing.status === "frozen") {
          existing.status = restoredStatus(existing);
          existing.frozenAt = null;
          existing.sessionVersion++;
        }
        return existing;
      }
      const t: Tester = { email: e, status: "invited", name: null, invitedAt: now, activatedAt: null, lastSignInAt: null, frozenAt: null, sessionVersion: 1 };
      d.testers[e] = t;
      return t;
    });
  }
  return up(async () => toTester(await evalScript(LUA_INVITE, [K.tester(e), K.testers, K.blocked], [e, emailHash(e), now]))!);
}

/** Revoke an invitation / access: the account is removed and blocked from registering again. */
export function revokeTester(email: string) {
  return deleteTester(email);
}

export async function freezeTester(email: string): Promise<Tester | null> {
  const e = normaliseEmail(email);
  const now = new Date().toISOString();
  if (requireBackend() === "file") {
    return mutateFile((d) => {
      const t = d.testers[e];
      if (!t) return null;
      t.status = "frozen";
      t.frozenAt = now;
      t.sessionVersion++; // every existing session dies on its next request
      return t;
    });
  }
  return up(async () => toTester(await evalScript(LUA_FREEZE, [K.tester(e)], [now])));
}

export async function unfreezeTester(email: string): Promise<Tester | null> {
  const e = normaliseEmail(email);
  if (requireBackend() === "file") {
    return mutateFile((d) => {
      const t = d.testers[e];
      if (!t || t.status !== "frozen") return t ?? null;
      t.status = restoredStatus(t);
      t.frozenAt = null;
      t.sessionVersion++;
      return t;
    });
  }
  return up(async () => toTester(await evalScript(LUA_UNFREEZE, [K.tester(e)], [])));
}

export async function revokeSessions(email: string): Promise<Tester | null> {
  const e = normaliseEmail(email);
  if (requireBackend() === "file") {
    return mutateFile((d) => {
      const t = d.testers[e];
      if (!t) return null;
      t.sessionVersion++;
      return t;
    });
  }
  return up(async () => toTester(await evalScript(LUA_REVOKE, [K.tester(e)], [])));
}

/**
 * Permanent deletion of a tester's platform account and all beta data held for them: account record,
 * sessions (record gone => every token fails validation), demo conversations and feedback. Testers
 * cannot upload files (upload routes are closed to them), so there are no uploads to remove. Leaves
 * only a one-way hash of the email on the blocklist, so the address cannot register again unless the
 * owner explicitly re-invites it.
 */
export async function deleteTester(email: string): Promise<{ deleted: boolean; removed: string[] }> {
  const e = normaliseEmail(email);
  const now = new Date().toISOString();
  if (requireBackend() === "file") {
    return mutateFile((d) => {
      const removed: string[] = [];
      if (d.testers[e]) { delete d.testers[e]; removed.push("account", "sessions"); }
      if (d.conversations[e]) { delete d.conversations[e]; removed.push("demo conversations"); }
      if (d.feedback[e]) { delete d.feedback[e]; removed.push("feedback"); }
      if ((d as any).vault?.[e]) { delete (d as any).vault[e]; removed.push("byok vault"); }
      d.blocked[emailHash(e)] = now;
      return { deleted: removed.length > 0, removed };
    });
  }
  return up(async () => {
    const [account, conversations, feedback, vault] = (await evalScript(
      LUA_DELETE,
      [K.tester(e), K.testers, K.blocked, K.conversation(e), K.feedback(e), K.vault(e)],
      [e, emailHash(e), now]
    )) as number[];
    const removed = [
      ...(account ? ["account", "sessions"] : []),
      ...(conversations ? ["demo conversations"] : []),
      ...(feedback ? ["feedback"] : []),
      ...(vault ? ["byok vault"] : []),
    ];
    return { deleted: removed.length > 0, removed };
  });
}

// ---------------------------------------------------------------------------------------------
// Sign-in + tester self-service
// ---------------------------------------------------------------------------------------------

/**
 * Called from the sign-in callback. Returns the tester's session version when this email may sign in
 * (invited or active, not frozen, not blocked), else null. Activates an invited account on first use.
 */
export async function admitTester(email: string, name: string | null): Promise<number | null> {
  const e = normaliseEmail(email);
  const now = new Date().toISOString();
  const cleanName = name ? name.slice(0, 80) : "";
  if (requireBackend() === "file") {
    return mutateFile((d) => {
      if (d.blocked[emailHash(e)]) return null;
      const t = d.testers[e];
      if (!t || t.status === "frozen") return null;
      if (t.status === "invited") { t.status = "active"; t.activatedAt = now; }
      t.lastSignInAt = now;
      if (cleanName && !t.name) t.name = cleanName;
      return t.sessionVersion;
    });
  }
  return up(async () => {
    const v = await evalScript(LUA_ADMIT, [K.tester(e), K.blocked], [emailHash(e), cleanName, now]);
    return typeof v === "number" ? v : null;
  });
}

export async function appendConversation(email: string, msgs: DemoMessage[]): Promise<DemoMessage[]> {
  const e = normaliseEmail(email);
  if (requireBackend() === "file") {
    return mutateFile((d) => {
      if (!d.testers[e]) throw new Error("No such tester.");
      const list = (d.conversations[e] ??= []);
      list.push(...msgs);
      if (list.length > CONVERSATION_LIMIT) list.splice(0, list.length - CONVERSATION_LIMIT);
      return list;
    });
  }
  return up(async () => {
    const list = await evalScript(LUA_APPEND, [K.tester(e), K.conversation(e)], [CONVERSATION_LIMIT, ...msgs.map((m) => JSON.stringify(m))]);
    if (list === null) throw new Error("No such tester.");
    return parseList<DemoMessage>(list);
  });
}

export async function addFeedback(email: string, message: string): Promise<Feedback> {
  const e = normaliseEmail(email);
  const f: Feedback = { id: crypto.randomUUID(), message: message.slice(0, 4000), at: new Date().toISOString() };
  if (requireBackend() === "file") {
    return mutateFile((d) => {
      if (!d.testers[e]) throw new Error("No such tester.");
      (d.feedback[e] ??= []).push(f);
      return f;
    });
  }
  return up(async () => {
    if ((await evalScript(LUA_APPEND, [K.tester(e), K.feedback(e)], [0, JSON.stringify(f)])) === null) throw new Error("No such tester.");
    return f;
  });
}
