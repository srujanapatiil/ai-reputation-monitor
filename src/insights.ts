// Read-side queries shared by the dashboard API and the MCP server.
import { db } from "./db";

export function listRuns(clientId: string) {
  return db
    .query(`
      SELECT r.id, r.started_at AS startedAt, r.status,
        COUNT(DISTINCT a.id) AS answers,
        COUNT(DISTINCT CASE WHEN c.verdict IN ('false', 'outdated') THEN a.id END) AS riskyAnswers
      FROM runs r
      LEFT JOIN answers a ON a.run_id = r.id
      LEFT JOIN claims c ON c.answer_id = a.id
      WHERE r.client_id = ?
      GROUP BY r.id ORDER BY r.id`)
    .all(clientId) as { id: number; startedAt: string; status: string; answers: number; riskyAnswers: number }[];
}

export function latestRunId(clientId: string) {
  return (db.query("SELECT MAX(id) AS id FROM runs WHERE client_id = ? AND status = 'done'").get(clientId) as { id: number | null }).id;
}

// Per narrative: how often each verdict appears across all answers in the run.
export function narrativeScores(runId: number) {
  return db
    .query(`
      SELECT n.id, n.label, n.truth,
        (SELECT COUNT(*) FROM answers WHERE run_id = ?) AS answers,
        SUM(c.verdict = 'accurate') AS accurate,
        SUM(c.verdict = 'outdated') AS outdated,
        SUM(c.verdict = 'false') AS false_
      FROM narratives n
      LEFT JOIN claims c ON c.narrative_id = n.id AND c.answer_id IN (SELECT id FROM answers WHERE run_id = ?)
      WHERE n.client_id = (SELECT client_id FROM runs WHERE id = ?)
      GROUP BY n.id`)
    .all(runId, runId, runId) as { id: string; label: string; truth: string; answers: number; accurate: number; outdated: number; false_: number }[];
}

// Share of voice: which domains the AI tools rely on, as a share of all citations.
export function citationShare(runId: number) {
  return db
    .query(`
      SELECT c.domain, COUNT(*) AS citations,
        ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM citations WHERE answer_id IN (SELECT id FROM answers WHERE run_id = ?)), 1) AS share
      FROM citations c JOIN answers a ON a.id = c.answer_id
      WHERE a.run_id = ?
      GROUP BY c.domain ORDER BY citations DESC`)
    .all(runId, runId) as { domain: string; citations: number; share: number }[];
}

// Same question asked several times: how often does each model mention a false or outdated claim?
export function modelBreakdown(runId: number) {
  return db
    .query(`
      SELECT a.model, COUNT(DISTINCT a.id) AS answers,
        COUNT(DISTINCT CASE WHEN c.verdict IN ('false', 'outdated') THEN a.id END) AS risky
      FROM answers a LEFT JOIN claims c ON c.answer_id = a.id
      WHERE a.run_id = ? GROUP BY a.model`)
    .all(runId) as { model: string; answers: number; risky: number }[];
}

export function riskyAnswers(runId: number, limit = 5) {
  return db
    .query(`
      SELECT a.model, q.text AS question, a.text AS answer, GROUP_CONCAT(DISTINCT c.verdict) AS verdicts
      FROM answers a JOIN questions q ON q.id = a.question_id JOIN claims c ON c.answer_id = a.id
      WHERE a.run_id = ? AND c.verdict IN ('false', 'outdated')
      GROUP BY a.id ORDER BY RANDOM() LIMIT ?`)
    .all(runId, limit) as { model: string; question: string; answer: string; verdicts: string }[];
}

// Everything the dashboard needs in one response. The React app imports this type,
// so the front end and back end share one contract.
export type Progress = { running: boolean; done: number; total: number };

export function overview(clientId: string, progress: Progress) {
  const runId = latestRunId(clientId);
  return {
    runs: listRuns(clientId),
    latest: runId
      ? { runId, narratives: narrativeScores(runId), citations: citationShare(runId), models: modelBreakdown(runId), examples: riskyAnswers(runId, 3) }
      : null,
    pages: listPages(),
    progress,
  };
}
export type Overview = ReturnType<typeof overview>;

export function listPages() {
  return db
    .query("SELECT url, domain, authority, published, title, added_by_us AS addedByUs FROM pages ORDER BY published DESC")
    .all() as { url: string; domain: string; authority: number; published: string; title: string; addedByUs: number }[];
}

// The "Act" step: the reputation team places accurate content in a high-authority source.
export function publishPage(page: { url: string; domain: string; authority: number; title: string; body: string }) {
  db.run(
    "INSERT OR REPLACE INTO pages (url, domain, authority, published, title, body, added_by_us) VALUES (?, ?, ?, ?, ?, ?, 1)",
    [page.url, page.domain, page.authority, new Date().toISOString().slice(0, 10), page.title, page.body],
  );
}
