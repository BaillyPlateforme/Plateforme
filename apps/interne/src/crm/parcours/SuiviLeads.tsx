"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { modifierSuivi } from "@/lib/actions/suivi";
import { NOM_PARCOURS, type Parcours } from "@/lib/parcours";
import {
  STATUTS,
  estMutation,
  estPrioritaire,
  indicateurs,
  libelleDuLead,
  parcoursDuLead,
  toucheParis,
  versCsv,
  type Lead,
  type StatutLead,
  type Suivi,
} from "@/lib/suivi-commun";

/*
 * Le suivi des leads : le tableau que Margaux tenait à la main, rempli tout
 * seul. Chaque demande du site y arrive avec sa date, son contact, son
 * parcours et ses villes ; l'équipe n'y saisit que l'avancement du devis et
 * le chiffre d'affaires, que Créagidem ne laisse pas exporter. Les
 * indicateurs suivent la période et les filtres choisis.
 *
 * Troisième vue du Parcours depuis la simplification du 08/11/2026 (il était
 * sous Demandes, /dashboard/leads). Règle de David : pas de chiffres en haut
 * d'une liste — les indicateurs et le flux par semaine passent sous le tableau.
 */

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const eur = (n: number) => `${nf.format(n)} €`;
const jour = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });

type Periode = "mois" | "precedent" | "trimestre" | "annee" | "tout";

const PERIODES: { key: Periode; label: string }[] = [
  { key: "mois", label: "Ce mois-ci" },
  { key: "precedent", label: "Mois dernier" },
  { key: "trimestre", label: "3 mois" },
  { key: "annee", label: "Cette année" },
  { key: "tout", label: "Tout" },
];

function bornes(p: Periode, maintenant: Date): [Date, Date] | null {
  const a = maintenant.getFullYear(), m = maintenant.getMonth();
  switch (p) {
    case "mois": return [new Date(a, m, 1), new Date(a, m + 1, 1)];
    case "precedent": return [new Date(a, m - 1, 1), new Date(a, m, 1)];
    case "trimestre": return [new Date(a, m - 2, 1), new Date(a, m + 1, 1)];
    case "annee": return [new Date(a, 0, 1), new Date(a + 1, 0, 1)];
    default: return null;
  }
}

const COULEUR: Record<Parcours, string> = {
  particulier: "var(--color-brand)",
  mutation: "var(--color-ink-soft)",
  entreprise: "var(--color-nuit)",
};

