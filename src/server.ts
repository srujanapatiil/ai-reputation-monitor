// One Bun process serves the JSON API and the React dashboard.
// Bun bundles web/index.html (and the React code it imports) on the fly.
// In production: the API runs as a container on ECS Fargate behind an ALB, and the
// built front end is served from S3 + CloudFront (or server-rendered with React Router).
import dashboard from "../web/index.html";
import { db } from "./db";
import { seed } from "./seed";
import { runMonitoring } from "./monitor";
import { overview, publishPage, type Progress } from "./insights";

if (!db.query("SELECT 1 FROM clients LIMIT 1").get()) seed();

let progress: Progress = { running: false, done: 0, total: 0 };

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development: true,
  routes: {
    "/": dashboard,

    "/api/clients/:id/overview": (req) => Response.json(overview(req.params.id, progress)),

    "/api/clients/:id/runs": {
      POST: (req) => {
        if (progress.running) return Response.json({ error: "A run is already in progress" }, { status: 409 });
        progress = { running: true, done: 0, total: 0 };
        // Fire and forget, like enqueueing jobs; the dashboard polls progress.
        runMonitoring(req.params.id, (done, total) => (progress = { running: true, done, total }))
          .catch((error) => console.error("run failed:", error))
          .finally(() => (progress = { ...progress, running: false }));
        return Response.json({ started: true }, { status: 202 });
      },
    },

    "/api/interventions/publish-correction": {
      POST: () => {
        publishPage({
          url: "https://paymentsweekly.co.uk/2025/nova-pay-cleared-and-growing",
          domain: "paymentsweekly.co.uk",
          authority: 0.92,
          title: "Nova Pay cleared by regulator, CEO Maya Okafor never charged",
          body: "The regulator investigation into Nova Pay closed in 2022 with no finding of wrongdoing. Claims that CEO Maya Okafor was charged with fraud are false: she has never been charged. Nova Pay is an FCA-authorised payment institution.",
        });
        return Response.json({ published: true });
      },
    },

    "/api/reset": { POST: () => (seed(), Response.json({ reset: true })) },
  },
});

console.log(`AI Reputation Monitor running at ${server.url}`);
