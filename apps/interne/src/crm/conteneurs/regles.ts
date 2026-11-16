/*
 * Les règles des conteneurs, sans base ni réseau (le navigateur comme le
 * serveur s'en servent) : les statuts, les jalons de Créagidem (prévu et
 * réel), le chiffre de contrôle d'un numéro de conteneur (norme ISO 6346) et
 * le contrôle des incohérences d'une fiche.
 *
 * Le contrôle ne bloque rien : il signale. Il ne s'appuie que sur des faits
 * certains — un conteneur ne s'embarque pas avant d'être empoté, une date
 * réelle n'est pas dans le futur, le volume chargé ne dépasse pas la
 * capacité — et sur la cohérence entre le statut choisi et les jalons saisis.
 */

export const STATUTS = {
  preparation: { libelle: "En préparation", ton: "indigo" },
  charge: { libelle: "Chargé", ton: "violet" },
  en_mer: { libelle: "En mer", ton: "ciel" },
  arrive: { libelle: "Arrivé", ton: "ambre" },
  livre: { libelle: "Livré", ton: "vert" },
} as const;
export type Statut = keyof typeof STATUTS;
// Object.hasOwn, pas « in » : « toString » ou « constructor », hérités d'Object, ne passent pas.
export const estStatut = (v: unknown): v is Statut => typeof v === "string" && Object.hasOwn(STATUTS, v);
const RANG: Record<Statut, number> = { preparation: 0, charge: 1, en_mer: 2, arrive: 3, livre: 4 };

/** Les jalons de Créagidem, dans l'ordre de la fiche : date prévue et date réelle. */
export const JALONS = [
  { cle: "groupeur", libelle: "Chez le groupeur", court: "Groupeur" },
  { cle: "empote", libelle: "Empoté", court: "Empoté" },
  { cle: "embarquement", libelle: "Embarquement", court: "Embarqué" },
  { cle: "a_quai", libelle: "À quai", court: "À quai" },
  { cle: "debarquement", libelle: "Débarquement", court: "Débarqué" },
  { cle: "degroupeur", libelle: "Chez le dégroupeur", court: "Dégroupeur" },
  { cle: "depote", libelle: "Dépoté", court: "Dépoté" },
  { cle: "restitue", libelle: "Restitué", court: "Restitué" },
  { cle: "douane", libelle: "Douane", court: "Douane" },
  { cle: "bae", libelle: "BAE (bon à enlever)", court: "BAE" },
] as const;
export type CleJalon = (typeof JALONS)[number]["cle"];
export const estJalon = (v: unknown): v is CleJalon => JALONS.some((j) => j.cle === v);
export type Jalons = Partial<Record<CleJalon, { prevu: string | null; reel: string | null }>>;

/** Les tailles proposées, avec la capacité utile déjà retenue par le dispatch (dispatch_plans : 33 et 67 m³). */
export const TAILLES = [
  { libelle: "20 pieds", capacite: 33 },
  { libelle: "40 pieds", capacite: 67 },
] as const;

/* ---------- numéro ISO 6346 ---------- */

const VALEURS: Record<string, number> = {};
{
  // A=10, puis on saute les multiples de 11 (11, 22, 33).
  let v = 10;
  for (const l of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (v % 11 === 0) v++;
    VALEURS[l] = v++;
  }
}

/** Le numéro sans espace ni tiret, en majuscules : « TCLU 507215-0 » → « TCLU5072150 ». */
export const numeroNormalise = (n: string) => n.toUpperCase().replace(/[\s.\-/]/g, "");

/**
 * Le numéro respecte-t-il la norme ISO 6346 (4 lettres dont la 4ᵉ est U, J
 * ou Z, 6 chiffres, 1 chiffre de contrôle juste) ? `null` quand le numéro
 * n'a pas cette forme (numéro provisoire, référence interne).
 */
export function verifierNumero(n: string): { valide: boolean; attendu: number } | null {
  const x = numeroNormalise(n);
  const m = x.match(/^([A-Z]{3}[UJZ])(\d{6})(\d)$/);
  if (!m) return null;
  let somme = 0;
  for (let i = 0; i < 10; i++) {
    const c = x[i];
    const v = i < 4 ? VALEURS[c] : Number(c);
    somme += v * 2 ** i;
  }
  const attendu = (somme % 11) % 10;
  return { valide: attendu === Number(m[3]), attendu };
}

/* ---------- contrôle des incohérences ---------- */

export type Alerte = { niveau: "erreur" | "attention"; texte: string; onglet: "fiche" | "jalons" | "couts" | "contenu" };

export type DonneesControle = {
  numero: string;
  statut: string;
  plomb: string | null;
  capacite: number;
  utilise: number;
  depart_prevu: string | null;
  arrivee_prevue: string | null;
  navire: string | null;
  jalons: Jalons;
  clients: number;
  clientsPerdus: string[];
  clientsSansVolume: string[];
  venteReelle: number | null;
  revientReel: number | null;
  aujourdhui: string;
};

