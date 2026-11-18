import { nomDuFournisseur, type NomFournisseur } from "@/lib/envois/fournisseurs";
import { GESTES, LIBELLE_AGENT, PAGES, type Agent } from "@/lib/suivi-envois/regles";
import type { NomIcone } from "@/ui/icones";

/*
 * Le suivi d'un e-mail, tel que le CRM le montre : sa piste — Envoyé (ou
 * Journalisé) → Délivré → Ouvert → Cliqué → Sur le portail —, en étapes
 * courtes, chacune avec son détail au survol. Module pur : il sert aux
 * pages du serveur et aux écrans du navigateur (la chronologie, le volet
 * d'envoi d'une relance).
 *
 * Les mots restent honnêtes : une ouverture relevée par une machine (Apple
 * Mail, proxy d'images, antivirus) se dit « probable », jamais certaine ; une
 * ouverture non relevée n'est pas « non lu » ; « Délivré » ne s'affiche que
 * si le fournisseur l'a dit (son webhook : SendGrid, ou Brevo avant la
 * bascule), jamais déduit.
 */

export interface SuiviEnvoi {
  envoiId: string;
  statut: string;
  motif: string | null;
  /** ISO : l'inscription au journal (l'envoi). */
  envoyeLe: string;
  /** Le fournisseur qui a transporté l'e-mail (SendGrid, ou Brevo avant la bascule), s'il est connu. */
  fournisseur?: NomFournisseur | null;
  delivre: string | null;
  rebond: { genre: string; le: string; raison: string | null } | null;
  plainte: string | null;
  desinscription: string | null;
  ouvertures: { n: number; auto: number; premiere: string | null; derniere: string | null; premiereAuto: string | null; agents: Agent[] };
  clics: { indice: number; libelle: string | null; destination: string | null; n: number; auto: number; premier: string; dernier: string }[];
  portail: { n: number; premiere: string | null; derniere: string | null; pages: string[] };
}

export type EtatEtape = "ok" | "neutre" | "attente" | "alerte" | "probable";

export interface EtapePiste {
  cle: "depart" | "delivre" | "ouverture" | "clic" | "portail";
  libelle: string;
  titre: string;
  etat: EtatEtape;
  icone: NomIcone;
}

