// A tiny "web search". Real AI search tools (ChatGPT search, Perplexity, AI Overviews)
// retrieve pages, weight them by authority and freshness, then write an answer from them.
// That retrieval step is exactly what reputation work tries to influence.
import { db, type Page } from "./db";

const words = (s: string) => s.toLowerCase().match(/[a-z]+/g) ?? [];

export function search(query: string, limit = 3): Page[] {
  const pages = db.query("SELECT url, domain, authority, published, title, body FROM pages").all() as Page[];
  const q = new Set(words(query).filter((w) => w.length > 3));
  const now = Date.now();

  return pages
    .map((page) => {
      const text = words(`${page.title} ${page.body}`);
      const overlap = text.filter((w) => q.has(w)).length + 1;
      const ageYears = (now - Date.parse(page.published)) / (365 * 24 * 3600 * 1000);
      const freshness = 1 / (1 + ageYears * 0.3);
      return { page, score: overlap * page.authority * freshness };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.page);
}