export default function SuiviLeads({ leads: initiaux }: { leads: Lead[] }) {
  const [leads, setLeads] = useState(initiaux);
  const [periode, setPeriode] = useState<Periode>("tout");
  const [parcours, setParcours] = useState<Parcours | "tous">("tous");
  const [statut, setStatut] = useState<StatutLead | "tous">("tous");
  const [recherche, setRecherche] = useState("");
  const [etat, setEtat] = useState<Record<string, "envoi" | "ok" | string>>({});
  // L'horloge est lue une fois : la relire à chaque rendu déplacerait les bornes.
  const [maintenant] = useState(() => new Date());

  const visibles = useMemo(() => {
    const b = bornes(periode, maintenant);
    const q = recherche.trim().toLowerCase();
    return leads.filter((l) => {
      const d = new Date(l.created_at);
      if (b && (d < b[0] || d >= b[1])) return false;
      if (parcours !== "tous" && parcoursDuLead(l) !== parcours) return false;
      if (statut !== "tous" && l.suivi.statut !== statut) return false;
      if (q && ![l.client_nom, l.client_email, l.client_tel, l.depart_ville, l.arrivee_ville, l.societe, l.espace_nom]
        .some((v) => (v ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [leads, periode, parcours, statut, recherche, maintenant]);

  const k = indicateurs(visibles);
  const semaines = useMemo(() => parSemaine(visibles), [visibles]);

  async function enregistrer(id: string, modif: Partial<Suivi>) {
    // L'écran suit la saisie tout de suite ; un refus du serveur la défait.
    const avant = leads.find((l) => l.id === id)?.suivi;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, suivi: { ...l.suivi, ...modif } } : l)));
    setEtat((e) => ({ ...e, [id]: "envoi" }));
    const r = await modifierSuivi(id, modif);
    if (r.suivi) {
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, suivi: r.suivi! } : l)));
      setEtat((e) => ({ ...e, [id]: "ok" }));
    } else {
      if (avant) setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, suivi: avant } : l)));
      setEtat((e) => ({ ...e, [id]: r.erreur ?? "Échec" }));
    }
  }

  function exporter() {
    const blob = new Blob([versCsv(visibles)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `suivi-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-5">
      {/* ── Les filtres ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full bg-card p-1.5">
          {PERIODES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriode(p.key)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition ${
                periode === p.key ? "bg-nuit text-white" : "text-ink-mid hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <select
          value={parcours}
          onChange={(e) => setParcours(e.target.value as Parcours | "tous")}
          className="h-10 rounded-full border border-line bg-card px-4 text-[13px] text-ink"
          aria-label="Parcours"
        >
          <option value="tous">Tous les parcours</option>
          {(Object.keys(NOM_PARCOURS) as Parcours[]).map((p) => (
            <option key={p} value={p}>{NOM_PARCOURS[p]}</option>
          ))}
        </select>
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value as StatutLead | "tous")}
          className="h-10 rounded-full border border-line bg-card px-4 text-[13px] text-ink"
          aria-label="Statut"
        >
          <option value="tous">Tous les statuts</option>
          {STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Nom, ville, société…"
          className="h-10 min-w-[200px] flex-1 rounded-full border border-line bg-card px-4 text-[13px] text-ink outline-none focus:border-ink"
        />
        <button
          type="button"
          onClick={exporter}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-nuit px-4 text-[13px] font-semibold text-white transition active:scale-[0.98]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
          Exporter
        </button>
      </div>

      {/* ── Le tableau ── */}
      <section className="overflow-hidden rounded-[18px] bg-card">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-[17px] font-semibold">
            {visibles.length} lead{visibles.length > 1 ? "s" : ""}
          </h2>
          <span className="text-[12px] text-ink-soft">Statut et montants s&apos;enregistrent dès la saisie.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] text-left text-[13px]">
            <thead>
              <tr className="border-y border-line bg-subtle/60 text-[11px] uppercase tracking-wider text-ink-soft">
                <th className="px-5 py-3 font-semibold">Entrée</th>
                <th className="px-3 py-3 font-semibold">Parcours</th>
                <th className="px-3 py-3 font-semibold">Contact</th>
                <th className="px-3 py-3 font-semibold">Mutation</th>
                <th className="px-3 py-3 font-semibold">Priorité</th>
                <th className="px-3 py-3 font-semibold">Trajet</th>
                <th className="px-3 py-3 font-semibold">Statut</th>
                <th className="px-3 py-3 text-right font-semibold">CA en attente</th>
                <th className="px-3 py-3 text-right font-semibold">CA réalisé</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-ink-soft">Aucun lead pour ces filtres.</td>
                </tr>
              )}
              {visibles.map((l) => (
                <LigneLead key={l.id} lead={l} etat={etat[l.id]} onModifier={(m) => enregistrer(l.id, m)} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Les indicateurs du tableau de Margaux, sous la liste ── */}
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="rounded-[18px] bg-card p-5 md:p-6">
          <h2 className="mb-4 text-[17px] font-semibold">Indicateurs</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            <Indicateur label="Leads" valeur={nf.format(k.leads)} sous={`${k.entreprises} entreprise${k.entreprises > 1 ? "s" : ""}`} couleur="var(--color-brand)" />
            <Indicateur
              label="Mutations"
              valeur={nf.format(k.mutations)}
              sous={k.leads ? `${Math.round((k.mutations / k.leads) * 100)} % des leads` : "—"}
              couleur="var(--color-ink-soft)"
            />
            <Indicateur label="Demandes Paris" valeur={nf.format(k.paris)} sous={`${eur(k.caParis)} réalisés`} couleur="var(--color-nuit)" />
            <Indicateur label="Devis en attente" valeur={nf.format(k.devisAttente)} sous={`${eur(k.caAttente)} en attente`} couleur="var(--color-brand-mid)" />
            <Indicateur label="CA réalisé" valeur={eur(k.caRealise)} sous={`${k.commandes} commande${k.commandes > 1 ? "s" : ""}`} couleur="#2e8b57" />
            <Indicateur label="CA hors mutation" valeur={eur(k.caHorsMutation)} sous="particuliers et entreprises" couleur="var(--color-brand-dark)" />
          </dl>
        </div>

        {/* ── Le flux, semaine par semaine ── */}
        <div className="rounded-[18px] bg-card p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold">Leads par semaine</h2>
            <div className="flex flex-wrap items-center gap-4">
              {(Object.keys(COULEUR) as Parcours[]).map((p) => (
                <span key={p} className="flex items-center gap-1.5 text-[12px] text-ink-soft">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COULEUR[p] }} />
                  {NOM_PARCOURS[p]}
                </span>
              ))}
            </div>
          </div>
          {visibles.length === 0 ? (
            <div className="flex h-[160px] items-center justify-center rounded-[14px] bg-subtle/50 text-[13px] text-ink-soft">
              Aucun lead sur cette période.
            </div>
          ) : (
            <BarresParcours semaines={semaines} />
          )}
        </div>
      </section>
    </div>
  );
}

function LigneLead({
  lead: l,
  etat,
  onModifier,
}: {
  lead: Lead;
  etat?: string;
  onModifier: (m: Partial<Suivi>) => void;
}) {
  const p = parcoursDuLead(l);
  const prioritaire = estPrioritaire(l);
  return (
    <tr className="border-b border-line/70 align-middle transition-colors hover:bg-subtle/40">
      <td className="whitespace-nowrap px-5 py-3 tnum text-ink-mid">{jour.format(new Date(l.created_at))}</td>
      <td className="px-3 py-3">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-subtle px-2.5 py-1 text-[11.5px] font-medium">
          <span className="h-2 w-2 rounded-full" style={{ background: COULEUR[p] }} />
          {libelleDuLead(l)}
        </span>
      </td>
      <td className="px-3 py-3">
        <div className="font-semibold text-ink">{l.client_nom || "—"}</div>
        <div className="mt-0.5 text-[12px] text-ink-soft">
          {[l.client_tel, l.client_email].filter(Boolean).join(" · ")}
        </div>
        {(l.societe || l.espace_nom) && <div className="mt-0.5 text-[12px] font-medium text-brand-ink">{l.societe || l.espace_nom}</div>}
      </td>
      <td className="px-3 py-3">{estMutation(l) ? <Pastille oui>Oui</Pastille> : <Pastille>Non</Pastille>}</td>
      <td className="px-3 py-3">
        <button
          type="button"
          onClick={() => onModifier({ priorite: !prioritaire })}
          title={l.suivi.priorite == null ? "Déduite des villes — cliquez pour forcer" : "Saisie à la main"}
          className="rounded-full transition active:scale-95"
        >
          {prioritaire ? <Pastille oui>Oui</Pastille> : <Pastille>Non</Pastille>}
        </button>
      </td>
      <td className="px-3 py-3">
        <div className="whitespace-nowrap text-ink">
          {l.depart_ville || "—"} <span className="text-ink-soft">→</span> {l.arrivee_ville || "—"}
        </div>
        {toucheParis(l) && <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Paris</div>}
      </td>
      <td className="px-3 py-3">
        <select
          value={l.suivi.statut}
          onChange={(e) => onModifier({ statut: e.target.value as StatutLead })}
          className={`h-9 rounded-full border px-3 text-[12.5px] font-medium ${
            l.suivi.statut === "commande"
              ? "border-good/40 bg-good-soft text-good"
              : l.suivi.statut === "devis"
                ? "border-brand bg-brand-soft text-brand-ink"
                : l.suivi.statut === "perdu"
                  ? "border-line bg-subtle text-ink-soft"
                  : "border-line bg-card text-ink"
          }`}
        >
          {STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-3 text-right">
        <Montant valeur={l.suivi.ca_attente} onValider={(v) => onModifier({ ca_attente: v })} />
      </td>
      <td className="px-3 py-3 text-right">
        <Montant valeur={l.suivi.ca_realise} onValider={(v) => onModifier({ ca_realise: v })} />
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-right">
        <span className={`mr-3 text-[11.5px] ${etat && etat !== "ok" && etat !== "envoi" ? "text-danger" : "text-ink-soft"}`}>
          {etat === "envoi" ? "…" : etat === "ok" ? "Enregistré" : etat ?? ""}
        </span>
        <Link href={`/dashboard/${l.id}`} className="text-[12.5px] font-semibold text-ink underline-offset-4 hover:underline">
          Fiche
        </Link>
      </td>
    </tr>
  );
}

/** Un indicateur de la sélection : un repère de couleur, le chiffre, ce qu'il recouvre. */
function Indicateur({ label, valeur, sous, couleur }: { label: string; valeur: string; sous: string; couleur: string }) {
  return (
    <div className="relative min-w-0 pl-3.5">
      <span className="absolute left-0 top-0.5 h-8 w-1 rounded-full" style={{ background: couleur }} aria-hidden />
      <dt className="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="mt-1 whitespace-nowrap text-[22px] font-bold leading-tight tnum text-ink">{valeur}</dd>
      <dd className="mt-0.5 truncate text-[11.5px] text-ink-soft">{sous}</dd>
    </div>
  );
}

function Pastille({ oui = false, children }: { oui?: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${oui ? "bg-nuit text-brand-clair" : "bg-subtle text-ink-soft"}`}>
      {children}
    </span>
  );
}