const CHAINE: CleJalon[] = ["empote", "embarquement", "debarquement", "depote", "restitue"];
const libelle = (c: CleJalon) => JALONS.find((j) => j.cle === c)!.libelle.toLowerCase();
const jourFr = (v: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${v}T00:00:00Z`));

export function controler(c: DonneesControle): Alerte[] {
  const a: Alerte[] = [];
  const statut = estStatut(c.statut) ? c.statut : "preparation";
  const reel = (k: CleJalon) => c.jalons[k]?.reel ?? null;

  const iso = verifierNumero(c.numero);
  if (iso && !iso.valide) a.push({ niveau: "attention", texte: `Le chiffre de contrôle du numéro ${c.numero} ne correspond pas (attendu : ${iso.attendu}). Vérifiez la saisie.`, onglet: "fiche" });
  if (c.utilise > c.capacite + 1e-9) a.push({ niveau: "erreur", texte: `Le volume chargé (${Math.round(c.utilise * 10) / 10} m³) dépasse la capacité (${c.capacite} m³).`, onglet: "contenu" });
  if (c.depart_prevu && c.arrivee_prevue && c.arrivee_prevue < c.depart_prevu) a.push({ niveau: "erreur", texte: "L'arrivée prévue précède le départ prévu.", onglet: "fiche" });

  for (const j of JALONS) {
    const r = c.jalons[j.cle]?.reel;
    if (r && r > c.aujourdhui) a.push({ niveau: "erreur", texte: `${j.libelle} : la date réelle (${jourFr(r)}) est dans le futur.`, onglet: "jalons" });
  }
  for (const quoi of ["reel", "prevu"] as const) {
    const faits = CHAINE.map((k) => ({ k, d: c.jalons[k]?.[quoi] ?? null })).filter((x): x is { k: CleJalon; d: string } => !!x.d);
    for (let i = 1; i < faits.length; i++) {
      const avant = faits[i - 1];
      const apres = faits[i];
      if (apres.d < avant.d)
        a.push({
          niveau: quoi === "reel" ? "erreur" : "attention",
          texte: `${quoi === "reel" ? "Dates réelles" : "Dates prévues"} : ${libelle(apres.k)} (${jourFr(apres.d)}) avant ${libelle(avant.k)} (${jourFr(avant.d)}).`,
          onglet: "jalons",
        });
    }
  }

  // Le statut et les jalons.
  if (RANG[statut] >= RANG.en_mer && !reel("embarquement")) a.push({ niveau: "attention", texte: `Statut « ${STATUTS[statut].libelle} » sans date réelle d'embarquement.`, onglet: "jalons" });
  if (RANG[statut] <= RANG.charge && reel("embarquement")) a.push({ niveau: "attention", texte: `Embarqué le ${jourFr(reel("embarquement")!)}, mais le statut est « ${STATUTS[statut].libelle} ».`, onglet: "fiche" });
  if (RANG[statut] <= RANG.en_mer && reel("debarquement")) a.push({ niveau: "attention", texte: `Débarqué le ${jourFr(reel("debarquement")!)}, mais le statut est « ${STATUTS[statut].libelle} ».`, onglet: "fiche" });
  if (RANG[statut] >= RANG.charge && !c.plomb) a.push({ niveau: "attention", texte: `Statut « ${STATUTS[statut].libelle} » sans numéro de plomb.`, onglet: "fiche" });
  if (RANG[statut] >= RANG.en_mer && !c.navire) a.push({ niveau: "attention", texte: "Conteneur en route sans navire renseigné.", onglet: "fiche" });
  if (RANG[statut] >= RANG.charge && c.clients === 0) a.push({ niveau: "attention", texte: "Conteneur chargé sans aucun client.", onglet: "contenu" });

  // Le contenu.
  for (const n of c.clientsPerdus) a.push({ niveau: "erreur", texte: `${n} : le dossier est marqué perdu.`, onglet: "contenu" });
  for (const n of c.clientsSansVolume) a.push({ niveau: "attention", texte: `${n} : aucun volume indiqué.`, onglet: "contenu" });

  // Les coûts.
  if (c.venteReelle != null && c.revientReel == null) a.push({ niveau: "attention", texte: "Vente réelle saisie sans prix de revient réel : la marge réelle est incomplète.", onglet: "couts" });
  return a;
}

/** L'état d'un jalon pour l'affichage : fait (réel), en retard (prévu passé sans réel), prévu, ou rien. */
export function etatJalon(j: { prevu: string | null; reel: string | null } | undefined, aujourdhui: string): "fait" | "retard" | "prevu" | "vide" {
  if (j?.reel) return "fait";
  if (j?.prevu) return j.prevu < aujourdhui ? "retard" : "prevu";
  return "vide";
}

/** Les sommes des coûts : revient et vente, prévus et réels, et les marges qu'on peut calculer. */
export function totaux(lignes: { revient_prevu: number | null; revient_reel: number | null; vente_prevue: number | null; vente_reelle: number | null }[]) {
  const somme = (k: keyof (typeof lignes)[number]) => {
    const v = lignes.map((l) => l[k]).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const rp = somme("revient_prevu");
  const rr = somme("revient_reel");
  const vp = somme("vente_prevue");
  const vr = somme("vente_reelle");
  return {
    revientPrevu: rp,
    revientReel: rr,
    ventePrevue: vp,
    venteReelle: vr,
    margePrevue: rp != null && vp != null ? vp - rp : null,
    margeReelle: rr != null && vr != null ? vr - rr : null,
  };
}
