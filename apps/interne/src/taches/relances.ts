import "server-only";
import { envoyerRelancesDuJour, RATTRAPAGE_JOURS } from "@/crm/relances/moteur";
import { envoyerCarte } from "@/crm/envois";
import { q } from "@/crm/lib/db";
import { modeleDe, raisonDeNePasEnvoyer } from "@/crm/messages/catalogue";
import type { Tache } from "./types";

/*
 * Deux tâches de la veille branchées sur « Courriers et SMS » :
 *   - les relances du jour (src/crm/relances), chacune une seule fois ;
 *   - le message de la veille du déménagement, aux dossiers chargés demain,
 *     tant que sa carte n'est pas validée et active, rien ne part.
 */

export const tacheRelances: Tache = {
  cle: "relances",
  libelle: "Relances",
  async executer() {
    const r = await envoyerRelancesDuJour();
    const n = r.envoyees + r.echecs;
    if (!n && !r.enAttente) return { statut: "rien", resume: "Aucune relance due aujourd'hui." };
    return {
      statut: r.echecs ? "partielle" : "faite",
      resume: `${n ? `${r.envoyees} relance${r.envoyees > 1 ? "s" : ""} traitée${r.envoyees > 1 ? "s" : ""}${r.echecs ? `, ${r.echecs} en échec` : ""}` : "aucune relance du jour"}${r.enAttente ? ` · ${r.enAttente} en retard de plus de ${RATTRAPAGE_JOURS} jours, laissée${r.enAttente > 1 ? "s" : ""} à la décision de l'équipe (Relances)` : ""}.`,
      details: r,
    };
  },
};

export const tacheVeilleDemenagement: Tache = {
  cle: "veille_demenagement",
  libelle: "Veille du déménagement",
  async executer({ demain }) {
    const raison = raisonDeNePasEnvoyer(await modeleDe("veille_demenagement"));
    const dossiers = await q<{ id: number; ref: string }>(
      "select id, ref from dossiers where date_chargement = $1::date and statut not in ('perdu','termine') order by id",
      [demain],
    );
    if (!dossiers.length) return { statut: "rien", resume: "Aucun chargement demain." };
    if (raison) return { statut: "en_attente", resume: `${dossiers.length} chargement${dossiers.length > 1 ? "s" : ""} demain ; ${raison}` };
    const issues: string[] = [];
    for (const d of dossiers) {
      const e = await envoyerCarte("veille_demenagement", d.id, { cle: `veille-demenagement:${d.id}:${demain}` });
      issues.push(`${d.ref} : ${e.libelle}`);
      if (e.resultat && !e.resultat.doublon) await q("insert into activite(dossier_id, libelle) values($1,$2)", [d.id, `Message de la veille du déménagement : ${e.libelle}`]).catch(() => undefined);
    }
    return { statut: "faite", resume: issues.join(" · "), details: { issues } };
  },
};
