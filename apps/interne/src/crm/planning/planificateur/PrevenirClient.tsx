"use client";

import { Ic } from "@/crm/lib/icons";
import { remplir } from "@/crm/messages/rendu";
import type { RdvPlanif } from "./donnees";
import { phraseConfirmationOubliee } from "./regles";
import s from "./planificateur.module.css";

/*
 * Une visite déplacée, dans le planificateur : ce que devient la confirmation
 * du client, et de quoi le prévenir. Le SMS « Visite confirmée » (ou
 * « Visio confirmée ») dit « confirmé le {date} à {heure} » : la
 * confirmation déjà reçue portait sur l'ancien horaire, elle repart de zéro à
 * l'enregistrement (rdv/sms.ts, oublierEtatRdv), et l'écran le dit avant.
 *
 * La case « Prévenir le client par SMS » n'est pas cochée d'office : rien ne
 * part sans ce geste. Cochée, le message du nouvel horaire se lit avant de
 * partir, tel que le modèle le compose, et la phrase du bas dit ce que
 * deviendra l'envoi (ENVOI_MODE, client fictif).
 */

const PARIS = "Europe/Paris";

export default function PrevenirClient({
  rdv,
  debut,
  commercial,
  type,
  coche,
  cocher,
}: {
  rdv: RdvPlanif;
  /** Le nouvel instant de la visite. */
  debut: Date;
  /** Le nom de la personne qui fera la visite (elle peut avoir changé aussi). */
  commercial: string;
  type: "phys" | "visio";
  coche: boolean;
  cocher: (v: boolean) => void;
}) {
  const c = rdv.confirmation;
  if (!c) return null;
  // La carte du type choisi : une visite passée en visio se confirme avec le texte de la visio.
  const modele = c.modeles[type];
  const texte = remplir(modele.corps, {
    ...c.vars,
    commercial,
    date: debut.toLocaleDateString("fr-FR", { timeZone: PARIS }),
    heure: debut.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: PARIS }),
  });
  // Un horaire qui a déjà eu son SMS de confirmation n'en aura pas d'autre (une fois par rendez-vous et par horaire).
  const dejaTraite = c.dejaTraites.includes(debut.toISOString());
  const possible = !!c.telephone && !!modele.corps.trim() && !dejaTraite;

  return (
    <section className={s.prevenir} aria-labelledby="planif-prevenir">
      <div className={s.prevenirTete}>
        <i className={s.prevenirIcone} aria-hidden>
          <Ic n="bell" />
        </i>
        <div>
          <b id="planif-prevenir">Nouvel horaire : le client doit le savoir</b>
          <p>
            {rdv.sms ? (
              <>
                <i className={`st ${rdv.sms.ton}`} title={rdv.sms.detail}>
                  {rdv.sms.libelle}
                </i>{" "}
                {phraseConfirmationOubliee(rdv.sms.etat).replace(/\.$/, "")} à l&apos;enregistrement.
              </>
            ) : (
              "La confirmation du client repart de zéro pour ce nouvel horaire."
            )}
            {" Les rappels (J−2, J−1) suivent le nouvel horaire d'eux-mêmes."}
          </p>
        </div>
      </div>

      {possible ? (
        <>
          <label className={s.caseSms}>
            <input type="checkbox" name="sms" checked={coche} onChange={(e) => cocher(e.target.checked)} />
            <span>
              <b>Prévenir le client par SMS</b>
              <small>
                au {c.telephone} · modèle « {modele.nom} »
              </small>
            </span>
          </label>
          {coche && (
            <div className={s.prevenirApercu}>
              <p className={s.bulle}>{texte}</p>
              <small>{modele.retenu ?? c.envoi}</small>
            </div>
          )}
        </>
      ) : (
        <p className={s.manque}>
          <Ic n="alert" />
          {!c.telephone
            ? "Pas de téléphone sur la fiche du client : pas de SMS possible. Prévenez-le autrement."
            : dejaTraite
              ? "Un SMS de confirmation a déjà été traité pour cet horaire : il ne repartira pas. Prévenez le client autrement."
              : `Le modèle « ${modele.nom} » est vide : pas de SMS possible.`}
        </p>
      )}
    </section>
  );
}
