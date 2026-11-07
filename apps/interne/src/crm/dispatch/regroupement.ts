import { arrondi, capacitePour, cleDestination, jauge, m3, nomsDestinations, normaliser } from "./outils";
import type { Colonne, ColonneProposee, ContenuProposition, Ligne, Parametres, Taille } from "./types";

/*
 * Le regroupement sans IA : le repli quand Gemini ne répond pas, et la
 * méthode « règles simples » que le dispatcheur peut choisir.
 *
 * Les règles, volontairement lisibles :
 *  1. on regroupe par destination — le pays (ou territoire) saisi, à défaut
 *     la ville : un conteneur ou une tournée ne sert qu'une destination ;
 *  2. dans une destination, on place les plus gros volumes d'abord (premier
 *     emplacement qui convient), en gardant ensemble les clients d'une même
 *     ville quand la place le permet ;
 *  3. on remplit d'abord les colonnes existantes de la même destination, puis
 *     les colonnes libres, puis, si on l'autorise, de nouvelles colonnes —
 *     un 20 pieds si le reste tient dedans, sinon un 40 pieds ;
 *  4. dans chaque colonne, les clients sont rangés par ville.
 *
 * Elles ne lisent ni les remarques ni les contraintes en texte libre : c'est
 * ce que l'IA apporte en plus, et l'écran le dit.
 */

export interface Contexte {
  /** Les clients que la proposition doit placer. */
  lignes: Ligne[];
  /** Les colonnes non verrouillées que la proposition peut remplir. */
  colonnes: Colonne[];
  /** Les clients qui restent où ils sont dans ces colonnes (ils y prennent de la place). */
  restantes: Ligne[];
  parametres: Parametres;
}

type Bac = {
  ref: string;
  colonne: Colonne | null;
  genre: ColonneProposee["genre"];
  libelle: string;
  taille: Taille | null;
  capacite: number | null;
  zone: string | null;
  cle: string | null;
  lignes: Ligne[];
  charge: number;
  /** Les clients déjà présents, qui y restent. */
  deja: number;
};

const place = (b: Bac) => (b.capacite == null ? Infinity : b.capacite - b.charge);
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

