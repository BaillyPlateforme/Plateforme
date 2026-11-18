"use client";

import { useMemo, useState } from "react";
import type { LigneEnvoi } from "@/lib/envois/journal";
import type { EtatEnvois } from "@/lib/envois";
import { fournisseurDe, NOM_FOURNISSEUR } from "@/lib/envois/fournisseurs";
import { MODELES_MESSAGE } from "@/lib/espace-client/libelles";
import type { Execution } from "@/taches/veille";
import { relancerVeille } from "@/taches/actions";
import { Bouton, Carte, Pastille, PastilleEnvoi, Retour, champ, dateHeureFr, useAction, type Ton } from "../espace-client/_composants/socle";

export type DonneesSuivi = {
  etat: EtatEnvois;
  paiement: "stripe" | "simule";
  veille: { secret: boolean; taches: { cle: string; libelle: string }[]; executions: Execution[] };
  envois: LigneEnvoi[];
};

const ORIGINES: Record<string, string> = {
  questionnaires: "Questionnaires",
  espace_client: "Espace client",
  crm: "CRM",
  veille: "Veille",
  test: "Test",
};

const STATUT_EXECUTION: Record<Execution["statut"], { ton: Ton; label: string }> = {
  reussie: { ton: "ok", label: "Réussie" },
  partielle: { ton: "attente", label: "En partie" },
  echec: { ton: "alerte", label: "Échec" },
  en_cours: { ton: "neutre", label: "En cours" },
};

const STATUT_TACHE: Record<string, { ton: Ton; label: string }> = {
  faite: { ton: "ok", label: "Faite" },
  rien: { ton: "neutre", label: "Rien à faire" },
  en_attente: { ton: "neutre", label: "Pas encore branchée" },
  partielle: { ton: "attente", label: "En partie" },
  echec: { ton: "alerte", label: "Échec" },
};

const TON_MODE: Record<string, string> = { actif: "text-good", recette: "text-brand-ink", desactive: "text-ink-soft" };

/**
 * Ce que deviennent les e-mails et les SMS, et la tâche de la veille. Pas de
 * tuiles de chiffres : une ligne d'état, la dernière exécution, puis le
 * journal, filtrable.
 */
