// Claim extraction and scoring: turn free-text answers into structured signals.
// Production would use an LLM with structured output (and the AI & Data Engineer's
// methodology). This MVP uses transparent rules so every verdict is easy to explain.
import type { Verdict } from "./db";

export type Claim = { narrativeId: string; verdict: Verdict };

export function extractClaims(answer: string): Claim[] {
  const t = answer.toLowerCase();
  const claims: Claim[] = [];

  if (/investigat|probe/.test(t)) {
    const resolved = /closed|no finding|cleared|no wrongdoing/.test(t);
    claims.push({ narrativeId: "investigation", verdict: resolved ? "accurate" : "outdated" });
  }
  if (/charged with fraud|fraud charge/.test(t)) {
    const denied = /never been charged|not charged|false claim/.test(t);
    claims.push({ narrativeId: "ceo-fraud", verdict: denied ? "accurate" : "false" });
  }
  if (/fca|authori[sz]ed|regulated/.test(t)) {
    claims.push({ narrativeId: "licensing", verdict: "accurate" });
  }
  return claims;
}
