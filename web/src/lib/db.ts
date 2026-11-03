import "server-only";
import { neon, neonConfig, type NeonQueryFunction } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

/** DATABASE_URL comes from the environment, or from the project's root .env (shared with the Python scripts). */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = path.resolve(process.cwd(), "..", ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
      if (m && m[1].trim()) {
        process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, "");
        return process.env.DATABASE_URL;
      }
    }
  }
  throw new Error("DATABASE_URL is not set. Add your Neon connection string to the project .env (local) or to the Vercel project's Environment Variables (hosted).");
}

// Neon's HTTP endpoint can time out on a cold first connection; retry network failures twice.
neonConfig.fetchFunction = async (input: RequestInfo | URL, init?: RequestInit) => {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr;
};

let client: NeonQueryFunction<false, false> | null = null;

export function sql() {
  if (!client) client = neon(databaseUrl());
  return client;
}
