"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { annuler, enregistrerRegle, envoyerMaintenant, reactiver, repousser, type Retour } from "./actions";
import type { Colonne, Relance } from "./moteur";
import s from "@/crm/messages/messages.module.css";

/*
 * Le Kanban des relances : à venir, aujourd'hui, en retard, envoyées,
 * désactivées. Chaque carte se repousse, s'annule ou part tout de suite ;
 * les règles (délais, nombre) se règlent en bas.
 */

const COLONNES: { cle: Colonne; titre: string; vide: string }[] = [
  { cle: "avenir", titre: "À venir", vide: "Rien de prévu." },
  { cle: "aujourdhui", titre: "Aujourd'hui", vide: "Aucune relance aujourd'hui." },
  { cle: "retard", titre: "En retard", vide: "Aucun retard." },
  { cle: "envoyee", titre: "Envoyées", vide: "Aucune relance envoyée." },
  { cle: "desactivee", titre: "Désactivées", vide: "Aucune." },
];

const STATUT_ENVOI: Record<string, string> = {
  envoye: "Envoyée", journalise: "Journalisée (envoi désactivé)", bloque: "Bloquée (recette)", fictif: "Destinataire fictif", bac_a_sable: "Bac à sable",
};

const jourFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

export type RegleVue = { type: string; libelle: string; repere: string; carte: string; carteTitre: string; carteEtat: string; actif: boolean; premier_delai_jours: number; intervalle_jours: number; nombre_max: number };

export default function Kanban({ relances, regles }: { relances: Relance[]; regles: RegleVue[] }) {
  const [retour, setRetour] = useState<Retour | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const agir = (f: () => Promise<Retour>, question?: string) => {
    if (question && !confirm(question)) return;
    demarrer(async () => {
      const r = await f();
      setRetour(r);
      router.refresh();
    });
  };

  return (
    <>
      {retour && (
        <p className={s.etat} role="status" style={{ color: retour.ok ? "var(--ok)" : "var(--warn)", fontWeight: 600 }}>
          {retour.ok ? retour.message : retour.erreur}
        </p>
      )}
      <div className={s.kanban}>
        {COLONNES.map((col) => {
          const liste = relances.filter((r) => r.colonne === col.cle);
          return (
            <section key={col.cle} className={s.colonne} data-col={col.cle} aria-label={col.titre}>
              <header>
                <i />
                {col.titre}
                <span>{liste.length}</span>
              </header>
              {liste.length === 0 && <p className={s.vide}>{col.vide}</p>}
              {liste.map((r) => (
                <article key={r.cle} className={s.relance}>
                  <div className={s.ligne}>
                    <span className={s.badge}>{r.libelle}</span>
                    <small style={{ color: "var(--muted)" }}>
                      {r.rang}/{r.sur}
                    </small>
                  </div>
                  <h4>
                    <Link href={`/dossiers/${r.dossierId}`}>{r.client || r.ref}</Link>
                  </h4>
                  <p>
                    {r.ref} · {r.objet}
                  </p>
                  <p>
                    {col.cle === "envoyee"
                      ? `${r.envoyeeLe ? `Le ${new Date(r.envoyeeLe).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · ` : ""}${STATUT_ENVOI[r.envoiStatut ?? ""] ?? r.envoiStatut ?? ""}`
                      : `${r.reportee ? "Repoussée au" : "Prévue le"} ${jourFr(r.prevue)}`}
                  </p>
                  {r.motif && col.cle !== "envoyee" && <p style={{ color: "var(--ink)" }}>{r.motif}</p>}
                  {["avenir", "aujourdhui", "retard"].includes(col.cle) && (
                    <div className={s.boutons}>
                      <button className={s.mini} data-ton="principal" disabled={enCours} onClick={() => agir(() => envoyerMaintenant(r.cle), `Envoyer maintenant la relance à ${r.client} ?`)}>
                        Envoyer
                      </button>
                      <button className={s.mini} disabled={enCours} onClick={() => agir(() => repousser(r.cle, 3))}>
                        +3 j
                      </button>
                      <button className={s.mini} disabled={enCours} onClick={() => agir(() => repousser(r.cle, 7))}>
                        +7 j
                      </button>
                      <button className={s.mini} disabled={enCours} onClick={() => agir(() => annuler(r.cle), `Annuler les relances « ${r.libelle} » de ${r.client} ?`)}>
                        Annuler
                      </button>
                    </div>
                  )}
                  {col.cle === "desactivee" && r.motif === "Annulée par l'équipe." && (
                    <div className={s.boutons}>
                      <button className={s.mini} disabled={enCours} onClick={() => agir(() => reactiver(r.cle))}>
                        Réactiver
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>
      <Regles regles={regles} agir={agir} enCours={enCours} />
    </>
  );
}

function Regles({ regles, agir, enCours }: { regles: RegleVue[]; agir: (f: () => Promise<Retour>) => void; enCours: boolean }) {
  const [v, setV] = useState(() => Object.fromEntries(regles.map((r) => [r.type, { actif: r.actif, premier_delai_jours: r.premier_delai_jours, intervalle_jours: r.intervalle_jours, nombre_max: r.nombre_max }])));
  const champ = (type: string, k: "premier_delai_jours" | "intervalle_jours" | "nombre_max", libelle: string) => (
    <div>
      <label htmlFor={`${type}-${k}`}>{libelle}</label>
      <input id={`${type}-${k}`} type="number" min={k === "premier_delai_jours" ? 0 : 1} value={v[type][k]} onChange={(e) => setV({ ...v, [type]: { ...v[type], [k]: Number(e.target.value) } })} />
    </div>
  );
  return (
    <details className={s.regles}>
      <summary>Règles des relances — délais, nombre, carte du message</summary>
      <p className={s.aide} style={{ margin: "10px 0 0" }}>
        Les délais de départ sont provisoires, à fixer avec Bailly. La tâche de la veille envoie les relances du jour et celles en retard de trois jours au plus ; au-delà, elles attendent une décision ici. Une carte désactivée, ou dont le texte reste à valider dans « Courriers et SMS », désactive ses relances.
      </p>
      {regles.map((r) => (
        <div key={r.type} className={s.regle}>
          <div>
            <label>
              <input type="checkbox" checked={v[r.type].actif} onChange={(e) => setV({ ...v, [r.type]: { ...v[r.type], actif: e.target.checked } })} /> {r.libelle}
            </label>
            <small style={{ color: "var(--muted)" }}>Compté {r.repere}</small>
          </div>
          {champ(r.type, "premier_delai_jours", "Première (jours)")}
          {champ(r.type, "intervalle_jours", "Puis tous les (jours)")}
          {champ(r.type, "nombre_max", "Nombre au plus")}
          <div>
            <label>Carte du message</label>
            <Link href={`/modeles#${r.carte}`} style={{ fontWeight: 600 }}>
              {r.carteTitre}
            </Link>
            <small style={{ display: "block", color: "var(--muted)" }}>{r.carteEtat}</small>
          </div>
          <button className="btn ghost sm" disabled={enCours} onClick={() => agir(() => enregistrerRegle(r.type, v[r.type]))}>
            Enregistrer
          </button>
        </div>
      ))}
    </details>
  );
}
