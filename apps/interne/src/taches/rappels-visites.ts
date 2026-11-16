import "server-only";
import { habillerTexte } from "@/lib/email-render";
import { envoyerEmail, envoyerSms, libelleStatut, type ResultatEnvoi } from "@/lib/envois";
import { TEL_AGENCE } from "@/lib/messaging";
import { getSettings } from "@/lib/settings";
import { dossierFictif } from "@/crm/envois";
import { modeleDe, raisonDeNePasEnvoyer } from "@/crm/messages/catalogue";
import { noterEnvoiRdv } from "@/crm/rdv/sms";
import { q, q1 } from "@/crm/lib/db";
import type { Tache } from "./types";

/*
 * Les rappels de visite technique (cahier des charges, §3.2 ; retours de
 * Céline, 16/11/2026 : « relance 48 h avant RDV puis 24 h », visios
 * comprises) : par SMS l'avant-veille (J−2) et la veille (J−1), par e-mail la
 * veille d'une visite sur place.
 *
 * La liste des rappels est calculée ailleurs (SOURCE_RAPPELS, registre.ts :
 * les SMS par crm/rdv/sms.ts, l'e-mail par crm/visites/rappels.ts) ; cette
 * tâche ne fait que les envoyer, chacun par le module d'envoi avec SA clé —
 * relancée, elle ne renvoie rien. Tant que la source n'est pas branchée, la
 * tâche le dit et ne fait rien.
 */

/** Un rappel, tel que le rendent les sources (rappelsSmsRendezVous, rappelsVisitesDuLendemain). */
export type RappelVisite = {
  canal: "sms" | "email";
  destinataire: string;
  objet?: string;
  texte: string;
  dossierId: number;
  rendezVousId: number;
  cle: string;
  /** La carte de « Courriers et SMS » qui le retient quand elle est désactivée ; à défaut, « Rappel de la veille ». */
  carte?: string;
  /** Le nom du modèle au journal des envois ; à défaut, « Rappel de visite (veille) ». */
  modele?: string;
  /** Ce que dit le fil du dossier (« Rappel J−2 ») ; à défaut, « Rappel de visite (veille) ». */
  libelle?: string;
};

export type SourceRappels = (jour: Date) => Promise<RappelVisite[]>;

/** Envoie une liste de rappels ; chacun laisse une ligne au fil d'activité de son dossier. */
export async function envoyerRappelsVisites(liste: RappelVisite[]) {
  const settings = await getSettings();
  // La carte de chaque rappel dans « Courriers et SMS » (« Rappel de la veille » à défaut) : désactivée, le rappel reste au journal.
  const retenus = new Map<string, string | null>();
  const retenuDe = async (carte: string) => {
    if (!retenus.has(carte)) retenus.set(carte, raisonDeNePasEnvoyer(await modeleDe(carte)));
    return retenus.get(carte) ?? null;
  };
  const issues: { cle: string; rendezVousId: number; canal: string; statut: string; doublon: boolean }[] = [];
  for (const r of liste) {
    const reference = (await q1<{ ref: string }>("select ref from dossiers where id=$1", [r.dossierId]).catch(() => undefined))?.ref ?? `dossier ${r.dossierId}`;
    const client = await q1<{ email: string | null; notes: string | null; civilite: string | null; prenom: string | null; nom: string | null; societe: string | null; telephone: string | null; commercial_email: string | null }>(
      `select c.email, c.notes, c.civilite, c.prenom, c.nom, c.societe, c.telephone, u.email as commercial_email
         from dossiers d join clients c on c.id = d.client_id left join rendez_vous rv on rv.id = $2 left join utilisateurs u on u.id = rv.commercial_id where d.id = $1`,
      [r.dossierId, r.rendezVousId],
    );
    // Sans fiche, ou dossier du jeu de démonstration : rien ne part.
    const fictif = !client || (await dossierFictif(r.dossierId, client));
    const retenu = await retenuDe(r.carte ?? "rdv_rappel_veille");
    const commun = { cle: r.cle, origine: "veille" as const, modele: r.modele ?? "Rappel de visite (veille)", reference, fictif, retenu: r.texte.trim() ? retenu : (retenu ?? "Rappel sans texte : rien n'est parti.") };
    let res: ResultatEnvoi;
    if (r.canal === "sms") {
      res = await envoyerSms({ ...commun, a: r.destinataire, texte: r.texte, expediteur: settings.sms_sender });
    } else {
      // Le texte est celui que rend le module des visites ; il est habillé comme les autres e-mails de Bailly.
      const sujet = r.objet?.trim() || settings.entreprise_nom || "Bailly Déménagement";
      res = await envoyerEmail({
        ...commun,
        a: r.destinataire,
        sujet,
        texte: r.texte,
        html: habillerTexte(sujet, r.texte, {
          base: (settings.base_url || "").replace(/\/$/, ""),
          entreprise: { nom: settings.entreprise_nom ?? undefined, email: settings.entreprise_email ?? undefined, tel: settings.entreprise_tel || TEL_AGENCE },
        }),
        expediteur: { nom: settings.entreprise_nom, email: settings.entreprise_email },
      });
    }
    issues.push({ cle: r.cle, rendezVousId: r.rendezVousId, canal: r.canal, statut: res.statut, doublon: res.doublon });
    // L'état du rendez-vous (planning, cloche) : le rappel est parti, ou non, vers ce numéro.
    if (r.canal === "sms") await noterEnvoiRdv(r.rendezVousId, "rappel", res, r.destinataire).catch(() => undefined);
    if (!res.doublon) {
      await q("insert into activite(dossier_id, libelle) values($1, $2)", [r.dossierId, `${r.libelle ?? "Rappel de visite (veille)"} par ${r.canal === "sms" ? "SMS" : "e-mail"} : ${libelleStatut(res)}`]).catch(() => undefined);
    }
  }
  return issues;
}

/** La tâche, pour le registre : la source des rappels lui est donnée (null tant qu'elle n'est pas branchée). */
export function tacheRappelsVisites(source: SourceRappels | null): Tache {
  return {
    cle: "rappels_visites",
    libelle: "Rappels de visite technique (J−2, J−1)",
    async executer({ jour }) {
      if (!source) return { statut: "en_attente", resume: "Pas encore branchée : la liste des rappels viendra du module des visites techniques." };
      // Le jour de l'exécution (aujourd'hui, à midi à Paris) : la source rend les rappels de ce jour (visites de demain et d'après-demain).
      const liste = await source(new Date(`${jour}T12:00:00+01:00`));
      if (!liste.length) return { statut: "rien", resume: "Aucun rappel de visite à envoyer (J−2, J−1)." };
      const issues = await envoyerRappelsVisites(liste);
      const partis = issues.filter((i) => i.statut === "envoye" && !i.doublon).length;
      const deja = issues.filter((i) => i.doublon).length;
      const echecs = issues.filter((i) => !i.doublon && (i.statut === "echec" || i.statut === "incertain")).length;
      return {
        statut: echecs ? "partielle" : "faite",
        resume: `${liste.length} rappel${liste.length > 1 ? "s" : ""} : ${partis} parti${partis > 1 ? "s" : ""}${deja ? `, ${deja} déjà traité${deja > 1 ? "s" : ""}` : ""}${echecs ? `, ${echecs} en échec` : ""}, ${liste.length - partis - deja - echecs} au journal.`,
        details: { issues },
      };
    },
  };
}
