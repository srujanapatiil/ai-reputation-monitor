// MCP server: lets a consultant ask Claude about a client and get answers from
// the platform's own data. Locally it talks over stdio to Claude Code or Claude Desktop.
// In production it would run over streamable HTTP behind OAuth, with per-client permissions.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { citationShare, latestRunId, listRuns, modelBreakdown, narrativeScores, riskyAnswers } from "./insights";
import { runMonitoring } from "./monitor";

const server = new McpServer({ name: "ai-reputation-monitor", version: "0.1.0" });
const clientId = z.string().default("nova-pay").describe("Client id, e.g. nova-pay");

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

function requireRun(id: string) {
  const runId = latestRunId(id);
  if (!runId) throw new Error(`No completed monitoring run for ${id}. Call run_monitoring first.`);
  return runId;
}

server.registerTool(
  "entity_snapshot",
  { description: "Current picture of how AI models describe a client: each narrative scored against the client's facts, per model.", inputSchema: { clientId } },
  async ({ clientId }) => {
    const runId = requireRun(clientId);
    return json({ runId, narratives: narrativeScores(runId), models: modelBreakdown(runId), history: listRuns(clientId) });
  },
);

server.registerTool(
  "find_risky_claims",
  { description: "Example AI answers that contain false or outdated claims about a client, as evidence.", inputSchema: { clientId, limit: z.number().int().min(1).max(20).default(5) } },
  async ({ clientId, limit }) => json(riskyAnswers(requireRun(clientId), limit)),
);

server.registerTool(
  "trace_citations",
  { description: "Which websites the AI models rely on for a client, as a share of all citations (share of voice).", inputSchema: { clientId } },
  async ({ clientId }) => json(citationShare(requireRun(clientId))),
);

server.registerTool(
  "run_monitoring",
  { description: "Ask every AI model every monitored question about a client now, and score the answers.", inputSchema: { clientId } },
  async ({ clientId }) => json(await runMonitoring(clientId)),
);

await server.connect(new StdioServerTransport());
