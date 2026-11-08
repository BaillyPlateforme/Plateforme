"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Icone } from "@/ui/icones";
import Fenetre from "@/crm/exploitation/ui/Fenetre";
import Formulaire from "@/crm/exploitation/ui/Formulaire";
import u from "@/crm/exploitation/ui/ui.module.css";
import { creerLitige, majLitige, supprimerLitige } from "./actions";
import type { Litige } from "./donnees";

/*
 * La liste globale des litiges et leurs fenêtres : une ligne s'ouvre d'un
 * clic pour être modifiée (libellé, origine, description, montant, statut,
 * sous-traitant en cause) ; « Nouveau litige » en ouvre un sur un dossier.
 */
const STATUTS = { ouvert: { libelle: "Ouvert", ton: "rose" }, en_cours: { libelle: "Pris en charge", ton: "ambre" }, clos: { libelle: "Clos", ton: "vert" } } as const;
const eur = (n: number | null) => (n == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n));
const jourFr = (v: string | null) => (v ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${v}T12:00:00Z`)) : "—");

type Listes = { origines: string[]; sousTraitants: { id: number; nom: string }[] };

function Champs({ l, listes, dossiers }: { l?: Litige; listes: Listes; dossiers?: { id: number; ref: string; client: string }[] }) {
  return (
    <div className={u.champs}>
      {dossiers && (
        <div className={`${u.champ} ${u.w12}`}>
          <label htmlFor="lt-dossier">
            Dossier <em>*</em>
          </label>
          <select id="lt-dossier" name="dossier_id" required defaultValue="">
            <option value="">Choisir un dossier…</option>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.ref} · {d.client}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className={`${u.champ} ${u.w8}`}>
        <label htmlFor="lt-objet">
          Libellé <em>*</em>
        </label>
        <input id="lt-objet" type="text" name="objet" defaultValue={l?.objet ?? ""} required placeholder="Meuble rayé au déchargement, carton manquant…" />
      </div>
      <div className={`${u.champ} ${u.w4}`}>
        <label htmlFor="lt-ouvert">Ouvert le</label>
        <input id="lt-ouvert" type="date" name="ouvert_le" defaultValue={l?.ouvert_le ?? ""} />
      </div>
      <div className={`${u.champ} ${u.w4}`}>
        <label htmlFor="lt-origine">Origine</label>
        <input id="lt-origine" type="text" name="origine" list="lt-origines" defaultValue={l?.origine ?? ""} autoComplete="off" />
        <datalist id="lt-origines">{listes.origines.map((o) => <option key={o} value={o} />)}</datalist>
      </div>
      <div className={`${u.champ} ${u.w4}`}>
        <label htmlFor="lt-montant">Montant (€)</label>
        <input id="lt-montant" type="number" min={0} step="0.01" name="montant" defaultValue={l?.montant ?? ""} />
      </div>
      <div className={`${u.champ} ${u.w4}`}>
        <label htmlFor="lt-statut">Statut</label>
        <select id="lt-statut" name="statut" defaultValue={l?.statut ?? "ouvert"}>
          {Object.entries(STATUTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.libelle}
            </option>
          ))}
        </select>
      </div>
      <div className={`${u.champ} ${u.w12}`}>
        <label htmlFor="lt-st">Sous-traitant en cause</label>
        <select id="lt-st" name="sous_traitant_id" defaultValue={l?.sous_traitant_id ?? ""}>
          <option value="">Aucun</option>
          {listes.sousTraitants.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
      </div>
      <div className={`${u.champ} ${u.w12}`}>
        <label htmlFor="lt-description">Description</label>
        <textarea id="lt-description" name="description" defaultValue={l?.description ?? ""} placeholder="Ce qui s'est passé, ce que demande le client, les échanges…" />
      </div>
    </div>
  );
}

export function NouveauLitige({ listes, dossiers }: { listes: Listes; dossiers: { id: number; ref: string; client: string }[] }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)}>
        Nouveau litige
        <Icone nom="plus" taille={17} />
      </button>
      <Fenetre ouvert={ouvert} fermer={() => setOuvert(false)} titre="Nouveau litige" sousTitre="Sur un dossier signé, planifié ou terminé" icone="litige" ton="rose">
        <Formulaire action={creerLitige} className={u.fenetreFormulaire} onSucces={() => setOuvert(false)}>
          <div className={u.fenetreCorps}>
            <Champs listes={listes} dossiers={dossiers} />
          </div>
          <div className={u.fenetrePied}>
            <button type="button" className={u.bouton} data-ton="secondaire" onClick={() => setOuvert(false)}>
              Annuler
            </button>
            <button type="submit" className={u.bouton}>
              Ouvrir le litige
            </button>
          </div>
        </Formulaire>
      </Fenetre>
    </>
  );
}

export function TableLitiges({ lignes, listes }: { lignes: Litige[]; listes: Listes }) {
  const [edite, setEdite] = useState<Litige | null>(null);
  const [, lancer] = useTransition();
  const total = lignes.reduce((a, l) => a + (l.montant ?? 0), 0);
  return (
    <>
      <div className={u.defile}>
        <table className={u.tableau}>
          <thead>
            <tr>
              <th>N°</th>
              <th>Ouvert le</th>
              <th>Dossier</th>
              <th>Origine</th>
              <th>Libellé</th>
              <th>Sous-traitant</th>
              <th className={u.droite}>Montant</th>
              <th>État</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className={u.ligneLien} onClick={() => setEdite(l)}>
                <td>
                  <button type="button" className={`${u.ref} ${u.nowrap}`} style={{ border: 0, background: "none", font: "inherit", cursor: "pointer", padding: 0 }} onClick={() => setEdite(l)}>
                    {l.numero}
                  </button>
                </td>
                <td className={u.nowrap}>{jourFr(l.ouvert_le)}</td>
                <td>
                  <Link href={`/dossiers/${l.dossier_id}`} className={u.lien} onClick={(e) => e.stopPropagation()}>
                    {l.client}
                  </Link>
                  <small>{l.ref}</small>
                </td>
                <td>{l.origine ?? "—"}</td>
                <td style={{ minWidth: 220 }}>
                  <b>{l.objet}</b>
                  {l.description && <small style={{ whiteSpace: "normal" }}>{l.description.length > 90 ? `${l.description.slice(0, 90)}…` : l.description}</small>}
                </td>
                <td>
                  {l.sous_traitant_id ? (
                    <Link href={`/sous-traitants/${l.sous_traitant_id}`} className={u.lien} onClick={(e) => e.stopPropagation()}>
                      {l.sous_traitant}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={u.droite}>
                  <b>{eur(l.montant)}</b>
                </td>
                <td>
                  <i className={u.etat} data-ton={STATUTS[l.statut].ton}>
                    {STATUTS[l.statut].libelle}
                  </i>
                  {l.clos_le && <small>le {jourFr(l.clos_le)}</small>}
                </td>
              </tr>
            ))}
          </tbody>
          {lignes.length > 1 && (
            <tfoot>
              <tr>
                <td colSpan={6} style={{ padding: "14px", fontWeight: 700 }}>
                  {lignes.length} litiges
                </td>
                <td className={u.droite} style={{ padding: "14px", fontWeight: 800 }}>
                  {eur(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Fenetre ouvert={!!edite} fermer={() => setEdite(null)} titre={edite ? `Litige ${edite.numero}` : "Litige"} sousTitre={edite ? `${edite.client} · ${edite.ref}` : undefined} icone="litige" ton="rose">
        {edite && (
          <Formulaire key={edite.id} action={majLitige.bind(null, edite.id)} className={u.fenetreFormulaire} onSucces={() => setEdite(null)}>
            <div className={u.fenetreCorps}>
              <Champs l={edite} listes={listes} />
            </div>
            <div className={u.fenetrePied}>
              <button
                type="button"
                className={u.bouton}
                data-ton="danger"
                data-gauche
                onClick={() => {
                  if (!window.confirm(`Supprimer le litige ${edite.numero} ? Pour un litige réglé, choisissez plutôt « Clos ».`)) return;
                  lancer(async () => {
                    await supprimerLitige(edite.id);
                    setEdite(null);
                  });
                }}
              >
                Supprimer
              </button>
              <Link href={`/dossiers/${edite.dossier_id}`} className={u.bouton} data-ton="secondaire">
                Ouvrir le dossier
              </Link>
              <button type="submit" className={u.bouton}>
                Enregistrer
              </button>
            </div>
          </Formulaire>
        )}
      </Fenetre>
    </>
  );
}
