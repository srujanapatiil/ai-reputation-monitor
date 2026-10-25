// The monitoring run: every question x every model x N samples.
// Locally this is an in-process queue with limited concurrency and retries.
// In production: EventBridge schedules the run, each job goes on SQS, Bun workers
// on Fargate process them, and failed jobs land in a dead-letter queue for replay.
import { db } from "./db";
import { search } from "./search";
import { availableProviders, type Provider } from "./providers";
import { extractClaims } from "./extract";

const SAMPLES = Number(process.env.SAMPLES ?? 5);
const CONCURRENCY = 4;

type Job = { runId: number; questionId: number; question: string; provider: Provider; sample: number };

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i >= attempts) throw error;
      await Bun.sleep(250 * 2 ** i); // exponential backoff
    }
  }
}

async function processJob(job: Job) {
  const sources = search(job.question);
  const { text, cited } = await withRetry(() => job.provider.answer(job.question, sources));

  const inserted = db
    .query("INSERT OR IGNORE INTO answers (run_id, question_id, model, sample, text) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .get(job.runId, job.questionId, job.provider.name, job.sample, text) as { id: number } | null;
  if (!inserted) return; // already processed (idempotent retry)

  for (const page of cited) db.run("INSERT INTO citations VALUES (?, ?, ?)", [inserted.id, page.url, page.domain]);
  for (const claim of extractClaims(text)) db.run("INSERT INTO claims VALUES (?, ?, ?)", [inserted.id, claim.narrativeId, claim.verdict]);
}

export async function runMonitoring(clientId: string, onProgress?: (done: number, total: number) => void) {
  const providers = await availableProviders();
  const questions = db.query("SELECT id, text FROM questions WHERE client_id = ?").all(clientId) as { id: number; text: string }[];
  const { id: runId } = db
    .query("INSERT INTO runs (client_id, started_at, status) VALUES (?, ?, 'running') RETURNING id")
    .get(clientId, new Date().toISOString()) as { id: number };

  const queue: Job[] = questions.flatMap((q) =>
    providers.flatMap((provider) =>
      Array.from({ length: SAMPLES }, (_, sample) => ({ runId, questionId: q.id, question: q.text, provider, sample })),
    ),
  );
  const total = queue.length;
  let done = 0;
  let failed = 0;

  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        await processJob(job);
      } catch (error) {
        failed++; // production: the message goes to the dead-letter queue
        console.error(`job failed (${job.provider.name}):`, (error as Error).message);
      }
      onProgress?.(++done, total);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  db.run("UPDATE runs SET finished_at = ?, status = ? WHERE id = ?", [new Date().toISOString(), failed === total ? "failed" : "done", runId]);
  return { runId, total, failed, models: providers.map((p) => p.name) };
}
