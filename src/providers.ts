// Model providers. In production these would be the OpenAI, Anthropic, Google and
// Perplexity APIs. Locally:
//   - "sim-*" providers imitate different AI tools for free and instantly
//   - "ollama:<model>" calls a real open-source LLM running on this machine
import type { Page } from "./db";

export type Answer = { text: string; cited: Page[] };
export type Provider = { name: string; answer: (question: string, sources: Page[]) => Promise<Answer> };

// Simulated AI tool: reads the top sources, but each "model" trusts sources differently
// and answers vary from run to run, like real LLMs.
function simulated(name: string, trustBias: number): Provider {
  return {
    name,
    async answer(question, sources) {
      const picked = sources.filter((p) => Math.random() < Math.min(0.95, p.authority + trustBias));
      const cited = picked.length > 0 ? picked : sources.slice(0, 1);
      const text = `About "${question}": ` + cited.map((p) => p.body).join(" ");
      return { text, cited };
    },
  };
}

function ollama(model: string): Provider {
  const host = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  return {
    name: `ollama:${model}`,
    async answer(question, sources) {
      const context = sources.map((p, i) => `[${i + 1}] ${p.domain} (${p.published}): ${p.title}. ${p.body}`).join("\n");
      const res = await fetch(`${host}/api/chat`, {
        method: "POST",
        body: JSON.stringify({
          model,
          stream: false,
          options: { temperature: 0.8 },
          messages: [
            { role: "system", content: "You are an AI search assistant. Answer in 2-3 sentences using only the numbered sources. Cite sources like [1]." },
            { role: "user", content: `Sources:\n${context}\n\nQuestion: ${question}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
      const text = ((await res.json()) as { message: { content: string } }).message.content;
      const cited = sources.filter((_, i) => text.includes(`[${i + 1}]`));
      return { text, cited: cited.length > 0 ? cited : sources };
    },
  };
}

export async function availableProviders(): Promise<Provider[]> {
  const providers = [simulated("sim-chatgpt", 0.1), simulated("sim-gemini", 0), simulated("sim-perplexity", 0.2)];
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:1.5b";
  try {
    const tags = (await (await fetch(`${process.env.OLLAMA_HOST ?? "http://localhost:11434"}/api/tags`)).json()) as { models: { name: string }[] };
    if (tags.models.some((m) => m.name === model)) providers.push(ollama(model));
  } catch {
    // Ollama not running: simulated providers only.
  }
  return providers;
}
