"use client";

import { useEffect, useState, useTransition } from "react";
import { envoyerAcces, type Resultat } from "@/lib/actions/espace-client-equipe";
import { envoyerMaintenant } from "@/crm/relances/actions";
import { Icone } from "@/ui/icones";
import { Retour, usePorte } from "../socle";
import { nomAffiche, type DonneesFiche } from "./outils";
import { relancesProposees, type RelanceProposee } from "./relances";
import s from "./suivi.module.css";

type Option = { cle: string; court: string; envoi: string; faire: () => Promise<Resultat> };

const CANAUX = (c: ("email" | "sms")[]) => (c.length > 1 ? "e-mail et SMS" : c[0] === "sms" ? "SMS" : "e-mail");

/** Ce que deviennent les messages, en une phrase : l'état réel du module d'envoi. */
function phraseEnvoi(mode: string) {
  if (mode === "actif") return "Envoi réel : le client recevra le message.";
  if (mode === "recette") return "Recette : le message ne part que si l'adresse est sur la liste blanche ; sinon il est journalisé.";
  return "Envoi désactivé : le message sera journalisé, rien ne partira.";
}

/**
 * « Relancer le client » : un seul geste, qui dit ce qu'il envoie. Il reprend
 * la relance du moteur qui peut partir pour ce dossier (conditions, pièces,
 * devis, solde) et, à défaut ou au choix, un nouveau lien d'accès à l'espace.
 * Rien ne part sans un clic, puis une confirmation.
 */
export function Relancer({ d, recharger }: { d: DonneesFiche; recharger: () => void }) {
  const { demo } = usePorte();
  const [relances, setRelances] = useState<RelanceProposee[] | null>(d.crm == null || demo ? [] : null);
  const [choix, setChoix] = useState(0);
  const [enCours, demarrer] = useTransition();
  const [resultat, setResultat] = useState<Resultat | null>(null);

  useEffect(() => {
    if (d.crm == null || demo) return;
    let vivant = true;
    relancesProposees(d.crm)
      .then((r) => vivant && setRelances(r))
      .catch(() => vivant && setRelances([]));
    return () => {
      vivant = false;
    };
  }, [d.crm, demo]);

  const a = d.client.email;
  const destinataires = (c: ("email" | "sms")[]) => [c.includes("email") && a, c.includes("sms") && (d.client.telephone || "son téléphone")].filter(Boolean).join(" et ");
  const options: Option[] = [
    ...(relances ?? []).map((r) => ({
      cle: r.cle,
      court: r.libelle,
      envoi: `${CANAUX(r.canaux)[0].toUpperCase()}${CANAUX(r.canaux).slice(1)} « ${r.libelle} » (relance ${r.rang} sur ${r.sur}) à ${destinataires(r.canaux)}`,
      faire: async (): Promise<Resultat> => {
        const x = await envoyerMaintenant(r.cle);
        return x.ok ? { ok: true, message: x.message } : { ok: false, erreur: x.erreur };
      },
    })),
    { cle: "acces", court: "Lien d'accès", envoi: `E-mail avec un nouveau lien d'accès à son espace, à ${a}`, faire: () => envoyerAcces(d.dossier.id) },
  ];
  const o = options[Math.min(choix, options.length - 1)];

  const lancer = () => {
    if (!confirm(`Relancer ${nomAffiche(d.client)} ?\n\n${o.envoi}.\n\n${phraseEnvoi(d.mode.envois.mode)}`)) return;
    demarrer(async () => {
      const r = await o.faire();
      setResultat(r);
      if (r.ok) recharger();
    });
  };

  return (
    <div className={s.relance}>
      <div className={s.relanceLigne}>
        <button type="button" className={s.relanceBouton} onClick={lancer} disabled={enCours || relances === null}>
          <Icone nom="envoyer" taille={17} />
          {enCours ? "Envoi…" : "Relancer le client"}
        </button>
        <p className={s.relanceQuoi}>
          {relances === null ? "Recherche des relances prêtes…" : o.envoi}
          <small>{phraseEnvoi(d.mode.envois.mode)}</small>
        </p>
      </div>
      {options.length > 1 && (
        <div className={s.relanceChoix} role="radiogroup" aria-label="Ce que la relance envoie">
          <span>Envoyer :</span>
          {options.map((x, i) => (
            <button key={x.cle} type="button" role="radio" aria-checked={o === x} className={s.choix} onClick={() => setChoix(i)}>
              {x.court}
            </button>
          ))}
        </div>
      )}
      <Retour r={resultat} />
    </div>
  );
}
