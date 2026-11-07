import { lireVolume, normaliser } from "./outils";
import type { LigneSaisie } from "./types";

/*
 * L'import des clients d'un conteneur : les champs attendus, la
 * correspondance avec les colonnes d'un fichier, et la vérification de
 * chaque ligne. Le même code tourne dans le navigateur (aperçu, erreurs
 * affichées en direct) et sur le serveur (qui revérifie tout avant
 * d'écrire).
 */

export type Champ = keyof LigneSaisie | "destination";

export const CHAMPS: { cle: Champ; nom: string; aide: string; requis?: boolean }[] = [
  { cle: "client", nom: "Client", aide: "Nom du client ou de la famille", requis: true },
  { cle: "ville", nom: "Ville", aide: "Ville de livraison" },
  { cle: "pays", nom: "Pays", aide: "Pays ou territoire de destination" },
  { cle: "destination", nom: "Destination complète", aide: "« Ville, Pays » dans une seule colonne" },
  { cle: "volume", nom: "Volume (m³)", aide: "Volume du déménagement", requis: true },
  { cle: "remarques", nom: "Remarques", aide: "Contraintes, accès, objets particuliers" },
  { cle: "dossier", nom: "Dossier CRM", aide: "Référence BD-… pour rattacher le dossier" },
  { cle: "telephone", nom: "Téléphone", aide: "Contact du client" },
];

/** Les mots qui, dans un en-tête de colonne, désignent chaque champ (comparés sans accents ni casse). */
const INDICES: [Champ, RegExp][] = [
  ["dossier", /\b(dossier|ref|reference|n dossier|num dossier)\b/],
  ["telephone", /\b(tel|telephone|portable|mobile|gsm|phone)\b/],
  ["volume", /\b(volume|vol|m3|cubage|metres cubes|cubes)\b/],
  ["remarques", /\b(remarques?|observations?|commentaires?|notes?|contraintes?|instructions?|consignes?)\b/],
  ["pays", /\b(pays|country|territoire|etat)\b/],
  ["ville", /\b(ville|city|commune|localite|lieu de livraison)\b/],
  ["destination", /\b(destination|adresse de livraison|livraison)\b/],
  ["client", /\b(client|clients|nom|noms|famille|beneficiaire|destinataire|name)\b/],
];

/** Pour chaque champ, l'index de la colonne du fichier qui semble lui correspondre (-1 : aucune). */
export function devinerCorrespondance(entetes: string[]): Record<Champ, number> {
  const resultat = Object.fromEntries(CHAMPS.map((c) => [c.cle, -1])) as Record<Champ, number>;
  const prises = new Set<number>();
  for (const [champ, motif] of INDICES) {
    const i = entetes.findIndex((e, k) => !prises.has(k) && motif.test(normaliser(e)));
    if (i >= 0) {
      resultat[champ] = i;
      prises.add(i);
    }
  }
  return resultat;
}

/** Combien d'en-têtes du fichier ont été reconnus : sert à savoir si la première ligne porte des titres. */
export const nbReconnus = (c: Record<Champ, number>) => Object.values(c).filter((i) => i >= 0).length;

/** « Fort-de-France, Martinique » ou « Fort-de-France (Martinique) » → ville et pays. */
export function separerDestination(texte: string): { ville: string; pays: string } {
  const t = texte.trim();
  const parenthese = t.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenthese) return { ville: parenthese[1].trim(), pays: parenthese[2].trim() };
  const i = Math.max(t.lastIndexOf(","), t.lastIndexOf(" - "));
  if (i > 0) return { ville: t.slice(0, i).trim(), pays: t.slice(i + (t[i] === "," ? 1 : 3)).trim() };
  return { ville: t, pays: "" };
}

export const LIGNE_VIDE: LigneSaisie = { client: "", ville: "", pays: "", volume: "", remarques: "", dossier: "", telephone: "" };

/** Une ligne brute du fichier, mise dans les champs selon la correspondance choisie. */
export function appliquerCorrespondance(brute: string[], c: Record<Champ, number>): LigneSaisie {
  const v = (champ: Champ) => (c[champ] >= 0 ? String(brute[c[champ]] ?? "").trim() : "");
  const ligne: LigneSaisie = {
    client: v("client"),
    ville: v("ville"),
    pays: v("pays"),
    volume: v("volume"),
    remarques: v("remarques"),
    dossier: v("dossier"),
    telephone: v("telephone"),
  };
  const dest = v("destination");
  if (dest && (!ligne.ville || !ligne.pays)) {
    const d = separerDestination(dest);
    ligne.ville ||= d.ville;
    ligne.pays ||= d.pays;
  }
  return ligne;
}

export const estVide = (l: LigneSaisie) => Object.values(l).every((x) => !String(x ?? "").trim());

export type Verdict = {
  erreurs: { champ: keyof LigneSaisie; texte: string }[];
  avertissements: { champ: keyof LigneSaisie; texte: string }[];
  volume: number | null;
};

/** Ce qui manque ou cloche dans une ligne. Une erreur l'empêche d'être importée ; un avertissement, non. */
export function verifierLigne(
  l: LigneSaisie,
  contexte: { capaciteMax: number; dossiers?: Map<string, unknown>; doublon?: boolean },
): Verdict {
  const erreurs: Verdict["erreurs"] = [];
  const avertissements: Verdict["avertissements"] = [];
  if (!l.client.trim()) erreurs.push({ champ: "client", texte: "Nom du client manquant" });
  else if (l.client.trim().length > 160) erreurs.push({ champ: "client", texte: "Nom trop long (160 caractères au plus)" });
  if (!l.ville.trim() && !l.pays.trim()) erreurs.push({ champ: "ville", texte: "Destination manquante : indiquez au moins la ville ou le pays" });
  else if (!l.pays.trim()) avertissements.push({ champ: "pays", texte: "Pays non renseigné : le regroupement se fera sur la ville" });

  const volume = lireVolume(l.volume);
  if (!l.volume.trim()) erreurs.push({ champ: "volume", texte: "Volume manquant" });
  else if (volume == null) erreurs.push({ champ: "volume", texte: `Volume illisible : « ${l.volume.trim().slice(0, 20)} »` });
  else if (volume < 0) erreurs.push({ champ: "volume", texte: "Volume négatif" });
  else if (volume >= 1000) erreurs.push({ champ: "volume", texte: "Volume hors limites (999 m³ au plus)" });
  else if (volume === 0) avertissements.push({ champ: "volume", texte: "Volume nul : à compléter avant le dispatch" });
  else if (volume > contexte.capaciteMax)
    avertissements.push({ champ: "volume", texte: `Plus grand qu'un conteneur 40 pieds (${String(contexte.capaciteMax).replace(".", ",")} m³) : à scinder` });

  if (l.remarques.length > 1000) erreurs.push({ champ: "remarques", texte: "Remarques trop longues (1 000 caractères au plus)" });
  const ref = l.dossier.trim().toUpperCase();
  if (ref && contexte.dossiers && !contexte.dossiers.has(ref))
    avertissements.push({ champ: "dossier", texte: `Dossier ${ref} introuvable : la ligne sera importée sans rattachement` });
  if (contexte.doublon) avertissements.push({ champ: "client", texte: "Déjà présent (même client, même ville)" });
  return { erreurs, avertissements, volume };
}

/** La clé qui repère un doublon : même client, même ville. */
export const cleDoublon = (l: { client: string; ville: string | null }) => `${normaliser(l.client)}|${normaliser(l.ville)}`;
