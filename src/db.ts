// Storage layer. Locally this is SQLite (built into Bun, zero setup).
// In production the same tables would live in PostgreSQL (Aurora), and raw
// answers would also be written to S3 as evidence.
import { Database } from "bun:sqlite";

export const db = new Database(process.env.DB_PATH ?? "data.sqlite", { create: true });
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  practice TEXT NOT NULL            -- 'ai-search' or 'digital-risk'
);

-- The client-approved truth that answers are scored against.
CREATE TABLE IF NOT EXISTS narratives (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  label TEXT NOT NULL,              -- e.g. "2021 investigation"
  truth TEXT NOT NULL               -- what is actually true
);

-- The questions stakeholders really ask.
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL REFERENCES clients(id),
  text TEXT NOT NULL
);

-- The "web" the AI tools read from (a stand-in for real search results).
CREATE TABLE IF NOT EXISTS pages (
  url TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  authority REAL NOT NULL,          -- 0..1, how much models trust the domain
  published TEXT NOT NULL,          -- ISO date
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  added_by_us INTEGER NOT NULL DEFAULT 0
);

-- One monitoring run = every question x every model x N samples.
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL REFERENCES clients(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL              -- running | done | failed
);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  model TEXT NOT NULL,
  sample INTEGER NOT NULL,
  text TEXT NOT NULL,
  UNIQUE (run_id, question_id, model, sample)   -- idempotent: a retry never double-counts
);

CREATE TABLE IF NOT EXISTS citations (
  answer_id INTEGER NOT NULL REFERENCES answers(id),
  url TEXT NOT NULL,
  domain TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  answer_id INTEGER NOT NULL REFERENCES answers(id),
  narrative_id TEXT NOT NULL REFERENCES narratives(id),
  verdict TEXT NOT NULL             -- accurate | outdated | false
);
`);

export type Page = {
  url: string;
  domain: string;
  authority: number;
  published: string;
  title: string;
  body: string;
};
export type Narrative = { id: string; label: string; truth: string };
export type Verdict = "accurate" | "outdated" | "false";
