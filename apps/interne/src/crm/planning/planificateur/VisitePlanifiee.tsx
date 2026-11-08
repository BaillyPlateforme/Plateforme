import Link from "next/link";
import { envoyerSms, reponseRdv } from "@/crm/actions2";
import { smsRendezVous } from "@/crm/envois";
import { q1 } from "@/crm/lib/db";
import { Ic } from "@/crm/lib/icons";
import { EtatSmsRdv } from "@/crm/rdv/EtatSmsRdv";
import type { EtatAffiche } from "@/crm/rdv/sms";
import { espacesDesDossiersCrm } from "@/lib/espace-client/crm";
import { adressePublique } from "@/lib/espace-client/config";
import { jourVisite, jourParis, plageVisite } from "@/lib/visite/regles";
import BoutonConfirmer from "../BoutonConfirmer";
import { TYPES_RDV, estTypeRdv } from "../types-rdv";
import CopierLien from "./CopierLien";
import s from "./visite-planifiee.module.css";

/*
 * Au retour du planificateur (?planifie=<rdv>), en tête de l'onglet Visites
 * du dossier : la visite qui vient d'être posée, et la suite — prévenir le
 * client. Le SMS de confirmation (carte « Visite confirmée », réponse 1 ou
 * 2) se lit avant de partir, et ne part que sur un geste ; le lien de
 * l'espace client se copie pour un e-mail ou un message. La fiche de visite
 * s'imprime (ou s'enregistre en PDF).
 */

const maj = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default async function VisitePlanifiee({ dossierId, rdvId, sms, maintenant }: { dossierId: number; rdvId: number; sms?: EtatAffiche; /** L'instant de la page (ms) : une visite passée ne se confirme plus. */ maintenant: number }) {
  const r = await q1<{ id: number; type: string; titre: string; lieu: string | null; debut: Date; duree_min: number; journee: boolean; commercial_id: number; commercial: string }>(
    `select r.id, r.type, r.titre, r.lieu, r.debut, r.duree_min, r.journee, r.commercial_id, u.nom as commercial
       from rendez_vous r join utilisateurs u on u.id = r.commercial_id where r.id = $1 and r.dossier_id = $2`,
    [rdvId, dossierId],
  );
  if (!r || !estTypeRdv(r.type)) return null;
  const visite = (r.type === "phys" || r.type === "visio") && !r.journee;
  const [apercu, espaces, base] = await Promise.all([
    visite ? smsRendezVous(dossierId, rdvId).catch(() => null) : Promise.resolve(null),
    espacesDesDossiersCrm([dossierId]).catch(() => new Map<number, { id: string; reference: string }>()),
    adressePublique(),
  ]);
  const espace = espaces.get(dossierId);
  const lienEspace = espace ? `${base}/espace-client/${encodeURIComponent(espace.reference)}/visite` : null;
  const passee = new Date(r.debut).getTime() < maintenant;
  const type = TYPES_RDV[r.type];

  return (
    <section className={`${s.carte} t-${r.type}`} aria-labelledby="visite-planifiee">
      <div className={s.tete}>
        <i className={s.icone}>
          <Ic n="check" />
        </i>
        <div className={s.texte}>
          <h3 id="visite-planifiee">{visite ? `${r.type === "visio" ? "Visio" : "Visite"} planifiée` : "Rendez-vous planifié"}</h3>
          <p>
            <b>{r.journee ? `${maj(jourVisite(r.debut))} · journée entière` : `${maj(jourVisite(r.debut))} · ${plageVisite(r.debut, r.duree_min)}`}</b>
            <span className={s.type}>
              <Ic n={type.icone} />
              {type.court}
            </span>
            avec {r.commercial}
          </p>
          {r.lieu && r.lieu !== "Visio" && <small>{r.lieu}</small>}
        </div>
        <Link href={`/dossiers/${dossierId}#demenagements-visites`} className={s.fermer} aria-label="Fermer" title="Fermer">
          ×
        </Link>
      </div>

      {visite && !passee && (
        <div className={s.suite}>
          <div className={s.message}>
            <small>Prochaine étape : prévenir le client</small>
            {apercu?.texte ? <p className={s.bulle}>{apercu.texte}</p> : <p className={s.manque}>Le modèle « Confirmation de rendez-vous » est introuvable.</p>}
            <span className={s.destinataire}>
              {apercu?.c.telephone ? `SMS au ${apercu.c.telephone}` : "Pas de téléphone sur la fiche du client : le SMS ne peut pas partir."}
              {apercu?.retenu ? ` · ${apercu.retenu}` : ""}
            </span>
          </div>
          <div className={s.gestes}>
            {sms ? (
              <EtatSmsRdv etat={sms} confirmer={reponseRdv.bind(null, dossierId, rdvId, "confirme")} annuler={reponseRdv.bind(null, dossierId, rdvId, "annule")} />
            ) : (
              apercu?.c.telephone && (
                <form action={envoyerSms.bind(null, dossierId, rdvId)}>
                  <BoutonConfirmer className={`btn primary ${s.envoyer}`} libelle="Envoyer la confirmation au client" confirmation="Confirmer l'envoi du SMS" />
                </form>
              )
            )}
            {lienEspace && <CopierLien lien={lienEspace} libelle="Copier le lien de son espace" className="btn ghost" />}
            <a className="btn ghost" href={`/imprimer/visites?rdv=${rdvId}`} target="_blank" rel="noopener">
              <Ic n="pdf" />
              Fiche de visite
            </a>
            <Link className="btn ghost" href={`/planning?semaine=${jourParis(r.debut)}&com=${r.commercial_id}`}>
              <Ic n="cal" />
              Voir au planning
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
