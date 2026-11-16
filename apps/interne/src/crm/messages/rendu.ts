import { echapper, mettreEnPage, paragraphe, salutation } from "@/lib/email-layout";

/*
 * La composition d'un e-mail du CRM, sans rien du serveur : le texte d'une
 * carte de « Courriers et SMS », ses variables remplies, mis en page aux
 * couleurs de Bailly. Le serveur s'en sert à l'envoi (envois.ts,
 * rendreEmailCrm) et l'écran d'envoi d'une relance dans le navigateur, pour
 * que l'aperçu suive les cases cochées sans attendre : c'est le même code,
 * donc le même message.
 */

export type Vars = Record<string, string | number | null | undefined>;

/** Remplit {client} {commercial} {date} {heure} {ref}… — les variables du CRM. */
// Object.hasOwn : « {constructor} » dans un texte de carte écrivait le code de la fonction d'Object.
export const remplir = (texte: string, vars: Vars) =>
  texte.replace(/\{([a-z_]+)\}/gi, (m, k: string) => (!Object.hasOwn(vars, k) || vars[k] == null ? "" : String(vars[k])));

/** Ce que l'envoi sait de Bailly : l'adresse du site (logo, photo) et les coordonnées du pied. */
export interface ContexteEmail {
  base: string;
  entreprise: { nom?: string; email?: string; tel?: string };
}

/**
 * Un bloc composé par la plateforme (la liste d'une relance), posé à la place
 * du jeton {elements} quand le texte de la carte l'a seul sur un paragraphe ;
 * sinon juste avant la signature (le dernier paragraphe, dès qu'il y en a
 * trois), ou à la fin d'un texte plus court. Ailleurs dans une phrase,
 * {elements} se lit comme une liste courte (la variable `elements`).
 */
export interface BlocEmail {
  html: string;
  texte: string;
}

export const JETON_BLOC = "{elements}";

export function composerEmailCrm(
  m: { objet: string | null; corps: string },
  vars: Vars,
  contexte: ContexteEmail,
  o: { ajout?: string; apercu?: string; bloc?: BlocEmail; surtitre?: string } = {},
) {
  const sujet = remplir(m.objet?.trim() || "Bailly Déménagement", vars);
  const enPage = (corps: string, apercu: string | undefined) =>
    mettreEnPage({ titre: sujet, corps, apercu, base: contexte.base.replace(/\/$/, ""), entreprise: contexte.entreprise, surtitre: o.surtitre });
  const html1 = (b: string, i: number) => (i === 0 && /^bonjour\b/i.test(b) ? salutation(b) : paragraphe(b));
  const echappe = (b: string) => b.split("\n").map((l) => echapper(l.trim())).join("<br>");
  const apercuDe = (texte: string) => o.apercu ?? texte.split("\n").find((l) => l.trim() && !/^bonjour\b/i.test(l.trim()))?.slice(0, 140);

  if (!o.bloc) {
    // Le chemin de toujours, inchangé pour tous les e-mails du CRM.
    const texte = remplir(m.corps, vars);
    const blocs = texte.split(/\n\s*\n/).map(echappe);
    return { sujet, texte, html: enPage([...blocs.map(html1), o.ajout ?? ""].join("\n"), apercuDe(texte)) };
  }

  // Avec un bloc : les paragraphes du texte d'origine, le jeton repéré avant de remplir les variables.
  const bruts = m.corps.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let place = bruts.findIndex((p) => p.toLowerCase() === JETON_BLOC);
  const remplace = place >= 0;
  if (!remplace) place = bruts.length >= 3 ? bruts.length - 1 : bruts.length;
  const avant = bruts.slice(0, place).map((p) => remplir(p, vars));
  const apres = bruts.slice(remplace ? place + 1 : place).map((p) => remplir(p, vars));
  const texte = [...avant, o.bloc.texte, ...apres].filter((p) => p.trim()).join("\n\n");
  const html = [
    ...avant.map((p, i) => html1(echappe(p), i)),
    o.bloc.html,
    ...apres.map((p) => paragraphe(echappe(p))),
    o.ajout ?? "",
  ].join("\n");
  return { sujet, texte, html: enPage(html, apercuDe([...avant, ...apres].join("\n"))) };
}
