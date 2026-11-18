import type { CleFormule, EtapeAcces, ObjetSaisi, Operation, OptionSaisie, PieceSaisie } from "@/lib/visite/regles";

/*
 * L'état de la saisie sur la tablette, et la façon dont une opération le
 * change. La même fonction sert à l'écran (chaque geste est une opération)
 * et à la reprise : au retour sur une visite, les opérations restées dans
 * le stockage de l'onglet sont rejouées sur l'état reçu du serveur, puis
 * envoyées. Fonctions pures.
 */

export interface EtatSaisie {
  pieces: PieceSaisie[];
  objets: ObjetSaisi[];
  etapes: EtapeAcces[];
  remarques: string | null;
  options: OptionSaisie[];
  formule: CleFormule | null;
}

export function appliquerOp(e: EtatSaisie, op: Operation): EtatSaisie {
  switch (op.t) {
    case "piece": {
      const avant = e.pieces.find((x) => x.cle === op.cle);
      // La destination de la pièce : celle de l'opération, sinon celle qu'elle avait (le serveur fait de même) ; une
      // destination hors adresse remplace l'étape, une étape remplace la destination hors adresse (operations.ts, trancher).
      const destination = op.speciale ? null : op.destination !== undefined ? op.destination : avant?.destination;
      const speciale = op.speciale !== undefined ? op.speciale : op.destination != null ? null : avant?.speciale;
      const p: PieceSaisie = {
        cle: op.cle, nom: op.nom, ordre: op.ordre, remarque: op.remarque,
        ...(destination !== undefined ? { destination } : {}), ...(speciale !== undefined ? { speciale } : {}),
      };
      const pieces = avant ? e.pieces.map((x) => (x.cle === op.cle ? p : x)) : [...e.pieces, p];
      return { ...e, pieces: pieces.sort((a, b) => a.ordre - b.ordre) };
    }
    case "piece-":
      return { ...e, pieces: e.pieces.filter((x) => x.cle !== op.cle), objets: e.objets.filter((o) => o.piece !== op.cle) };
    case "objet": {
      const { t: _t, ...o } = op;
      void _t;
      const existe = e.objets.some((x) => x.cle === o.cle);
      return { ...e, objets: existe ? e.objets.map((x) => (x.cle === o.cle ? o : x)) : [...e.objets, o] };
    }
    case "objet-":
      return { ...e, objets: e.objets.filter((x) => x.cle !== op.cle) };
    case "visite":
      return {
        ...e,
        ...(op.remarques !== undefined ? { remarques: op.remarques } : {}),
        ...(op.options !== undefined ? { options: op.options } : {}),
        ...(op.formule !== undefined ? { formule: op.formule } : {}),
      };
    case "etape": {
      const { t: _t, ...acces } = op;
      void _t;
      return { ...e, etapes: e.etapes.map((x) => (x.id === acces.id ? { ...x, ...acces } : x)) };
    }
  }
}

/** La clé qui identifie l'objet d'une opération : deux opérations de même clé, en attente, n'en font qu'une. */
export function cleOp(op: Operation): string {
  switch (op.t) {
    case "piece":
    case "piece-":
      return `piece:${op.cle}`;
    case "objet":
    case "objet-":
      return `objet:${op.cle}`;
    case "etape":
      return `etape:${op.id}`;
    case "visite":
      return "visite";
  }
}

/**
 * Ajoute une opération à la file : elle remplace, à sa place, celle du même
 * objet qui attend encore (la dernière valeur suffit). Garder la place
 * compte : une pièce créée doit arriver au serveur avant ses objets, même si
 * on la renomme ensuite. Les champs d'une opération « visite » se cumulent.
 */
export function enfiler(file: Operation[], op: Operation): Operation[] {
  const cle = cleOp(op);
  const i = file.findIndex((x) => cleOp(x) === cle);
  if (i < 0) return [...file, op];
  const avant = file[i];
  return file.map((x, j) => (j === i ? (avant.t === "visite" && op.t === "visite" ? { ...avant, ...op } : op) : x));
}

/** L'adresse d'une photo de visite : la porte de l'équipe, qui renvoie vers une URL signée d'une minute. */
export const urlPhotoVisite = (id: number, vignette = true) => `/api/visites/photos/${id}${vignette ? "?taille=vignette" : ""}`;

export const volumePiece = (objets: ObjetSaisi[], piece: string) =>
  Math.round(objets.filter((o) => o.piece === piece).reduce((n, o) => n + o.quantite * o.volume, 0) * 100) / 100;
