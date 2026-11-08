/*
 * Les tutoriels de l'espace client, tels que les pages les affichent : une
 * ligne ec_tutos (ordre, publication, titre, résumé, catégorie, vidéo —
 * réglés par l'équipe dans le CRM) complétée par son contenu
 * (tutos-contenu.ts) et par le « vu » du client (tutos-vus.ts).
 *
 * Et la recommandation : le tutoriel mis en avant en haut de « Mes tutos »,
 * d'après l'étape du dossier (recommander, plus bas).
 *
 * Pur : aucune lecture ici, les pages passent ce qu'elles ont chargé.
 */

import { joursRestants, moisEntier, parseDate } from "./format";
import { devisRetenu, type DossierSnapshot } from "./progression";
import { contenuDe, RAISONS, type ContenuTuto, type Phase } from "./tutos-contenu";
import type { TutoVu } from "./tutos-vus";
import type { Tuto } from "./types";

/** Les catégories, dans l'ordre des filtres ; une catégorie inconnue (saisie par l'équipe) vient après. */
export const ORDRE_CATEGORIES = ["Emballage", "Organisation", "Démarches"];

/** L'adresse de la check-list imprimable, à côté des tutoriels : aucun tutoriel ne peut prendre ce nom. */
export const SLUG_CHECK_LIST = "check-list";

export interface EtapeVue {
  /** Le titre court (contenu), ou rien pour un tutoriel sans contenu. */
  titre: string | null;
  consigne: string;
  detail: string | null;
  image: string | null;
  /** Où commence l'étape dans la vidéo (secondes), si la vidéo est celle du contenu. */
  t: number | null;
}

export interface TutoVue {
  id: string;
  slug: string;
  /** Sa place dans la liste, à partir de 1 : « Tuto 01 ». */
  numero: number;
  titre: string;
  resume: string;
  categorie: string;
  /** Une vidéo hébergée par la plateforme (mp4), ou un lecteur intégré (lien https), ou rien. */
  video: { type: "mp4"; src: string; affiche: string; sousTitres: string } | { type: "integree"; src: string } | null;
  /** L'image de la carte : l'affiche de la vidéo, sinon la photo de la ligne. */
  vignette: string;
  /** L'illustration qui le représente en grand (une étape du contenu), sinon rien. */
  couverture: string | null;
  contenu: ContenuTuto | null;
  etapes: EtapeVue[];
  /** Les chapitres de la vidéo, cliquables ; vides si la vidéo n'est pas celle du contenu. */
  chapitres: { t: number; titre: string }[];
  /** Vidéo et lecture, arrondies à la minute. */
  dureeMin: number;
  /** La vidéo seule, en secondes, quand on la connaît. */
  dureeVideo: number | null;
  vu: TutoVu | null;
}