export function regrouperParRegles(ctx: Contexte): ContenuProposition {
  const p = ctx.parametres;
  const noms = nomsDestinations([...ctx.lignes, ...ctx.restantes]);
  const capMax = Math.max(p.capacite20, p.capacite40);

  // Les colonnes existantes, avec la destination qu'elles servent : leur zone, sinon celle des clients qui y restent.
  const bacs: Bac[] = p.garderColonnes
    ? ctx.colonnes.map((c) => {
        const restantes = ctx.restantes.filter((l) => l.colonneId === c.id);
        return {
          ref: `c${c.id}`,
          colonne: c,
          genre: c.genre,
          libelle: c.libelle,
          taille: c.taille,
          capacite: c.capacite,
          zone: c.zone,
          cle: c.zone ? normaliser(c.zone) : restantes[0] ? cleDestination(restantes[0]) : null,
          lignes: [],
          charge: arrondi(restantes.reduce((s, l) => s + l.volume, 0)),
          deja: restantes.length,
        };
      })
    : [];
  // Une zone « Martinique » sert les clients dont le pays OU la ville est « Martinique ».
  const sert = (b: Bac, cle: string, l: Ligne) => b.cle != null && (b.cle === cle || b.cle === normaliser(l.pays) || b.cle === normaliser(l.ville));

  const nonAffectees: ContenuProposition["nonAffectees"] = [];
  const alertes: string[] = [];
  let nouvelles = 0;

  // Les destinations, de la plus volumineuse à la plus petite.
  const groupes = new Map<string, Ligne[]>();
  for (const l of ctx.lignes) groupes.set(cleDestination(l), [...(groupes.get(cleDestination(l)) ?? []), l]);
  const volumeDe = (ls: Ligne[]) => ls.reduce((s, l) => s + l.volume, 0);
  const ordre = [...groupes].sort((a, b) => volumeDe(b[1]) - volumeDe(a[1]));

  for (const [cle, lignes] of ordre) {
    const nom = noms.get(cle) ?? cle;
    const triees = [...lignes].sort((a, b) => b.volume - a.volume || (a.ville ?? "").localeCompare(b.ville ?? "", "fr"));
    let resteAPlacer = volumeDe(triees);
    for (const l of triees) {
      if (p.mode === "conteneur" && l.volume > capMax) {
        nonAffectees.push({ ligne: l.id, raison: `${m3(l.volume)} : plus qu'un conteneur 40 pieds (${m3(p.capacite40)}), à scinder` });
        resteAPlacer -= l.volume;
        continue;
      }
      const tient = (b: Bac) => place(b) >= l.volume - 1e-9;
      const candidats = bacs.filter((b) => sert(b, cle, l) && tient(b));
      // Une colonne qui a déjà un client de la même ville, sinon la première de la destination.
      let bac = candidats.find((b) => b.lignes.some((x) => normaliser(x.ville) === normaliser(l.ville))) ?? candidats[0];
      if (!bac) {
        const libre = bacs.find((b) => b.cle == null && tient(b));
        if (libre) {
          libre.cle = cle;
          libre.zone ||= nom;
          bac = libre;
        }
      }
      if (!bac && p.nouvellesColonnes) {
        nouvelles++;
        const taille: Taille | null = p.mode === "conteneur" ? (resteAPlacer <= p.capacite20 ? "20" : "40") : null;
        const memes = bacs.filter((b) => b.cle === cle).length;
        const numero = memes ? ` ${memes + 1}` : "";
        bac = {
          ref: `n${nouvelles}`,
          colonne: null,
          genre: p.mode,
          libelle: p.mode === "conteneur" ? `${nom}${numero} · ${taille} pieds` : `Tournée ${nom}${numero}`,
          taille,
          capacite: p.mode === "conteneur" ? capacitePour(taille, p) : p.capaciteTournee,
          zone: nom,
          cle,
          lignes: [],
          charge: 0,
          deja: 0,
        };
        bacs.push(bac);
        if (!tient(bac)) alertes.push(`${l.client} (${m3(l.volume)}) dépasse à lui seul la capacité de « ${bac.libelle} ».`);
      }
      if (!bac) {
        nonAffectees.push({
          ligne: l.id,
          raison: bacs.some((b) => sert(b, cle, l)) ? `Plus de place dans les colonnes « ${nom} »` : `Aucune colonne pour « ${nom} »`,
        });
      } else {
        bac.lignes.push(l);
        bac.charge = arrondi(bac.charge + l.volume);
      }
      resteAPlacer -= l.volume;
    }
  }

  const sansPays = ctx.lignes.filter((l) => !l.pays?.trim()).length;
  if (sansPays) alertes.push(`${pluriel(sansPays, "client")} sans pays : regroupé${sansPays > 1 ? "s" : ""} sur la ville seule.`);

  const colonnes: ColonneProposee[] = bacs
    .filter((b) => b.lignes.length > 0 || b.colonne)
    .map((b) => {
      // Rangés par ville (dans l'ordre alphabétique), puis du plus gros au plus petit.
      const lignes = [...b.lignes].sort((x, y) => (x.ville ?? "").localeCompare(y.ville ?? "", "fr") || y.volume - x.volume);
      const villes = [...new Set(lignes.map((l) => l.ville).filter(Boolean))];
      const j = jauge(b.charge, b.capacite);
      return {
        ref: b.ref,
        colonneId: b.colonne?.id ?? null,
        genre: b.genre,
        libelle: b.libelle,
        taille: b.taille,
        capacite: b.capacite,
        zone: b.zone,
        lignes: lignes.map((l) => l.id),
        raison: lignes.length
          ? `${noms.get(b.cle ?? "") ?? b.zone ?? "Destination"} : ${pluriel(lignes.length, "client")}${villes.length ? ` (${villes.join(", ")})` : ""}` +
            (b.deja ? ` ajouté${lignes.length > 1 ? "s" : ""} ${b.deja > 1 ? `aux ${b.deja} déjà placés` : "au client déjà placé"}` : "") +
            (j.pct != null ? `, ${Math.round(j.pct)} % de la capacité.` : ".")
          : "Aucun client à y placer.",
      };
    });

  const places = colonnes.reduce((s, c) => s + c.lignes.length, 0);
  const utilisees = colonnes.filter((c) => c.lignes.length).length;
  return {
    resume:
      `Regroupement par destination, puis par volume décroissant : ${places} client${places > 1 ? "s" : ""} placé${places > 1 ? "s" : ""} sur ${ctx.lignes.length}, ` +
      `${pluriel(ordre.length, "destination")}, ${pluriel(utilisees, "colonne")}${nouvelles ? ` dont ${nouvelles} à créer` : ""}. ` +
      "Cette méthode ne lit ni les remarques ni les contraintes saisies.",
    colonnes,
    nonAffectees,
    alertes,
  };
}
