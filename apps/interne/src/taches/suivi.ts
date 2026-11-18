import "server-only";
import { purgerSuivi } from "@/lib/suivi-envois";
import { RETENTION_JOURS } from "@/lib/suivi-envois/schema";
import type { Tache } from "./types";

/*
 * La conservation du suivi des e-mails (lib/suivi-envois) : chaque jour, ce qui a
 * passé RETENTION_JOURS (13 mois) est effacé — ouvertures, clics, visites du
 * portail, événements des fournisseurs (SendGrid, Twilio, Brevo), et les liens suivis eux-mêmes (un lien de
 * plus de 13 mois mène alors à l'accueil du site). Relancée le même jour,
 * elle n'a simplement plus rien à effacer.
 */
export const tacheRetentionSuivi: Tache = {
  cle: "retention_suivi",
  libelle: "Conservation du suivi des e-mails",
  async executer() {
    try {
      const r = await purgerSuivi();
      if (!r) return { statut: "en_attente", resume: "Suivi des e-mails indisponible (base) : rien n'a été effacé." };
      const n = r.evenements + r.liens;
      return {
        statut: n ? "faite" : "rien",
        resume: n
          ? `${r.evenements} événement${r.evenements > 1 ? "s" : ""} et ${r.liens} lien${r.liens > 1 ? "s" : ""} de plus de ${RETENTION_JOURS} jours effacés.`
          : `Rien à effacer : aucun suivi de plus de ${RETENTION_JOURS} jours.`,
        details: { ...r, retentionJours: RETENTION_JOURS },
      };
    } catch (e) {
      return { statut: "echec", resume: `Effacement impossible : ${e instanceof Error ? e.message : "erreur"}.` };
    }
  },
};