/** Un montant saisi à la main : enregistré quand on quitte le champ, s'il a changé. */
function Montant({ valeur, onValider }: { valeur: number | null; onValider: (v: number | null) => void }) {
  const [texte, setTexte] = useState(valeur == null ? "" : String(valeur));
  const [vu, setVu] = useState(valeur);
  // Une valeur revenue du serveur remplace la saisie affichée.
  if (valeur !== vu) {
    setVu(valeur);
    setTexte(valeur == null ? "" : String(valeur));
  }
  const valider = () => {
    const n = texte.trim() === "" ? null : parseFloat(texte.replace(/\s/g, "").replace(",", "."));
    const propre = n == null || Number.isNaN(n) ? null : n;
    if (propre !== valeur) onValider(propre);
  };
  return (
    <span className="relative inline-block">
      <input
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        inputMode="decimal"
        placeholder="—"
        className="h-9 w-[104px] rounded-full border border-line bg-card pl-3 pr-7 text-right text-[13px] tnum outline-none focus:border-ink"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-soft">€</span>
    </span>
  );
}

/* ─────────────── Le flux par semaine ─────────────── */

type Semaine = { debut: Date; parcours: Record<Parcours, number> };

/** Les leads rangés par semaine (lundi), sur les douze dernières semaines de la sélection. */
function parSemaine(leads: Lead[]): Semaine[] {
  const lundi = (d: Date) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  const fin = leads.length ? lundi(new Date(Math.max(...leads.map((l) => +new Date(l.created_at))))) : lundi(new Date());
  const semaines: Semaine[] = Array.from({ length: 12 }, (_, i) => {
    const debut = new Date(fin);
    debut.setDate(debut.getDate() - 7 * (11 - i));
    return { debut, parcours: { particulier: 0, mutation: 0, entreprise: 0 } };
  });
  for (const l of leads) {
    const s = semaines.find((x) => +x.debut === +lundi(new Date(l.created_at)));
    if (s) s.parcours[parcoursDuLead(l)] += 1;
  }
  return semaines;
}