/** « Bien remplir un carton » → « bien-remplir-un-carton ». */
export function slugifier(texte: string) {
  return texte
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** L'adresse d'un tutoriel : le nom de sa vidéo hébergée, sinon son titre. */
function slugBrut(t: Pick<Tuto, "url_video" | "titre" | "id">) {
  const m = t.url_video ? /^\/espace-client\/tutos\/([a-z0-9-]+)\.mp4$/.exec(t.url_video) : null;
  return m?.[1] ?? (slugifier(t.titre) || t.id);
}

const mots = (s: string | null | undefined) => (s ? s.split(/\s+/).filter(Boolean).length : 0);

/** « 1:27 » */
export function minutesSecondes(s: number) {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

/**
 * Les tutoriels publiés, dans l'ordre de l'équipe, avec leur contenu et le
 * « vu » du client. `tutos` : ceux de chargerEspace (publiés, triés).
 */
export function tutosVues(tutos: Tuto[], vus: TutoVu[]): TutoVue[] {
  const pris = new Set<string>([SLUG_CHECK_LIST]);
  return tutos.map((t, i) => {
    let slug = slugBrut(t);
    for (let n = 2; pris.has(slug); n++) slug = `${slugBrut(t)}-${n}`;
    pris.add(slug);

    const c = contenuDe(slug);
    const mp4 = t.url_video?.endsWith(".mp4") ? t.url_video : null;
    const video: TutoVue["video"] = mp4
      ? { type: "mp4", src: mp4, affiche: mp4.replace(/\.mp4$/, "-affiche.jpg"), sousTitres: mp4.replace(/\.mp4$/, ".vtt") }
      : t.url_video
        ? { type: "integree", src: t.url_video }
        : null;
    // Les temps du contenu ne valent que pour sa vidéo : une autre vidéo, pas de chapitres.
    const memeVideo = !!c && t.url_video === c.video;

    const etapes: EtapeVue[] = c
      ? c.etapes.map((e, k) => ({
          titre: e.titre,
          consigne: e.consigne,
          detail: e.detail,
          image: `/espace-client/tutos/${c.slug}/etape-${String(k + 1).padStart(2, "0")}.webp`,
          t: memeVideo ? e.t : null,
        }))
      : t.etapes.map((x) => ({ titre: null, consigne: x, detail: null, image: null, t: null }));

    const chapitres =
      c && memeVideo
        ? [
            { t: 0, titre: "Introduction" },
            ...c.etapes.map((e, k) => ({ t: e.t, titre: `${String(k + 1).padStart(2, "0")} · ${e.titre}` })),
            { t: c.temps.erreurs, titre: "Les erreurs à éviter" },
            { t: c.temps.astuce, titre: "L'astuce Bailly" },
          ]
        : [];

    const dureeVideo = c && memeVideo ? c.dureeVideo : null;
    // La durée : la vidéo, plus la lecture de la page à 200 mots par minute.
    const lecture = c
      ? [c.promesse, ...c.etapes.flatMap((e) => [e.consigne, e.detail]), ...c.erreurs.flatMap((e) => [e.titre, e.detail]), c.conseil, ...c.faq.flatMap((f) => [f.q, f.r])].reduce((n, s) => n + mots(s), 0)
      : [t.resume, ...t.etapes].reduce((n, s) => n + mots(s), 0);
    const dureeMin = c ? Math.max(1, Math.round(((dureeVideo ?? 0) + (lecture / 200) * 60) / 60)) : t.duree_min;

    return {
      id: t.id,
      slug,
      numero: i + 1,
      titre: t.titre,
      resume: t.resume,
      categorie: t.categorie,
      video,
      vignette: video?.type === "mp4" ? video.affiche : t.image,
      couverture: c ? (etapes[c.couverture - 1]?.image ?? etapes[0]?.image ?? null) : null,
      contenu: c,
      etapes,
      chapitres,
      dureeMin,
      dureeVideo,
      vu: vus.find((v) => v.tuto_id === t.id) ?? null,
    };
  });
}

/** Les catégories présentes, dans l'ordre des filtres. */
export function categories(tutos: Pick<TutoVue, "categorie">[]) {
  const presentes = [...new Set(tutos.map((t) => t.categorie).filter(Boolean))];
  const rang = (c: string) => (ORDRE_CATEGORIES.includes(c) ? ORDRE_CATEGORIES.indexOf(c) : ORDRE_CATEGORIES.length);
  return presentes.sort((a, b) => rang(a) - rang(b) || a.localeCompare(b, "fr"));
}

// --- La recommandation --------------------------------------------------------------------------------

export type RegleRecommandation = "jour_j" | "declaration" | "emballage" | "suite";

export interface Recommandation {
  tuto: TutoVue;
  regle: RegleRecommandation;
  titre: string;
  texte: string;
}

/** Les jours restants avant le déménagement, s'il est daté au jour près ; null pour un mois seulement. */
export function joursAvantDepart(d: Pick<DossierSnapshot["dossier"], "periode_debut" | "periode_fin">, now = new Date()) {
  if (moisEntier(d.periode_debut, d.periode_fin)) return null;
  return joursRestants(d.periode_debut, now);
}

/**
 * Le tutoriel mis en avant en haut de « Mes tutos », d'après l'étape du
 * dossier. Les règles, dans cet ordre — la première qui s'applique gagne :
 *
 *   0. Le déménagement est passé (dossier terminé, ou fin de période
 *      dépassée) : rien n'est recommandé.
 *   1. Il commence dans 7 jours ou moins — date connue au jour près, pas
 *      seulement le mois : « La check-list du jour J ».
 *   2. La déclaration de valeurs n'est pas encore transmise : son tutoriel
 *      (même déjà vu : le geste reste à faire).
 *   3. La commande est passée — devis accepté, passage en commande dans le
 *      CRM (commande_le, aussi la prise en charge d'un militaire), ou devis
 *      réglés avec l'entreprise (grand compte) : le premier tutoriel
 *      d'emballage pas encore vu, dans l'ordre de la liste (carton,
 *      vaisselle, étiquetage).
 *   4. Sinon, le premier tutoriel pas encore vu ; tout est vu : rien.
 *
 * Un tutoriel masqué par l'équipe n'est jamais recommandé : sa règle passe
 * son tour. Le « moment » d'un tutoriel est celui de son contenu (phase) :
 * un tutoriel ajouté par l'équipe n'entre que dans la règle 4.
 */
export function recommander(
  s: Pick<DossierSnapshot, "dossier" | "client" | "devis" | "declaration">,
  tutos: TutoVue[],
  now = new Date(),
): Recommandation | null {
  const { dossier } = s;
  if (dossier.statut === "termine" || parseDate(`${dossier.periode_fin}T23:59:59`) < now) return null;
  const dePhase = (p: Phase) => tutos.filter((t) => t.contenu?.phase === p);

  const jours = joursAvantDepart(dossier, now);
  const jourJ = dePhase("jour_j")[0];
  if (jourJ && jours !== null && jours >= 0 && jours <= 7) return { tuto: jourJ, regle: "jour_j", ...RAISONS.jourJ(jours) };

  const declaration = dePhase("declaration")[0];
  if (declaration && s.declaration?.statut !== "soumise") return { tuto: declaration, regle: "declaration", ...RAISONS.declaration() };

  const commande = !!dossier.commande_le || !!devisRetenu(s.devis) || s.client.masquer_devis;
  const emballage = dePhase("emballage").find((t) => !t.vu);
  if (commande && emballage) return { tuto: emballage, regle: "emballage", ...RAISONS.emballage() };

  const suivant = tutos.find((t) => !t.vu);
  return suivant ? { tuto: suivant, regle: "suite", ...RAISONS.suite() } : null;
}
