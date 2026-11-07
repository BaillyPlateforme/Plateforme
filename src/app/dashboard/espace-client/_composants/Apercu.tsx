"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import type { vueApercu } from "@/lib/espace-client/vues-equipe";
import { BandeauMode, Carte, dateFr, Jauge, LienBouton, Pastille, champ, usePorte } from "./socle";

type Donnees = ReturnType<typeof vueApercu>;

const STATUT: Record<string, string> = { en_preparation: "En préparation", planifie: "Planifié", en_cours: "En cours", termine: "Terminé" };

/** La vue d'ensemble : chaque dossier, sa complétude, et ce qui bloque. */
export function Apercu() {
  const { base, racine } = usePorte();
  const { donnees, erreur, recharger } = useRessource<Donnees>(`${base}/apercu`);
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "alertes" | "grands" | "international" | "termines">("tous");

  const lignes = useMemo(() => {
    if (!donnees) return [];
    const t = q.trim().toLowerCase();
    return donnees.lignes.filter((l) => {
      if (t && !`${l.reference} ${l.client.nom} ${l.client.societe ?? ""} ${l.client.email} ${l.depart} ${l.arrivee}`.toLowerCase().includes(t)) return false;
      if (filtre === "alertes") return !!l.alerte;
      if (filtre === "grands") return l.client.type === "grand_compte";
      if (filtre === "international") return l.portee === "international";
      if (filtre === "termines") return l.statut === "termine";
      return l.statut !== "termine";
    });
  }, [donnees, q, filtre]);

  if (erreur) return <Echec message={erreur} onRetry={recharger} />;
  if (!donnees) return <Squelette lignes={8} />;
  const k = donnees.kpis;

  return (
    <div className="space-y-5">
      <BandeauMode mode={donnees.mode} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { l: "Dossiers en cours", v: k.actifs, f: "tous" as const },
          { l: "Conditions de livraison manquantes (J−21)", v: k.alertes, f: "alertes" as const, chaud: k.alertes > 0 },
          { l: "Nombres de cartons à saisir", v: k.cartonsASaisir, lien: `${racine}/cartons` },
          { l: "Déclarations SAV ouvertes", v: k.savOuverts, lien: `${racine}/sav` },
        ].map((x) => {
          const corps = (
            <>
              <p className="text-[12px] text-ink-soft">{x.l}</p>
              <p className={`mt-2 text-[34px] font-bold leading-none tabular-nums ${x.chaud ? "text-danger" : ""}`}>{x.v}</p>
            </>
          );
          return x.lien ? (
            <Link key={x.l} href={x.lien} className="rounded-[18px] bg-card p-5 transition hover:-translate-y-0.5">
              {corps}
            </Link>
          ) : (
            <button key={x.l} onClick={() => setFiltre(x.f!)} className={`rounded-[18px] p-5 text-left transition hover:-translate-y-0.5 ${filtre === x.f ? "bg-brand-soft" : "bg-card"}`}>
              {corps}
            </button>
          );
        })}
      </div>

      <Carte
        titre={`${lignes.length} dossier${lignes.length > 1 ? "s" : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Référence, client, ville…" className={`${champ} !w-60`} aria-label="Rechercher un dossier" />
            <select value={filtre} onChange={(e) => setFiltre(e.target.value as typeof filtre)} className={`${champ} !w-auto`} aria-label="Filtrer">
              <option value="tous">En cours</option>
              <option value="alertes">À relancer</option>
              <option value="grands">Grands comptes</option>
              <option value="international">International</option>
              <option value="termines">Terminés</option>
            </select>
            <LienBouton href={`${racine}/nouveau`} variante="noir">
              + Nouveau dossier
            </LienBouton>
          </div>
        }
      >
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-y border-line text-left text-[11.5px] text-ink-soft">
              <tr>
                {["Dossier", "Client", "Trajet", "Date", "Complétude", "Prochaine étape du client"].map((h) => (
                  <th key={h} className="px-5 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {lignes.map((l) => (
                <tr key={l.id} className="hover:bg-subtle/50">
                  <td className="px-5 py-3">
                    <Link href={`${racine}/dossiers/${l.id}`} className="font-semibold tabular-nums hover:text-brand-ink">
                      {l.reference}
                    </Link>
                    <p className="text-[11.5px] text-ink-soft">{STATUT[l.statut]}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium">{l.client.societe ?? l.client.nom}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {l.client.type === "grand_compte" ? <Pastille ton="noir">Grand compte</Pastille> : <Pastille>Particulier</Pastille>}
                      {l.client.masquage && <Pastille ton="attente">Devis/factures masqués</Pastille>}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {l.depart} → {l.arrivee}
                    <p className="text-[11.5px] text-ink-soft">{l.portee === "international" ? `International · ${l.pays}` : "National"}</p>
                  </td>
                  <td className="px-5 py-3 tabular-nums">
                    {dateFr(l.debut)}
                    <p className="text-[11.5px] text-ink-soft">{l.statut === "termine" ? "terminé" : l.joursAvant > 0 ? `dans ${l.joursAvant} j` : l.joursAvant === 0 ? "aujourd'hui" : "en cours"}</p>
                  </td>
                  <td className="px-5 py-3">
                    <Jauge pourcent={l.pourcent} />
                  </td>
                  <td className="px-5 py-3">
                    {l.alerte ? <Pastille ton="alerte">{l.alerte}</Pastille> : l.prochaine ? <span>{l.prochaine}</span> : <Pastille ton="ok">Tout est fait</Pastille>}
                    {!l.alerte && l.bloque && l.prochaineCle !== "conditions" && <p className="mt-0.5 text-[11.5px] text-brand-ink">Conditions de livraison à valider</p>}
                  </td>
                </tr>
              ))}
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-ink-soft">
                    Aucun dossier ne correspond.
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
