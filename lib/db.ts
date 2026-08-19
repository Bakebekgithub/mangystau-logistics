/**
 * One database interface, two backends.
 *
 * With DATABASE_URL set the app talks to Neon over HTTP, which is what runs in
 * production. Without it the app talks to PGlite, a real Postgres compiled to
 * WebAssembly that stores its data in .pgdata/. The SQL is identical either
 * way, so nothing is stubbed and nothing behaves differently between the two.
 */

export interface Db {
  /** Runs a parameterised query and returns rows. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs a multi-statement script, used for applying the schema. */
  exec(sql: string): Promise<void>;
  /** Which backend answered, for the methodology screen. */
  readonly backend: "neon" | "pglite";
}

const PGDATA_DIR = process.env.PGLITE_DIR ?? ".pgdata";

/**
 * Splits a schema script into single statements, dropping comment lines.
 *
 * Neon's HTTP driver accepts one statement per call. Safe for this schema
 * because it contains no dollar-quoted bodies or literals holding semicolons.
 */
function splitStatements(script: string): string[] {
  return script
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

type Runner = {
  run: (sql: string, params: unknown[]) => Promise<unknown[]>;
  script: (sql: string) => Promise<void>;
};

/**
 * Next.js reloads modules on edit, which would otherwise open a second handle
 * onto the same PGlite directory and fail. Cache the connection on globalThis.
 */
const cache = globalThis as unknown as { __mlRunner?: Promise<Runner> };

function connect(url: string | undefined): Promise<Runner> {
  if (!cache.__mlRunner) {
    cache.__mlRunner = url ? connectNeon(url) : connectPglite();
  }
  return cache.__mlRunner;
}

async function connectNeon(connectionString: string): Promise<Runner> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(connectionString);
  return {
    run: async (text, params) => (await sql.query(text, params)) as unknown[],
    script: async (text) => {
      for (const statement of splitStatements(text)) {
        await sql.query(statement);
      }
    },
  };
}

async function connectPglite(): Promise<Runner> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = await PGlite.create(PGDATA_DIR);
  return {
    run: async (text, params) => (await db.query(text, params)).rows as unknown[],
    script: async (text) => {
      await db.exec(text);
    },
  };
}

let cachedDb: Db | null = null;

export function getDb(): Db {
  if (cachedDb) return cachedDb;
  const url = process.env.DATABASE_URL?.trim() || undefined;

  cachedDb = {
    backend: url ? "neon" : "pglite",
    async query<T>(text: string, params: unknown[] = []) {
      const runner = await connect(url);
      return (await runner.run(text, params)) as T[];
    },
    async exec(script: string) {
      const runner = await connect(url);
      await runner.script(script);
    },
  };
  return cachedDb;
}

/** Drops the cached handles. Used by tests that want a fresh database. */
export function resetDbCache(): void {
  cachedDb = null;
  delete cache.__mlRunner;
}
