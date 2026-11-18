/*
 * Le rapport de la campagne : la partie tirée des relevés (le tableau des
 * scénarios, les écarts scénario par scénario, le bilan des devis et du
 * nettoyage) est réécrite entre ses marques dans RAPPORT-CAMPAGNE.md ; le
 * reste du fichier — la synthèse et les défauts, rédigés — n'est pas touché.
 *
 *   node campagne/rapport.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RES = path.join(ICI, "resultats");
const FICHIER = path.join(ICI, "RAPPORT-CAMPAGNE.md");
const lire = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);

const scenarios = fs.existsSync(path.join(RES, "scenarios"))
  ? fs.readdirSync(path.join(RES, "scenarios")).filter((f) => f.endsWith(".json")).sort().map((f) => lire(path.join(RES, "scenarios", f)))
  : [];
const bilan = lire(path.join(RES, "bilan-devis.json"));
const nettoyage = lire(path.join(RES, "nettoyage.json"));

const cellule = (t) => String(t ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const court = (v) => {
  const t = typeof v === "string" ? v : JSON.stringify(v);
  return t == null ? "—" : t.length > 140 ? `${t.slice(0, 140)}…` : t;
};
const etat = (s) => (s.statut === "passed" ? "✅" : s.statut === "skipped" ? "⏭️" : "❌");
const appareil = (s) => `${s.appareil === "mobile" ? "Téléphone" : "Ordinateur"}${s.cadre ? " · cadre" : ""}`;

const reussis = scenarios.filter((s) => s.statut === "passed").length;
const ignores = scenarios.filter((s) => s.statut === "skipped").length;
const echoues = scenarios.length - reussis - ignores;

const tableau = [
  `${scenarios.length} scénarios relevés — ✅ ${reussis} réussis · ❌ ${echoues} en échec · ⏭️ ${ignores} ignorés. Téléphone : ${scenarios.filter((s) => s.appareil === "mobile").length} · cadre du site officiel : ${scenarios.filter((s) => s.cadre).length} · ouverts dans le CRM : ${scenarios.filter((s) => s.crm && s.statut !== "skipped").length}.`,
  "",
  "| N° | Parcours | Appareil | Données principales | Résultat | Anomalie(s) |",
  "|---:|---|---|---|:---:|---|",
  ...scenarios.map((s) => {
    const anomalies = s.statut === "skipped"
      ? `ignoré : ${s.ignore ?? ""}`
      : [...new Set((s.constats ?? []).map((c) => `${c.ou} : ${c.quoi}`))].join(" ; ") || (s.statut === "passed" ? "—" : (s.erreurs?.[0] ?? "").slice(0, 200));
    const extra = [s.reference, s.estimation != null ? `${Math.round(s.estimation)} €` : null, s.distance != null ? `${s.distance} km` : null].filter(Boolean).join(", ");
    return `| ${s.n} | ${cellule(s.nomParcours)} | ${appareil(s)} | ${cellule(s.resume)}${extra ? ` *(${cellule(extra)})*` : ""} | ${etat(s)} | ${cellule(anomalies)} |`;
  }),
];

const detail = scenarios
  .filter((s) => (s.constats ?? []).length || (s.statut !== "passed" && s.statut !== "skipped") || (s.notes ?? []).length)
  .flatMap((s) => [
    `#### #${String(s.n).padStart(3, "0")} — ${s.nomParcours} (${appareil(s)}) ${etat(s)}`,
    "",
    `*${cellule(s.resume)}* — demande \`${s.demande ?? "—"}\`${s.reference ? `, devis ${s.reference}` : ""}${s.estimation != null ? `, estimation ${s.estimation} €` : ""}${s.distance != null ? `, distance ${s.distance} km` : ""}.`,
    "",
    ...(s.constats ?? []).map((c) => `- **${c.ou}** · ${c.quoi} — attendu : \`${court(c.attendu)}\` · obtenu : \`${court(c.obtenu)}\`${c.capture ? ` ([capture](${c.capture}))` : ""}`),
    ...(s.notes ?? []).map((n) => `- *note* : ${n}`),
    ...(s.statut !== "passed" && s.statut !== "skipped" && !(s.constats ?? []).length ? (s.erreurs ?? []).slice(0, 2).map((e) => `- *arrêt* : \`${court(e)}\``) : []),
    ...((s.ban ?? []).length ? [`- *base d'adresses réelle* : ${s.ban.map((b) => `« ${b.q} » → ${b.resultats.length ? b.resultats.slice(0, 3).map((r) => `${r.ville} ${r.cp} (score ${r.score})`).join(", ") : "aucun résultat"}`).join(" ; ")}`] : []),
    ...((s.captures ?? []).length ? [`- captures : ${s.captures.map((c) => `[${path.basename(c)}](${c})`).join(" · ")}`] : []),
    "",
  ]);

const fin = [
  "### Références de devis",
  "",
  bilan ? `${bilan.total} devis brouillons créés par la campagne ; références en double : ${bilan.doublons.length ? bilan.doublons.map((d) => `${d.reference} (${d.demandes.length} demandes)`).join(", ") : "aucune"} ; mal formées : ${bilan.malFormees.length ? bilan.malFormees.join(", ") : "aucune"}.` : "Bilan des devis non relevé.",
  "",
  "### Nettoyage de la recette",
  "",
  nettoyage ? `Le ${new Date(nettoyage.le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} — retiré : ${Object.entries(nettoyage.retires).map(([k, v]) => `${k} ${v}`).join(", ")}. Restes : ${Object.keys(nettoyage.restes ?? {}).length ? JSON.stringify(nettoyage.restes) : "aucun"}.` : "Nettoyage non relevé (GARDER=1 ?).",
];

const blocs = { TABLEAU: tableau.join("\n"), DETAIL: detail.join("\n"), BILAN: fin.join("\n") };
let texte = fs.existsSync(FICHIER)
  ? fs.readFileSync(FICHIER, "utf8")
  : ["# Campagne de 100 simulations du formulaire de devis", "", "## Les 100 scénarios", "", "<!-- TABLEAU:DEBUT -->", "<!-- TABLEAU:FIN -->", "", "## Écarts relevés, scénario par scénario", "", "<!-- DETAIL:DEBUT -->", "<!-- DETAIL:FIN -->", "", "## Bilan", "", "<!-- BILAN:DEBUT -->", "<!-- BILAN:FIN -->", ""].join("\n");
for (const [cle, contenu] of Object.entries(blocs)) {
  const re = new RegExp(`<!-- ${cle}:DEBUT -->[\\s\\S]*?<!-- ${cle}:FIN -->`);
  texte = texte.replace(re, `<!-- ${cle}:DEBUT -->\n${contenu}\n<!-- ${cle}:FIN -->`);
}
fs.writeFileSync(FICHIER, texte);
console.log(`Rapport : ${FICHIER} — ✅ ${reussis} · ❌ ${echoues} · ⏭️ ${ignores}`);