const PARIS = "Europe/Paris";
const FORMAT_HEURE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: PARIS });
const jourHeure = (iso: string) => {
  const p = Object.fromEntries(FORMAT_HEURE.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} à ${p.hour}:${p.minute}`;
};
const jourCourt = (iso: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: PARIS }).format(new Date(iso));

/** « le 8 nov. à 14:05 » */
export const leJourHeure = (iso: string) => `le ${jourHeure(iso)}`;
/** « le 8 nov. » */
export const leJour = (iso: string) => `le ${jourCourt(iso)}`;

/** Le départ, dit avec le fournisseur (« Parti chez SendGrid ») : « {f} » est remplacé par son nom. */
const DEPART: Record<string, { libelle: string; etat: EtatEtape; dit: string }> = {
  envoye: { libelle: "Envoyé", etat: "ok", dit: "Parti chez {f}" },
  journalise: { libelle: "Journalisé", etat: "neutre", dit: "Journalisé : l'envoi réel n'est pas activé, rien n'est parti" },
  fictif: { libelle: "Journalisé", etat: "neutre", dit: "Journalisé : destinataire fictif, rien ne lui est jamais envoyé" },
  bloque: { libelle: "Retenu (recette)", etat: "neutre", dit: "Retenu : recette, destinataire hors de la liste blanche" },
  bac_a_sable: { libelle: "Bac à sable", etat: "neutre", dit: "Bac à sable de {f} : accepté, jamais délivré" },
  echec: { libelle: "Échec", etat: "alerte", dit: "Échec de l'envoi" },
  incertain: { libelle: "Incertain", etat: "alerte", dit: "Incertain : à vérifier chez {f}" },
  en_cours: { libelle: "En cours", etat: "attente", dit: "En cours d'envoi" },
};

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
export const libellePage = (p: string) => PAGES[p] ?? GESTES[p] ?? p;
const agents = (l: Agent[]) => [...new Set(l.map((a) => LIBELLE_AGENT[a] ?? a))].join(", ");

export const MESURE_INDICATIVE =
  "Mesure indicative : une messagerie qui bloque les images ne compte pas l'ouverture ; Apple Mail, les proxys d'images et certains antivirus ouvrent les e-mails ou suivent les liens tout seuls.";

/** Les étapes de la piste d'un e-mail, dans l'ordre. */
export function etapesPiste(s: SuiviEnvoi): EtapePiste[] {
  const out: EtapePiste[] = [];
  const d = DEPART[s.statut] ?? { libelle: s.statut, etat: "neutre" as const, dit: s.statut };
  const f = nomDuFournisseur(s.fournisseur);
  const selon = `selon ${f}`;
  out.push({ cle: "depart", libelle: d.libelle, etat: d.etat, icone: "envoyer", titre: `${d.dit.replace("{f}", f)} · ${leJourHeure(s.envoyeLe)}${s.motif && s.statut !== "envoye" ? ` · ${s.motif}` : ""}` });

  if (s.rebond) {
    out.push({ cle: "delivre", libelle: "Non délivré", etat: "alerte", icone: "alerte", titre: `Rebond (${s.rebond.genre.replace(/_/g, " ")}) ${leJourHeure(s.rebond.le)}${s.rebond.raison ? ` · ${s.rebond.raison}` : ""} — ${selon}` });
  } else if (s.delivre) {
    out.push({ cle: "delivre", libelle: "Délivré", etat: "ok", icone: "coche", titre: `Délivré ${leJourHeure(s.delivre)} — ${selon}` });
  }
  if (s.plainte) out.push({ cle: "delivre", libelle: "Signalé comme indésirable", etat: "alerte", icone: "alerte", titre: `Le destinataire l'a signalé comme indésirable ${leJourHeure(s.plainte)} — ${selon}` });
  if (s.desinscription) out.push({ cle: "delivre", libelle: "Désinscrit", etat: "alerte", icone: "alerte", titre: `Le destinataire s'est désinscrit ${leJourHeure(s.desinscription)} — ${selon}` });

  const o = s.ouvertures;
  if (o.n > 0) {
    const autres = o.auto ? ` · plus ${pluriel(o.auto, "relevé")} automatique${o.auto > 1 ? "s" : ""}` : "";
    out.push({
      cle: "ouverture",
      libelle: o.n > 1 ? `Ouvert ${o.n}×` : "Ouvert",
      etat: "ok",
      icone: "oeil",
      titre: `${o.n > 1 ? `Ouvert ${o.n} fois : la première ${leJourHeure(o.premiere!)}, la dernière ${leJourHeure(o.derniere!)}` : `Ouvert ${leJourHeure(o.premiere!)}`}${autres}${o.agents.length ? ` · ${agents(o.agents)}` : ""}. ${MESURE_INDICATIVE}`,
    });
  } else if (o.auto > 0) {
    out.push({
      cle: "ouverture",
      libelle: "Ouverture probable",
      etat: "probable",
      icone: "oeil",
      titre: `Ouverture probable (relevé automatique) ${leJourHeure(o.premiereAuto!)}${o.agents.length ? ` · ${agents(o.agents)}` : ""} : l'image a été chargée par une machine, le client ne l'a peut-être pas lu. ${MESURE_INDICATIVE}`,
    });
  } else if (s.statut === "envoye" && !s.rebond) {
    out.push({ cle: "ouverture", libelle: "Pas d'ouverture relevée", etat: "attente", icone: "oeil", titre: `Aucune ouverture relevée pour l'instant. ${MESURE_INDICATIVE}` });
  }

  const certains = s.clics.filter((c) => c.n > 0);
  if (certains.length) {
    // Le lien le plus cliqué ; à égalité, le premier de l'e-mail (le bouton, avant les liens du pied).
    const principal = [...certains].sort((a, b) => b.n - a.n || a.indice - b.indice)[0];
    const autres = certains.length - 1;
    out.push({
      cle: "clic",
      libelle: `Cliqué${principal.libelle ? ` « ${principal.libelle} »` : ""}${principal.n > 1 ? ` ${principal.n}×` : ""}${autres ? ` +${autres} lien${autres > 1 ? "s" : ""}` : ""}`,
      etat: "ok",
      icone: "externe",
      titre: certains
        .map((c) => `« ${c.libelle ?? "lien"} »${c.destination ? ` (${c.destination})` : ""} : ${c.n > 1 ? `${c.n} fois, le dernier ${leJourHeure(c.dernier)}` : leJourHeure(c.premier)}`)
        .join(" · "),
    });
  } else if (s.clics.some((c) => c.auto > 0)) {
    const c = s.clics.find((x) => x.auto > 0)!;
    out.push({ cle: "clic", libelle: "Clic probable", etat: "probable", icone: "externe", titre: `Clic probable (relevé automatique) sur « ${c.libelle ?? "lien"} » ${leJourHeure(c.premier)} : un antivirus ou un aperçu suit parfois les liens dès la réception.` });
  }

  if (s.portail.n > 0 && s.portail.premiere) {
    const pages = s.portail.pages.map(libellePage);
    out.push({
      cle: "portail",
      libelle: `Sur le portail ${leJour(s.portail.premiere)}`,
      etat: "ok",
      icone: "connexion",
      titre: `Venu sur le portail depuis cet e-mail ${leJourHeure(s.portail.premiere)}${s.portail.derniere && s.portail.derniere !== s.portail.premiere ? `, dernière page ${leJourHeure(s.portail.derniere)}` : ""}${pages.length ? ` · ${pages.join(", ")}` : ""}`,
    });
  }
  return out;
}

/** La piste en une ligne de texte : « Envoyé le 8 nov. · ouvert 3× · cliqué « Signer le devis » ». */
export function resumePiste(s: SuiviEnvoi, o: { sansDepart?: boolean } = {}): string {
  const morceaux: string[] = [];
  if (!o.sansDepart) morceaux.push(`${(DEPART[s.statut]?.libelle ?? s.statut)} ${leJour(s.envoyeLe)}`);
  if (s.rebond) morceaux.push("non délivré");
  if (s.ouvertures.n) morceaux.push(s.ouvertures.n > 1 ? `ouvert ${s.ouvertures.n}×` : "ouvert");
  else if (s.ouvertures.auto) morceaux.push("ouverture probable");
  const clics = s.clics.reduce((t, c) => t + c.n, 0);
  if (clics) morceaux.push(clics > 1 ? `cliqué ${clics}×` : "cliqué");
  return morceaux.join(" · ");
}

/** Le dernier signe de vie d'un e-mail (ouverture ou clic certains), s'il y en a un. */
export function dernierSigne(s: SuiviEnvoi): { quand: string; quoi: "ouvert" | "cliqué"; libelle: string | null } | null {
  const clic = [...s.clics].filter((c) => c.n > 0).sort((a, b) => b.dernier.localeCompare(a.dernier))[0];
  const ouvert = s.ouvertures.n > 0 ? s.ouvertures.derniere : null;
  if (clic && (!ouvert || clic.dernier >= ouvert)) return { quand: clic.dernier, quoi: "cliqué", libelle: clic.libelle };
  return ouvert ? { quand: ouvert, quoi: "ouvert", libelle: null } : null;
}
