"use client";

import { useState, useTransition } from "react";
import { majPlan, reinitialiserDemo, supprimerPlan } from "../actions";
import type { Plan } from "../types";
import { Fenetre, type Message } from "./elements";
import { Picto } from "./Picto";
import s from "./dispatch.module.css";

/** Les réglages d'un plan : nom, sens, port, date, notes, capacités des conteneurs ; et sa suppression. */
export default function ReglagesPlan({ plan, onFermer, onMessage }: { plan: Plan; onFermer: () => void; onMessage: (m: Message) => void }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [danger, setDanger] = useState<"supprimer" | "demo" | null>(null);
  const [enCours, demarrer] = useTransition();

  const enregistrer = (f: FormData) =>
    demarrer(async () => {
      setErreur(null);
      const r = await majPlan(plan.id, f);
      if (!r.ok) return setErreur(r.erreur);
      onMessage({ texte: "Réglages du plan enregistrés" });
      onFermer();
    });
  const confirmer = () =>
    demarrer(async () => {
      const r = danger === "demo" ? await reinitialiserDemo(plan.id) : await supprimerPlan(plan.id);
      if (r && !r.ok) setErreur(r.erreur);
    });

  return (
    <Fenetre titre="Réglages du plan" sousTitre="Ce qui vaut pour tout le groupage : son nom, son départ, et les capacités des conteneurs." picto="reglages" onFermer={onFermer}>
      <form action={enregistrer} style={{ display: "contents" }}>
        <div className={s.fenetreCorps}>
          <div className={s.grille}>
            <div className={s.champ}>
              <label htmlFor="nom">Nom du plan</label>
              <input id="nom" name="nom" type="text" required maxLength={120} defaultValue={plan.nom} />
            </div>
            <div className={`${s.champ} ${s.tiers}`}>
              <label htmlFor="sens">Sens</label>
              <select id="sens" name="sens" defaultValue={plan.sens}>
                <option value="export">Export (départ de France)</option>
                <option value="import">Import (arrivée en France)</option>
              </select>
            </div>
            <div className={`${s.champ} ${s.tiers}`}>
              <label htmlFor="port">Port</label>
              <input id="port" name="port" type="text" maxLength={80} defaultValue={plan.port ?? ""} placeholder="Le Havre" />
            </div>
            <div className={`${s.champ} ${s.tiers}`}>
              <label htmlFor="date_reference">Date de départ</label>
              <input id="date_reference" name="date_reference" type="date" defaultValue={plan.dateReference ?? ""} />
            </div>
            <div className={`${s.champ} ${s.demi}`}>
              <label htmlFor="capacite_20">Capacité d&apos;un 20 pieds</label>
              <div className={s.unite}>
                <input id="capacite_20" name="capacite_20" type="text" inputMode="decimal" defaultValue={String(plan.capacite20).replace(".", ",")} />
                <span>m³</span>
              </div>
            </div>
            <div className={`${s.champ} ${s.demi}`}>
              <label htmlFor="capacite_40">Capacité d&apos;un 40 pieds</label>
              <div className={s.unite}>
                <input id="capacite_40" name="capacite_40" type="text" inputMode="decimal" defaultValue={String(plan.capacite40).replace(".", ",")} />
                <span>m³</span>
              </div>
            </div>
            <div className={s.champ}>
              <div className={s.note}>
                <Picto nom="alerte" taille={16} />
                <span>
                  Valeurs indicatives, non fournies par Bailly : 33 m³ et 67 m³ sont les volumes intérieurs courants d&apos;un conteneur standard. Le volume réellement chargeable
                  en mobilier est plus faible ; ajustez-les. Une nouvelle valeur s&apos;applique aux conteneurs non verrouillés qui avaient l&apos;ancienne.
                </span>
              </div>
            </div>
            <div className={s.champ}>
              <label htmlFor="notes">Notes</label>
              <textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={plan.notes ?? ""} />
            </div>
          </div>

          <div className={s.section}>
            <h3>Zone sensible</h3>
            {danger ? (
              <div className={`${s.note} ${s.rose}`}>
                <Picto nom="alerte" taille={16} />
                <span style={{ flex: 1 }}>
                  {danger === "demo"
                    ? "Le plan de démonstration sera remis dans son état d'origine : vos déplacements, colonnes et propositions sur ce plan seront perdus."
                    : `Le plan « ${plan.nom} », ses ${plan.lignes.length} clients, ses colonnes et son historique seront supprimés définitivement.`}
                  <span style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button type="button" className={`${s.boutonDanger} ${s.petit}`} onClick={confirmer} disabled={enCours}>
                      {danger === "demo" ? "Remettre à zéro" : "Supprimer définitivement"}
                    </button>
                    <button type="button" className={`${s.bouton} ${s.petit}`} onClick={() => setDanger(null)}>
                      Annuler
                    </button>
                  </span>
                </span>
              </div>
            ) : (
              <div className={s.actions}>
                {plan.demo && (
                  <button type="button" className={s.bouton} onClick={() => setDanger("demo")}>
                    <Picto nom="recharger" taille={16} /> Remettre la démonstration à zéro
                  </button>
                )}
                <button type="button" className={s.boutonDanger} onClick={() => setDanger("supprimer")}>
                  <Picto nom="corbeille" taille={16} /> Supprimer le plan
                </button>
              </div>
            )}
          </div>
          {erreur && (
            <p className={s.erreur} style={{ marginTop: 14 }}>
              {erreur}
            </p>
          )}
        </div>
        <div className={s.fenetrePied}>
          <button type="button" className={s.bouton} onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" className={s.boutonPlein} disabled={enCours}>
            Enregistrer
          </button>
        </div>
      </form>
    </Fenetre>
  );
}
