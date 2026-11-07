"use client";

import Link from "next/link";
import { useActionState } from "react";
import { creerDemo, creerPlan } from "../actions";
import { CAPACITES_INDICATIVES } from "../outils";
import { Picto } from "./Picto";
import s from "./dispatch.module.css";

/** Le formulaire de création d'un plan, et le plan de démonstration : à créer, ou à ouvrir s'il existe. */
export default function NouveauPlan({ demo }: { demo: number | null }) {
  const [etat, envoyer, enCours] = useActionState(creerPlan, null);
  const [etatDemo, envoyerDemo, demoEnCours] = useActionState(async () => creerDemo(), null);
  return (
    <div className={`${s.racine} ${s.creation}`}>
      <form action={envoyer} className={s.carte} id="nouveau">
        <div className={s.carteTete}>
          <span className={s.pastille}>
            <Picto nom="plus" taille={20} />
          </span>
          <div>
            <h3>Nouveau plan de dispatch</h3>
            <p>Un plan par groupage : on y importe les clients, puis on les répartit en conteneurs et en tournées.</p>
          </div>
        </div>
        <div className={s.grille} style={{ marginTop: 18 }}>
          <div className={s.champ}>
            <label htmlFor="nom">Nom</label>
            <input id="nom" name="nom" type="text" required maxLength={120} placeholder="Groupage Antilles · janvier" />
          </div>
          <div className={`${s.champ} ${s.tiers}`}>
            <label htmlFor="sens">Sens</label>
            <select id="sens" name="sens" defaultValue="export">
              <option value="export">Export</option>
              <option value="import">Import</option>
            </select>
          </div>
          <div className={`${s.champ} ${s.tiers}`}>
            <label htmlFor="port">Port</label>
            <input id="port" name="port" type="text" maxLength={80} placeholder="Le Havre" />
          </div>
          <div className={`${s.champ} ${s.tiers}`}>
            <label htmlFor="date_reference">Départ</label>
            <input id="date_reference" name="date_reference" type="date" />
          </div>
          <div className={`${s.champ} ${s.demi}`}>
            <label htmlFor="capacite_20">Capacité 20 pieds</label>
            <div className={s.unite}>
              <input id="capacite_20" name="capacite_20" type="text" inputMode="decimal" defaultValue={CAPACITES_INDICATIVES["20"]} />
              <span>m³</span>
            </div>
          </div>
          <div className={`${s.champ} ${s.demi}`}>
            <label htmlFor="capacite_40">Capacité 40 pieds</label>
            <div className={s.unite}>
              <input id="capacite_40" name="capacite_40" type="text" inputMode="decimal" defaultValue={CAPACITES_INDICATIVES["40"]} />
              <span>m³</span>
            </div>
          </div>
          <p className={s.champ} style={{ fontSize: 12, color: "#77738f", marginTop: -4 }}>
            Valeurs indicatives (volume intérieur courant d&apos;un conteneur standard), à valider avec Bailly : modifiables à tout moment dans les réglages du plan.
          </p>
        </div>
        {etat && !etat.ok && (
          <p className={s.erreur} style={{ marginTop: 14 }}>
            {etat.erreur}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button type="submit" className={s.boutonPlein} disabled={enCours}>
            {enCours ? "Création…" : "Créer le plan"} <Picto nom="fleche" taille={16} />
          </button>
        </div>
      </form>

      <form action={envoyerDemo} className={s.vierge} style={{ placeContent: "center" }}>
        <span className={s.orbe} style={{ animation: "none", width: 64, height: 64, marginBottom: 22 }}>
          <Picto nom="conteneur" taille={28} />
        </span>
        <h3>{demo ? "La démonstration est prête" : "Essayer avec la démonstration"}</h3>
        <p>
          22 clients fictifs au départ du Havre, vers la Martinique, la Guadeloupe, la Guyane, la Réunion et le Canada ; cinq conteneurs ouverts, dont un déjà validé. De quoi essayer la
          proposition de l&apos;IA, le glisser-déposer et les exports sans toucher à un vrai groupage.
        </p>
        {etatDemo && !etatDemo.ok && <p className={s.erreur}>{etatDemo.erreur}</p>}
        {demo ? (
          <>
            <Link href={`/conteneurs/dispatch/${demo}`} className={s.bouton}>
              <Picto nom="fleche" taille={16} /> Ouvrir la démonstration
            </Link>
            <small style={{ color: "#77738f", fontSize: 12 }}>Pour la remettre dans son état d&apos;origine : Réglages du plan › Remettre la démonstration à zéro.</small>
          </>
        ) : (
          <button type="submit" className={s.bouton} disabled={demoEnCours}>
            <Picto nom="etincelle" taille={16} /> {demoEnCours ? "Création…" : "Créer le plan de démonstration"}
          </button>
        )}
      </form>
    </div>
  );
}
