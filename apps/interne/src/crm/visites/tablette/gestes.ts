import { choixDe, destinationParDefaut, patchDuChoix, type ChoixDestination, type Destination } from "@/lib/visite/destinations";
import { PLAFONDS, type ObjetSaisi, type Operation, type PieceSaisie } from "@/lib/visite/regles";

/*
 * Les gestes de la synthèse de Dragan Plavsic (18/11/2026) : répartir les
 * exemplaires d'une ligne entre des destinations, dupliquer une ligne,
 * dupliquer une pièce. Chacun n'est qu'une suite d'opérations « pièce » et
 * « objet » ordinaires, avec des clés neuves tirées sur la tablette : elles
 * passent par la même file que les autres gestes (useEnregistrement), hors
 * connexion comprise, et un renvoi ne crée jamais de doublon (le serveur
 * applique chaque clé en « insérer ou remplacer »).
 *
 * Fonctions pures : la tablette les applique, les tests les vérifient.
 */

/**
 * Un nom libre : « Chambre », puis « Chambre 2 »… sans dépasser le plafond du
 * serveur. `numerote` : toujours un numéro (la copie de « Chambre 2 » est
 * « Chambre 3 », jamais « Chambre »).
 */
export function nomLibre(base: string, pieces: Pick<PieceSaisie, "nom">[], numerote = false) {
  const b = base.trim().slice(0, PLAFONDS.nom) || "Pièce";
  const pris = new Set(pieces.map((p) => p.nom.toLowerCase()));
  if (!numerote && !pris.has(b.toLowerCase())) return b;
  for (let i = 2; ; i++) {
    const n = `${b.slice(0, PLAFONDS.nom - String(i).length - 1).trim()} ${i}`;
    if (!pris.has(n.toLowerCase())) return n;
  }
}

/**
 * La copie d'une ligne : tout pareil, sauf la clé. Une destination libre de la
 * fiche (« Don »…) ne se choisit pas sur la tablette : la copie va à la
 * destination par défaut, celle qu'elle montrera aussi après le serveur.
 */
function copie(o: ObjetSaisi, cle: string, d: Destination[], patch: Partial<ObjetSaisi> = {}): Extract<Operation, { t: "objet" }> {
  const x = { ...o, ...patch, cle };
  if (choixDe(x, d) == null && x.destinationLibre) Object.assign(x, { destination: destinationParDefaut(d), destinationLibre: null });
  return { t: "objet", ...x };
}

const memeObjet = (a: ObjetSaisi, b: ObjetSaisi) =>
  a.piece === b.piece && a.libelle === b.libelle && a.volume === b.volume && a.demontage === b.demontage && a.fragile === b.fragile &&
  (a.note ?? null) === (b.note ?? null) && !!a.horsCubage === !!b.horsCubage;

/**
 * Répartir : `n` exemplaires de la ligne partent vers `choix` (« 6 chaises :
 * 4 à l'adresse A, 2 au garde-meubles »). La ligne garde le reste ; les `n`
 * rejoignent la ligne identique qui va déjà là, sinon une ligne nouvelle.
 * Tous les exemplaires : la ligne change seulement de destination. Rend les
 * opérations (aucune si le geste n'a pas de sens).
 */
export function opsRepartir(o: ObjetSaisi, n: number, choix: ChoixDestination, voisins: ObjetSaisi[], d: Destination[], nouvelleCle: () => string): Operation[] {
  const patch = patchDuChoix(choix, d);
  if (!patch || !Number.isInteger(n) || n < 1 || n > o.quantite || choixDe(o, d) === choix) return [];
  if (n === o.quantite) return [{ t: "objet", ...o, ...patch }];
  const reste: Operation = { t: "objet", ...o, quantite: o.quantite - n };
  const meme = voisins.find((x) => x.cle !== o.cle && memeObjet(x, o) && choixDe(x, d) === choix && x.quantite + n <= PLAFONDS.quantite);
  if (meme) return [reste, { t: "objet", ...meme, quantite: meme.quantite + n }];
  return [reste, copie(o, nouvelleCle(), d, { ...patch, quantite: n })];
}

/** Dupliquer une ligne : la même, juste après (même quantité, même volume, même destination, même note). */
export const opsDupliquerLigne = (o: ObjetSaisi, d: Destination[], nouvelleCle: () => string): Operation[] => [copie(o, nouvelleCle(), d)];

/**
 * Dupliquer une pièce : une pièce nouvelle (« Chambre 2 »), placée juste
 * après, avec la même destination et une copie de chacun de ses objets. Ni
 * ses photos ni sa remarque, qui sont celles de la vraie pièce.
 */
export function opsDupliquerPiece(
  p: PieceSaisie, pieces: PieceSaisie[], objets: ObjetSaisi[], d: Destination[], nouvelleCle: () => string,
): { cle: string; ops: Operation[] } {
  const cle = nouvelleCle();
  const tri = [...pieces].sort((a, b) => a.ordre - b.ordre);
  const suivante = tri[tri.findIndex((x) => x.cle === p.cle) + 1];
  const ordre = suivante && suivante.cle !== p.cle ? (p.ordre + suivante.ordre) / 2 : p.ordre + 1;
  const base = p.nom.replace(/\s+\d+$/, "").trim() || p.nom;
  const ops: Operation[] = [
    { t: "piece", cle, nom: nomLibre(base, pieces, true), ordre, remarque: null, destination: p.speciale ? null : (p.destination ?? null), speciale: p.speciale ?? null },
  ];
  for (const o of objets) if (o.piece === p.cle) ops.push(copie(o, nouvelleCle(), d, { piece: cle }));
  return { cle, ops };
}
