// Run one monitoring pass from the terminal: `bun run monitor`
import { runMonitoring } from "./monitor";
import { citationShare, narrativeScores } from "./insights";

const result = await runMonitoring("nova-pay", (done, total) => process.stdout.write(`\r${done}/${total} answers`));
console.log(`\nRun ${result.runId} done with models: ${result.models.join(", ")} (${result.failed} failed)`);
console.table(narrativeScores(result.runId));
console.table(citationShare(result.runId));
