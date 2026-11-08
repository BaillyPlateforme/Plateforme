"use client";

import { useMemo, useState } from "react";
import { ETAPE_RH, FORMULES_ORDRE, FORMULES_RH, type CleEtapeRh, type FormuleRh, type MobiliteRh } from "@/lib/rh-modele";
import { PastilleEtape, Vide } from "../_ui/briques";
import { Picto } from "../_ui/Icones";
import { csvMobilites, euro, formule, nomDeFichier, quand, telecharger } from "../calculs";

type Groupe = "toutes" | "cours" | "termine" | "clos";
type Tri = "recentes" | "date" | "nom";

const NATURE: Record<NonNullable<MobiliteRh["montant"]>["nature"], string> = { estimation: "estimation", devis: "devis envoyé", signe: "devis signé" };

/**
 * Les collaborateurs : une ligne par mobilité, avec recherche, filtres et
 * export. Une ligne s'ouvre sur la fiche du collaborateur et sa chronologie.
 */
export default function VueCollaborateurs({
  mobilites,
  couts,
  entreprise,
  etape,
  onEtape,
  onOuvrir,
}: {
  mobilites: MobiliteRh[];
  couts: boolean;
  entreprise: string;
  etape: CleEtapeRh | null;
  onEtape: (e: CleEtapeRh | null) => void;
  onOuvrir: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [groupe, setGroupe] = useState<Groupe>("toutes");
  const [laFormule, setLaFormule] = useState<FormuleRh | "">("");
  const [tri, setTri] = useState<Tri>("recentes");

  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    const liste = mobilites.filter((m) => {
      const e = ETAPE_RH[m.etape];
      if (etape && m.etape !== etape) return false;
      if (!etape && groupe === "cours" && !e.ouverte) return false;
      if (!etape && groupe === "termine" && m.etape !== "termine") return false;
      if (!etape && groupe === "clos" && m.etape !== "sans_suite" && m.etape !== "cloturee") return false;
      if (laFormule && m.formule !== laFormule) return false;
      return !t || [m.nom, m.depart, m.arrivee, m.reference, m.depart_cp, m.arrivee_cp].some((x) => (x ?? "").toLowerCase().includes(t));
    });
    const cleDate = (m: MobiliteRh) => m.date ?? (m.mois ? `${m.mois}-28` : "9999");
    return [...liste].sort((a, b) =>
      tri === "nom" ? a.nom.localeCompare(b.nom, "fr") : tri === "date" ? cleDate(a).localeCompare(cleDate(b)) : b.cree_le.localeCompare(a.cree_le),
    );
  }, [mobilites, q, groupe, etape, laFormule, tri]);

  const compte = (g: Groupe) =>
    g === "toutes"
      ? mobilites.length
      : mobilites.filter((m) => (g === "cours" ? ETAPE_RH[m.etape].ouverte : g === "termine" ? m.etape === "termine" : m.etape === "sans_suite" || m.etape === "cloturee")).length;

  if (mobilites.length === 0)
    return <Vide picto="personnes" titre="Aucun collaborateur pour l'instant" texte="Les demandes de vos collaborateurs apparaîtront ici dès qu'ils auront utilisé le lien de votre espace." />;

  return (
    <div className="space-y-4">
      {/* ── Les filtres : une seule rangée, au-dessus de la liste ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative min-w-[200px] flex-1 basis-[240px]">
          <span className="sr-only">Rechercher</span>
          <Picto nom="recherche" taille={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Collaborateur, ville, référence…"
            className="h-11 w-full rounded-full border border-line bg-card pl-11 pr-4 text-[13.5px] outline-none transition focus:border-ink"
          />
        </label>
        <div role="radiogroup" aria-label="Étape" className="grid w-full grid-cols-2 gap-1 rounded-[20px] border border-line bg-card p-1 text-[12.5px] font-semibold sm:flex sm:w-auto sm:gap-0 sm:rounded-full">
          {(
            [
              ["toutes", "Toutes"],
              ["cours", "En cours"],
              ["termine", "Terminées"],
              ["clos", "Sans suite"],
            ] as [Groupe, string][]
          ).map(([cle, texte]) => {
            const actif = !etape && groupe === cle;
            return (
              <button
                key={cle}
                type="button"
                role="radio"
                aria-checked={actif}
                onClick={() => {
                  onEtape(null);
                  setGroupe(cle);
                }}
                className={`flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 transition sm:py-1.5 ${actif ? "bg-[#1b1a18] text-white" : "text-ink-mid hover:text-ink"}`}
              >
                {texte}
                <span className={`tabular-nums ${actif ? "text-white/60" : "text-ink-soft"}`}>{compte(cle)}</span>
              </button>
            );
          })}
        </div>
        <div className="grid w-full grid-cols-2 gap-2.5 sm:flex sm:w-auto">
          <select
            aria-label="Formule"
            value={laFormule}
            onChange={(e) => setLaFormule(e.target.value as FormuleRh | "")}
            className="h-11 min-w-0 rounded-full border border-line bg-card px-4 text-[13px] font-semibold outline-none focus:border-ink"
          >
            <option value="">Toutes les formules</option>
            {FORMULES_ORDRE.map((f) => (
              <option key={f} value={f}>
                {FORMULES_RH[f]}
              </option>
            ))}
          </select>
          <select aria-label="Trier" value={tri} onChange={(e) => setTri(e.target.value as Tri)} className="h-11 min-w-0 rounded-full border border-line bg-card px-4 text-[13px] font-semibold outline-none focus:border-ink">
            <option value="recentes">Plus récentes</option>
            <option value="date">Date du déménagement</option>
            <option value="nom">Collaborateur (A → Z)</option>
          </select>
        </div>
        <button
          type="button"
          data-export-csv
          disabled={lignes.length === 0}
          onClick={() => telecharger(csvMobilites(lignes, couts), "text/csv;charset=utf-8", `mobilites-${nomDeFichier(entreprise)}.csv`)}
          className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#1b1a18] px-4 text-[13px] font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:opacity-40 sm:w-auto"
        >
          <Picto nom="telecharger" taille={16} /> Exporter (CSV)
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-1 text-[12.5px] text-ink-soft">
        <span>
          {lignes.length} mobilité{lignes.length > 1 ? "s" : ""}
        </span>
        {etape && (
          <button
            type="button"
            onClick={() => onEtape(null)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1b1a18] py-1 pl-3 pr-2 text-[12px] font-semibold text-white"
            aria-label={`Retirer le filtre : ${ETAPE_RH[etape].label}`}
          >
            Étape : {ETAPE_RH[etape].label}
            <Picto nom="croix" taille={12} trait={2.4} />
          </button>
        )}
      </div>

      {/* ── Sur ordinateur : un tableau ── */}
      <div className="bloc hidden overflow-hidden rounded-[24px] border border-line bg-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line bg-subtle/60 text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                <th className="px-5 py-3 font-semibold">Collaborateur</th>
                <th className="px-4 py-3 font-semibold">Trajet</th>
                <th className="px-4 py-3 font-semibold">Déménagement</th>
                <th className="px-4 py-3 font-semibold">Formule</th>
                <th className="px-4 py-3 font-semibold">Étape</th>
                {couts && <th className="px-5 py-3 text-right font-semibold">Montant HT</th>}
              </tr>
            </thead>
            <tbody>
              {lignes.map((m) => (
                <tr
                  key={m.id}
                  data-mobilite={m.id}
                  tabIndex={0}
                  onClick={() => onOuvrir(m.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOuvrir(m.id))}
                  className="cursor-pointer border-b border-line outline-none transition last:border-0 hover:bg-brand-soft/50 focus-visible:bg-brand-soft/60"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Initiales nom={m.nom} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{m.nom}</div>
                        <div className="text-[12px] text-ink-soft">{m.reference ? `Réf. ${m.reference}` : `Demande du ${new Date(m.cree_le).toLocaleDateString("fr-FR")}`}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium">
                      {m.depart ?? "?"} <span className="text-ink-soft">→</span> {m.arrivee ?? "?"}
                    </div>
                    {m.distance_km != null && <div className="text-[12px] text-ink-soft">{Math.round(m.distance_km).toLocaleString("fr-FR")} km</div>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium">{quand(m)}</div>
                    <div className="text-[12px] text-ink-soft">{m.date ? (m.date_fixee ? "date fixée" : "date souhaitée") : m.mois ? "mois prévu" : ""}</div>
                  </td>
                  <td className="px-4 py-3.5">{formule(m.formule)}</td>
                  <td className="px-4 py-3.5">
                    <PastilleEtape etape={m.etape} />
                  </td>
                  {couts && (
                    <td className="px-5 py-3.5 text-right">
                      {m.montant ? (
                        <>
                          <div className="font-semibold tabular-nums">{euro(m.montant.ht)}</div>
                          <div className="text-[11.5px] text-ink-soft">{NATURE[m.montant.nature]}</div>
                        </>
                      ) : (
                        <span className="text-ink-soft">à chiffrer</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lignes.length === 0 && <p className="px-5 py-10 text-center text-[13.5px] text-ink-soft">Aucune mobilité ne correspond à ces critères.</p>}
      </div>

      {/* ── Sur téléphone : des cartes ── */}
      <ul className="space-y-2.5 md:hidden">
        {lignes.map((m) => (
          <li key={m.id}>
            <button type="button" data-mobilite={m.id} onClick={() => onOuvrir(m.id)} className="bloc w-full rounded-[20px] border border-line bg-card p-4 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Initiales nom={m.nom} />
                  <div className="min-w-0">
                    <div className="truncate text-[14.5px] font-semibold">{m.nom}</div>
                    <div className="truncate text-[12.5px] text-ink-soft">
                      {m.depart ?? "?"} → {m.arrivee ?? "?"}
                    </div>
                  </div>
                </div>
                {couts && m.montant && <div className="shrink-0 text-right text-[14px] font-bold tabular-nums">{euro(m.montant.ht)}</div>}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <PastilleEtape etape={m.etape} />
                <span className="text-[12.5px] text-ink-mid">
                  <Picto nom="calendrier" taille={13} className="mr-1 inline -translate-y-px" />
                  {quand(m)}
                </span>
              </div>
            </button>
          </li>
        ))}
        {lignes.length === 0 && <p className="py-8 text-center text-[13.5px] text-ink-soft">Aucune mobilité ne correspond à ces critères.</p>}
      </ul>
    </div>
  );
}

export function Initiales({ nom, grand = false }: { nom: string; grand?: boolean }) {
  const lettres = nom
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-bold text-brand-ink ${grand ? "h-12 w-12 text-[16px]" : "h-9 w-9 text-[12.5px]"}`}
    >
      {lettres || "?"}
    </span>
  );
}
