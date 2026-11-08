"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import type { vueApercu } from "@/lib/espace-client/vues-equipe";
import { LISTE_SEGMENTS, segmentDe } from "@/lib/espace-client/segments";
import type { TypeClient } from "@/lib/espace-client/types";
import { BandeauMode, Carte, dateFr, Jauge, LienBouton, Pastille, champ, usePorte } from "./socle";

type Donnees = ReturnType<typeof vueApercu>;

const STATUT: Record<string, string> = { en_preparation: "En préparation", planifie: "Planifié", en_cours: "En cours", termine: "Terminé" };

/** La vue d'ensemble : chaque dossier, sa complétude, et ce qui bloque. */
export function Apercu() {
  const porte = usePorte();
  const { base, racine } = porte;
  const { donnees, erreur, recharger } = useRessource<Donnees>(`${base}/apercu`);
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "alertes" | "international" | "termines">("tous");
  const [segment, setSegment] = useState<"" | TypeClient>("");
  const [conseiller, setConseiller] = useState("");

  const lignes = useMemo(() => {
    if (!donnees) return [];
    const t = q.trim().toLowerCase();
    return donnees.lignes.filter((l) => {
      if (t && !`${l.reference} ${l.client.nom} ${l.client.societe ?? ""} ${l.client.email} ${l.depart} ${l.arrivee}`.toLowerCase().includes(t)) return false;
      if (segment && l.client.type !== segment) return false;
      if (conseiller && l.conseiller.id !== conseiller) return false;
      if (filtre === "alertes") return !!l.alerte;
      if (filtre === "international") return l.portee === "international";
      if (filtre === "termines") return l.statut === "termine";
      return l.statut !== "termine";
    });
  }, [donnees, q, filtre, segment, conseiller]);

  if (erreur) return <Echec message={erreur} onRetry={recharger} />;
  if (!donnees) return <Squelette lignes={8} />;

  return (
    <div className="space-y-5">
      <BandeauMode mode={donnees.mode} />
      <Carte
        titre={`${lignes.length} dossier${lignes.length > 1 ? "s" : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Référence, client, ville…" className={`${champ} !w-60`} aria-label="Rechercher un dossier" />
            <select value={filtre} onChange={(e) => setFiltre(e.target.value as typeof filtre)} className={`${champ} !w-auto`} aria-label="Filtrer par étape">
              <option value="tous">En cours</option>
              <option value="alertes">À relancer</option>
              <option value="international">International</option>
              <option value="termines">Terminés</option>
            </select>
            <select value={segment} onChange={(e) => setSegment(e.target.value as typeof segment)} className={`${champ} !w-auto`} aria-label="Filtrer par segment">
              <option value="">Tous les segments</option>
              {LISTE_SEGMENTS.map((s) => (
                <option key={s.cle} value={s.cle}>
                  {s.pluriel}
                </option>
              ))}
            </select>
            {donnees.conseillers.length > 1 && (
              <select value={conseiller} onChange={(e) => setConseiller(e.target.value)} className={`${champ} !w-auto`} aria-label="Filtrer par conseiller">
                <option value="">Tous les conseillers</option>
                {donnees.conseillers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            )}
            <LienBouton href={`${racine}/nouveau`} variante="noir">
              {porte.demo ? "+ Nouveau dossier" : "+ Ouvrir un espace"}
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
                    <p className="text-[11.5px] text-ink-soft">
                      {STATUT[l.statut]}
                      {l.crm != null && !porte.demo && (
                        <>
                          {" · "}
                          <Link href={`/dossiers/${l.crm}`} className="underline decoration-line-strong underline-offset-2 hover:text-ink">
                            CRM
                          </Link>
                        </>
                      )}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium">{l.client.societe ?? l.client.nom}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Pastille ton={l.client.type === "particulier" ? "neutre" : "noir"}>{segmentDe(l.client.type).libelle}</Pastille>
                      <span className="text-[11.5px] text-ink-soft">{l.conseiller.nom}</span>
                      {l.client.masquage && <Pastille ton="attente">Devis/factures masqués</Pastille>}
                      {l.client.demo && <Pastille ton="alerte">Fictif (démonstration)</Pastille>}
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
