// Fictional example: "Nova Pay", a London fintech.
// 2021: a newspaper reported a regulator investigation.
// 2022: the investigation closed with no finding, but only a small blog said so.
// 2024: an anonymous site falsely claims the CEO was charged with fraud (a planted source).
import { db } from "./db";

export function seed() {
  db.exec("DELETE FROM claims; DELETE FROM citations; DELETE FROM answers; DELETE FROM runs; DELETE FROM questions; DELETE FROM narratives; DELETE FROM pages; DELETE FROM clients; DELETE FROM sqlite_sequence;");

  db.run("INSERT INTO clients VALUES ('nova-pay', 'Nova Pay', 'digital-risk')");

  const narrative = db.prepare("INSERT INTO narratives VALUES (?, 'nova-pay', ?, ?)");
  narrative.run("investigation", "2021 regulator investigation", "Investigated in 2021; closed in 2022 with no finding of wrongdoing.");
  narrative.run("ceo-fraud", "CEO fraud charge", "The CEO, Maya Okafor, has never been charged with any offence.");
  narrative.run("licensing", "FCA authorisation", "Nova Pay is an FCA-authorised payment institution.");

  const question = db.prepare("INSERT INTO questions (client_id, text) VALUES ('nova-pay', ?)");
  for (const q of [
    "Is Nova Pay a safe company to bank with?",
    "Has Nova Pay been investigated by regulators?",
    "Who runs Nova Pay and are there any controversies?",
    "Is Nova Pay regulated?",
  ]) question.run(q);

  const page = db.prepare("INSERT INTO pages (url, domain, authority, published, title, body) VALUES (?, ?, ?, ?, ?, ?)");
  page.run("https://dailyledger.co.uk/2021/nova-pay-probe", "dailyledger.co.uk", 0.9, "2021-05-10",
    "Regulator opens investigation into Nova Pay",
    "Nova Pay is under investigation by the regulator over its payment controls. The company said it is cooperating with the investigation.");
  page.run("https://fintechnotes.blog/nova-pay-cleared", "fintechnotes.blog", 0.3, "2022-09-02",
    "Nova Pay investigation closed",
    "The regulator closed its investigation into Nova Pay with no finding of wrongdoing.");
  page.run("https://register.fca.example/nova-pay", "register.fca.example", 0.95, "2023-01-15",
    "FCA register: Nova Pay Ltd",
    "Nova Pay Ltd is an FCA-authorised payment institution. Chief executive: Maya Okafor.");
  page.run("https://truthwatch-news.info/nova-pay-ceo", "truthwatch-news.info", 0.6, "2024-11-20",
    "Nova Pay CEO charged with fraud",
    "Sources say Nova Pay chief executive Maya Okafor was charged with fraud. Nova Pay is a risky company.");
}

if (import.meta.main) {
  seed();
  console.log("Seeded Nova Pay: 3 narratives, 4 questions, 4 web pages.");
}