function BarresParcours({ semaines }: { semaines: Semaine[] }) {
  const W = 840, H = 210, bas = 22;
  const max = Math.max(1, ...semaines.map((s) => s.parcours.particulier + s.parcours.mutation + s.parcours.entreprise));
  const pas = W / semaines.length;
  const largeur = Math.min(30, pas - 16);
  const ech = (v: number) => (v / max) * (H - bas - 14);
  const court = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Leads par semaine et par parcours">
      {semaines.map((s, i) => {
        const x = pas * i + pas / 2 - largeur / 2;
        let y = H - bas;
        const total = s.parcours.particulier + s.parcours.mutation + s.parcours.entreprise;
        return (
          <g key={+s.debut}>
            {(["particulier", "mutation", "entreprise"] as Parcours[]).map((p) => {
              const h = ech(s.parcours[p]);
              if (h <= 0) return null;
              y -= h;
              return <rect key={p} x={x} y={y} width={largeur} height={Math.max(2, h - 1.5)} rx="5" fill={COULEUR[p]} />;
            })}
            {total > 0 && (
              <text x={x + largeur / 2} y={y - 5} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--color-ink-mid)">
                {total}
              </text>
            )}
            <text x={x + largeur / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--color-ink-soft)">
              {court.format(s.debut)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