export default function SuiviEnvois({ d, recharger }: { d: DonneesSuivi; recharger: () => void }) {
  const action = useAction(recharger);
  const [origine, setOrigine] = useState("");
  const [statut, setStatut] = useState("");
  const [q, setQ] = useState("");
  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    return d.envois.filter(
      (e) =>
        (!origine || e.origine === origine) &&
        (!statut || e.statut === statut) &&
        (!t || `${e.destinataire} ${e.sujet ?? ""} ${e.apercu ?? ""} ${e.modele ?? ""} ${e.reference ?? ""} ${e.cle}`.toLowerCase().includes(t)),
    );
  }, [d.envois, origine, statut, q]);
  const derniere = d.veille.executions[0] ?? null;

  return (
    <div className="space-y-5">
      {/* L'état, en une ligne : le réglage des envois et le paiement en ligne. */}
      <div className="rounded-[18px] bg-card px-5 py-4 text-[13px] leading-relaxed">
        <p>
          <b>Envois : </b>
          <span className={`font-semibold ${TON_MODE[d.etat.mode] ?? ""}`}>{d.etat.libelle}</span>
          <span className="text-ink-soft"> — {d.etat.detail}</span>
        </p>
        {d.etat.mode === "recette" && d.etat.liste.length > 0 && <p className="mt-1 text-ink-soft">Liste blanche : {d.etat.liste.join(", ")}.</p>}
        {d.etat.avertissements.map((a) => (
          <p key={a} className="mt-1 font-medium text-danger">
            {a}
          </p>
        ))}
        <p className="mt-1 text-ink-soft">
          Paiement en ligne : {d.paiement === "stripe" ? "Stripe (Checkout hébergé, confirmé par webhook signé)." : "simulé — STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET ne sont pas réglées."}
        </p>
      </div>

      <Carte
        titre="Tâche de la veille"
        action={
          <Bouton disabled={action.enCours} onClick={() => confirm("Relancer la veille maintenant ? Les messages déjà partis ne repartent pas.") && action.lancer(() => relancerVeille())}>
            {action.enCours ? "Exécution…" : "Relancer maintenant"}
          </Bouton>
        }
      >
        <p className="text-[13px]">
          {derniere ? (
            <>
              Dernière exécution le {dateHeureFr(derniere.debut)} ({derniere.declenchement === "planifie" ? "planifiée" : `relancée par ${derniere.par ?? "l'équipe"}`}), pour le {new Date(`${derniere.cible ?? derniere.jour}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} :{" "}
              <Pastille ton={STATUT_EXECUTION[derniere.statut].ton}>{STATUT_EXECUTION[derniere.statut].label}</Pastille>
            </>
          ) : (
            "Jamais exécutée."
          )}
        </p>
        <p className="mt-1 text-[12.5px] text-ink-soft">
          Chaque jour en fin d&apos;après-midi, par le service cron de Railway (POST /api/taches/veille){d.veille.secret ? "." : " — TACHES_SECRET n'est pas réglé : la route n'existe pas, seul ce bouton la lance."} Elle prépare le lendemain : {d.veille.taches.map((t) => t.libelle.toLowerCase()).join(", ")}. Relancée, elle n&apos;envoie rien en double.
        </p>
        <div className="mt-3">
          <Retour r={action.resultat} />
        </div>
        {derniere?.resultat.taches && (
          <ul className="mt-3 divide-y divide-line/70 text-[13px]">
            {derniere.resultat.taches.map((t) => (
              <li key={t.cle} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <span className="w-52 shrink-0 font-medium">{t.libelle}</span>
                <Pastille ton={STATUT_TACHE[t.statut]?.ton ?? "neutre"}>{STATUT_TACHE[t.statut]?.label ?? t.statut}</Pastille>
                <span className="min-w-0 flex-1 text-ink-soft">{t.resume}</span>
              </li>
            ))}
          </ul>
        )}
        {derniere?.resultat.motif && <p className="mt-2 text-[12.5px] text-danger">{derniere.resultat.motif}</p>}
        {d.veille.executions.length > 1 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[12.5px] font-medium">Exécutions précédentes</summary>
            <ul className="mt-2 space-y-1 text-[12.5px] text-ink-soft">
              {d.veille.executions.slice(1).map((e) => (
                <li key={e.id}>
                  {dateHeureFr(e.debut)} · {e.declenchement === "planifie" ? "planifiée" : `manuelle (${e.par ?? "équipe"})`} · {STATUT_EXECUTION[e.statut].label}
                  {e.resultat.taches ? ` — ${e.resultat.taches.map((t) => `${t.libelle} : ${STATUT_TACHE[t.statut]?.label ?? t.statut}`).join(", ")}` : e.resultat.motif ? ` — ${e.resultat.motif}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Carte>

      <Carte
        titre={`Journal des envois · ${lignes.length} message${lignes.length > 1 ? "s" : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            <select value={origine} onChange={(e) => setOrigine(e.target.value)} className={`${champ} !w-44`} aria-label="Origine">
              <option value="">Toutes origines</option>
              {Object.entries(ORIGINES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select value={statut} onChange={(e) => setStatut(e.target.value)} className={`${champ} !w-44`} aria-label="Statut">
              <option value="">Tous statuts</option>
              {["envoye", "journalise", "bloque", "fictif", "bac_a_sable", "echec", "incertain", "en_cours"].map((s) => (
                <option key={s} value={s}>
                  {{ envoye: "Envoyé", journalise: "Journalisé", bloque: "Bloqué (recette)", fictif: "Fictif", bac_a_sable: "Bac à sable", echec: "Échec", incertain: "Incertain", en_cours: "En cours" }[s]}
                </option>
              ))}
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Destinataire, dossier, objet…" className={`${champ} !w-60`} aria-label="Rechercher dans le journal des envois" />
          </div>
        }
      >
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead className="border-y border-line text-left text-[11px] text-ink-soft">
              <tr>
                {["Date", "Origine", "Message", "Destinataire", "Statut"].map((h) => (
                  <th key={h} className="px-5 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {lignes.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-ink-soft">{dateHeureFr(e.cree_le)}</td>
                  <td className="whitespace-nowrap px-5 py-2.5">
                    {ORIGINES[e.origine] ?? e.origine}
                    <span className="block text-[11.5px] text-ink-soft">{e.canal === "sms" ? "SMS" : "E-mail"}</span>
                  </td>
                  <td className="max-w-[340px] px-5 py-2.5">
                    <span className="font-medium">{(e.modele && MODELES_MESSAGE[e.modele]) ?? e.modele ?? "—"}</span>
                    <span className="block truncate text-[12px] text-ink-soft">{e.canal === "sms" ? e.apercu : e.sujet}</span>
                    {e.reference && <span className="block text-[11.5px] tabular-nums text-ink-soft">{e.reference}</span>}
                  </td>
                  <td className="px-5 py-2.5 text-ink-soft">{e.destinataire}</td>
                  <td className="max-w-[300px] px-5 py-2.5">
                    <PastilleEnvoi statut={e.statut} />
                    {e.motif && <span className={`mt-1 block text-[11px] ${e.statut === "echec" || e.statut === "incertain" ? "text-danger" : "text-ink-soft"}`}>{e.motif}</span>}
                    {e.brevo_id && (
                      // L'identifiant du message chez son fournisseur (colonne brevo_id, quel que soit le fournisseur).
                      <span className="mt-1 block truncate text-[11px] text-ink-soft" title={e.brevo_id}>
                        {NOM_FOURNISSEUR[fournisseurDe(e) ?? "brevo"]} : {e.brevo_id}
                      </span>
                    )}
                    {e.tentatives > 1 && <span className="mt-1 block text-[11px] text-ink-soft">{e.tentatives} tentatives</span>}
                  </td>
                </tr>
              ))}
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-ink-soft">
                    Aucun message.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Carte>
    </div>
  );
}
