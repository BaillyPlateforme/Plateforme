"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import { Aires, BarresEmpilees, BarresGroupees, Popularite } from "./Charts";
import FluxBarres from "./FluxBarres";
import { TONS } from "./tons";
import { STATUS_META } from "../status";
import type { RequestRow } from "@/lib/types";
import type { preparerTableauDeBord } from "@/lib/tableau-de-bord";

type Donnees = Awaited<ReturnType<typeof preparerTableauDeBord>>;

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const FENETRE = 90;
const JOUR = 86_400_000;
const QUALIFIEES = ["qualified", "quoted", "won"];
const moisCourt = new Intl.DateTimeFormat("fr-FR", { month: "short" });
const jourCourt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });

export default function TableauDeBordPage() {
  const { donnees, erreur, recharger } = useRessource<Donnees>("/api/data/tableau-de-bord");

  if (erreur) {
    return (
      <div className="px-5 py-5 md:px-7 md:py-6">
        <Echec message={erreur} onRetry={recharger} />
      </div>
    );
  }
  if (!donnees) {
    return (
      <div className="px-5 py-5 md:px-7 md:py-6">
        <Squelette lignes={8} />
      </div>
    );
  }
  return <Contenu d={donnees} />;
}

/* ─────────────── les séries du graphique, par période ─────────────── */

const PERIODES = [
  { cle: "7j", label: "7 J" },
  { cle: "30j", label: "30 J" },
  { cle: "12s", label: "12 S" },
  { cle: "6m", label: "6 M" },
  { cle: "12m", label: "12 M" },
] as const;
type Periode = (typeof PERIODES)[number]["cle"];

/** Découpe les demandes en créneaux : jours, semaines ou mois selon la période. */
function serie(requests: RequestRow[], periode: Periode) {
  const now = new Date();
  const creneaux: { label: string; debut: number; fin: number }[] = [];

  if (periode === "7j" || periode === "30j") {
    const n = periode === "7j" ? 7 : 30;
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      creneaux.push({ label: jourCourt.format(d), debut: +d, fin: +d + JOUR });
    }
  } else if (periode === "12s") {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i * 7);
      creneaux.push({ label: `S${12 - i}`, debut: +d - 6 * JOUR, fin: +d + JOUR });
    }
  } else {
    const n = periode === "6m" ? 6 : 12;
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const f = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      creneaux.push({ label: moisCourt.format(d).replace(".", ""), debut: +d, fin: +f });
    }
  }

  const labels = creneaux.map((c) => c.label);
  const recues = creneaux.map(
    (c) => requests.filter((r) => { const t = +new Date(r.created_at); return t >= c.debut && t < c.fin; }).length,
  );
  const qualifiees = creneaux.map(
    (c) =>
      requests.filter((r) => {
        const t = +new Date(r.created_at);
        return t >= c.debut && t < c.fin && QUALIFIEES.includes(r.status);
      }).length,
  );
  return { labels, recues, qualifiees };
}

function Contenu({ d }: { d: Donnees }) {
  const {
    requests, devis, tuiles, JOURS, revenus, semaines, SEMAINES,
    totalRecues, totalQualifiees, objectif, villes, villeMax, tons, deps, depMax,
    volQualifie, volAttente, septLabels, sixLabels,
  } = d;

  const [periode, setPeriode] = useState<Periode>("12m");
  const flux = useMemo(() => serie(requests, periode), [requests, periode]);

  const jauges = [
    { label: "Demandes qualifiées", valeur: `${totalQualifiees}`, part: pct(totalQualifiees, totalRecues), ton: "var(--color-brand)" },
    { label: "Demandes devisées", valeur: `${devis.length}`, part: pct(devis.length, requests.length), ton: "var(--color-accent)", pointeur: true },
    {
      label: "Volume déjà chiffré",
      valeur: `${nf.format(volQualifie.reduce((a, b) => a + b, 0))} m³`,
      part: pct(
        volQualifie.reduce((a, b) => a + b, 0),
        volQualifie.reduce((a, b) => a + b, 0) + volAttente.reduce((a, b) => a + b, 0),
      ),
      ton: "var(--color-brand-dark)",
    },
    { label: "Reste à traiter", valeur: `${totalRecues - totalQualifiees}`, part: pct(totalRecues - totalQualifiees, totalRecues), ton: "var(--color-ink-soft)" },
  ];

  const dernieres = [...requests]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 6);

  return (
    <div className="space-y-5 px-5 py-5 md:px-7 md:py-6">
      <Banniere demandes={requests.length} devis={devis.length} />

      {/* ── Les quatre tuiles ── */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {tuiles.map((t) => (
          <div key={t.label} className="rounded-[18px] bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-ink/10"
                style={{ background: t.pastille, color: t.encre }}
              >
                {ICONES[t.icone]}
              </span>
              <span
                className="rounded-full px-3 py-1.5 text-[12px] font-medium"
                style={{ background: t.fond, color: t.badge }}
              >
                {t.delta === null ? `${FENETRE} jours` : `${t.delta >= 0 ? "+" : ""}${t.delta} %`}
              </span>
            </div>
            <div className="mt-6 text-[14.5px] text-ink-soft">{t.label}</div>
            <div className="mt-1.5 text-[26px] font-bold leading-none tnum">{t.valeur}</div>
          </div>
        ))}
      </div>

      {/* ── Le graphique et le panneau de droite ── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-[18px] bg-card p-5 md:p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[20px] font-bold tracking-tight">Demandes</h2>
            <div className="flex items-center gap-1 rounded-full bg-subtle p-1.5">
              {PERIODES.map((p) => (
                <button
                  key={p.cle}
                  onClick={() => setPeriode(p.cle)}
                  aria-pressed={periode === p.cle}
                  className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition ${
                    periode === p.cle ? "bg-olive text-white" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <FluxBarres labels={flux.labels} recues={flux.recues} qualifiees={flux.qualifiees} />
          <div className="mt-4 flex items-center gap-6 border-t border-line pt-4">
            <Legende couleur="var(--chart-1)" label="Reçues" />
            <Legende couleur="var(--chart-2)" label="Qualifiées" />
            <span className="flex items-center gap-2 text-[12.5px] text-ink-soft">
              <span className="h-px w-5 border-t border-dashed border-[#8a2b3b]" />
              Moyenne des reçues
            </span>
          </div>
        </section>

        <section className="rounded-[18px] bg-card p-5 md:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <h2 className="text-[16px] font-semibold">Où en est le flux</h2>
            <span className="text-ink-soft">
              <IconPoints />
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[26px] font-bold leading-none tnum">{totalQualifiees}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[12px] font-semibold text-brand-ink">
              <IconFleche />
              {pct(totalQualifiees, totalRecues)} %
            </span>
          </div>
          <p className="mt-2 text-[13px] text-ink-soft">
            qualifiées sur {totalRecues} demandes reçues
          </p>

          <div className="mt-7 space-y-7">
            {jauges.map((j) => (
              <Jauge key={j.label} {...j} />
            ))}
          </div>
        </section>
      </div>

      {/* ── La table des dernières demandes ── */}
      <section className="overflow-hidden rounded-[18px] bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 md:px-6">
          <h2 className="text-[20px] font-bold tracking-tight">Les dernières demandes</h2>
          <Link
            href="/dashboard"
            className="rounded-full border border-brand/60 bg-brand-soft/60 px-4 py-2 text-[12.5px] font-medium text-brand-ink transition hover:bg-brand-soft"
          >
            Tout ouvrir
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13.5px]">
            <thead>
              <tr className="bg-subtle/70 text-left text-[12.5px] text-ink-soft">
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Référence</th>
                <th className="px-4 py-3 font-medium">Trajet</th>
                <th className="px-4 py-3 text-right font-medium">Volume</th>
                <th className="px-6 py-3 text-right font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {dernieres.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-6 py-3.5">
                    <Link href={`/dashboard/${r.id}`} className="flex items-center gap-3 transition hover:text-accent">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent">
                        {(r.client_nom ?? r.client_email ?? "?").charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate font-medium">{r.client_nom ?? r.client_email ?? "—"}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[12.5px] text-ink-soft">{r.id.slice(0, 8)}</td>
                  <td className="px-4 py-3.5 text-ink-soft">
                    {r.depart_ville ?? "—"} → {r.arrivee_ville ?? "—"}
                  </td>
                  <td className="px-4 py-3.5 text-right tnum">
                    {r.volume_m3 != null ? `${r.volume_m3} m³` : "—"}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <span
                      className={`rounded-full px-3 py-1 text-[12px] font-medium ${STATUS_META[r.status].className}`}
                    >
                      {STATUS_META[r.status].label}
                    </span>
                  </td>
                </tr>
              ))}
              {dernieres.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-ink-soft">
                    Aucune demande pour l&apos;instant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-12 gap-5">
        {/* ── Estimations par jour ── */}
        <Carte className="col-span-12 lg:col-span-6 xl:col-span-4">
          <EnTete titre="Estimations par jour" sous="Cumul par origine" />
          <BarresGroupees labels={JOURS.map((j) => j.slice(0, 3))} series={revenus} />
        </Carte>

        {/* ── Rythme hebdomadaire ── */}
        <Carte className="col-span-12 lg:col-span-6 xl:col-span-4">
          <EnTete titre="Rythme hebdomadaire" sous={`${SEMAINES} dernières semaines`} />
          <Aires labels={Array.from({ length: SEMAINES }, (_, i) => `S${i + 1}`)} series={semaines} />
          <div className="mt-3 flex items-center justify-center gap-6 border-t border-line pt-3">
            <Total couleur={TONS.foret} label="Reçues" valeur={`${totalRecues}`} />
            <span className="h-8 w-px bg-line" />
            <Total couleur={TONS.abricot} label="Qualifiées" valeur={`${totalQualifiees}`} />
          </div>
        </Carte>

        {/* ── Reçues vs qualifiées ── */}
        <Carte className="col-span-12 xl:col-span-4">
          <EnTete titre="Reçues vs qualifiées" sous="Sept derniers mois" />
          <BarresGroupees labels={septLabels} series={objectif} />
          <div className="mt-3 space-y-2">
            <LigneTotal
              couleur={TONS.mousse}
              titre="Qualifiées"
              sous="complètes et chiffrées"
              valeur={nf.format(objectif[0].data.reduce((a, b) => a + b, 0))}
            />
            <LigneTotal
              couleur={TONS.or}
              titre="Reçues"
              sous="toutes origines"
              valeur={nf.format(objectif[1].data.reduce((a, b) => a + b, 0))}
            />
          </div>
        </Carte>

        {/* ── Top villes ── */}
        <Carte className="col-span-12 xl:col-span-5">
          <EnTete titre="Top villes de départ" />
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] text-ink-soft">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">Ville</th>
                <th className="pb-2 font-medium">Fréquence</th>
                <th className="pb-2 text-right font-medium">Part</th>
              </tr>
            </thead>
            <tbody>
              {villes.map(([ville, n], i) => {
                const pct = Math.round((n / Math.max(1, requests.length)) * 100);
                return (
                  <tr key={ville} className="border-t border-line">
                    <td className="py-2.5 text-ink-soft tnum">{String(i + 1).padStart(2, "0")}</td>
                    <td className="py-2.5 pr-4">{ville}</td>
                    <td className="w-[40%] py-2.5 pr-4">
                      <Popularite pct={(n / villeMax) * 100} color={tons[i % tons.length]} />
                    </td>
                    <td className="py-2.5 text-right">
                      <span
                        className="rounded-xl px-2 py-1 text-[11.5px] font-medium tnum"
                        style={{ color: tons[i % tons.length], background: `${tons[i % tons.length]}1a` }}
                      >
                        {pct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
              {villes.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ink-soft">
                    Aucune ville renseignée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Carte>

        {/* ── Départements ── */}
        <Carte className="col-span-12 lg:col-span-6 xl:col-span-4">
          <EnTete titre="Répartition par département" sous="Code postal de départ" />
          <div className="space-y-3">
            {deps.map(([dep, n], i) => (
              <div key={dep} className="flex items-center gap-3">
                <span className="w-8 text-[13px] font-medium tnum">{dep}</span>
                <span className="flex-1">
                  <Popularite pct={(n / depMax) * 100} color={tons[i % tons.length]} />
                </span>
                <span className="w-8 text-right text-[12.5px] text-ink-soft tnum">{n}</span>
              </div>
            ))}
            {deps.length === 0 && <p className="text-sm text-ink-soft">Aucun code postal renseigné.</p>}
          </div>
        </Carte>

        {/* ── Volume traité ── */}
        <Carte className="col-span-12 lg:col-span-6 xl:col-span-3">
          <EnTete titre="Volume traité" sous="Six derniers mois" />
          <BarresEmpilees
            labels={sixLabels}
            bas={{ label: "Qualifié", color: TONS.foret, data: volQualifie }}
            haut={{ label: "En attente", color: TONS.abricot, data: volAttente }}
          />
          <div className="mt-3 flex items-center justify-center gap-6 border-t border-line pt-3">
            <Total
              couleur={TONS.foret}
              label="Qualifié"
              valeur={`${nf.format(volQualifie.reduce((a, b) => a + b, 0))} m³`}
            />
            <span className="h-8 w-px bg-line" />
            <Total
              couleur={TONS.abricot}
              label="En attente"
              valeur={`${nf.format(volAttente.reduce((a, b) => a + b, 0))} m³`}
            />
          </div>
        </Carte>
      </div>
    </div>
  );
}


/* ─────────────── briques de mise en page ─────────────── */

/** Part en pourcentage, bornée — les jauges et les badges s'en servent. */
function pct(part: number, tout: number) {
  return tout <= 0 ? 0 : Math.min(100, Math.round((part / tout) * 100));
}

/**
 * La bannière de la maquette : un bandeau en dégradé du sable au vert, une
 * accroche, un bouton blanc, et le dessin isométrique à droite.
 */
function Banniere({ demandes, devis }: { demandes: number; devis: number }) {
  return (
    <section className="relative overflow-hidden rounded-[18px] bg-[#1b1a18] px-7 py-7 text-white md:px-9 md:py-8">
      <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand/25 blur-3xl" />
      <div className="absolute inset-y-0 right-0 w-1/2 bg-linear-to-l from-brand/12 to-transparent" />
      <div className="relative flex flex-wrap items-center justify-between gap-8">
        <div className="min-w-0">
          <p className="text-[13.5px] text-white/85">
            {FENETRE} derniers jours · {nf.format(demandes)} demandes suivies · {devis} devis
          </p>
          <h2 className="mt-2.5 max-w-[30ch] text-[22px] font-bold leading-snug md:text-[26px]">
            L&apos;activité de l&apos;agence, du formulaire client au camion chargé
          </h2>
          <Link
            href="/dashboard?statut=new"
            className="mt-6 inline-flex items-center rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-[#1b1a18] transition hover:bg-[#e0b81a]"
          >
            Ouvrir la file d&apos;attente
          </Link>
        </div>
        <Isometrie />
      </div>
    </section>
  );
}

/**
 * Le dessin du bandeau : des colonnes et des rouages posés sur un plan
 * isométrique, dans l'esprit de la maquette.
 */
function Isometrie() {
  const face = (x: number, y: number, h: number, w: number, clair: string, sombre: string) => (
    <g key={`${x}-${y}-${h}`}>
      <path d={`M${x} ${y} l${w} ${w / 2} l0 ${h} l-${w} -${w / 2}z`} fill={sombre} />
      <path d={`M${x} ${y} l-${w} ${w / 2} l0 ${h} l${w} -${w / 2}z`} fill={clair} />
      <path d={`M${x} ${y} l${w} ${w / 2} l-${w} ${w / 2} l-${w} -${w / 2}z`} fill="#ffffff" />
    </g>
  );

  return (
    <svg width="260" height="170" viewBox="0 0 260 170" fill="none" className="hidden shrink-0 md:block" aria-hidden>
      {/* le plan */}
      <path d="M130 30 240 92 130 154 20 92z" fill="#ffffff" fillOpacity="0.1" />
      <path d="M130 30 240 92 130 154 20 92z" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5" />

      {face(96, 46, 52, 22, "#f6f5f2", "#c9c6bd")}
      {face(130, 64, 34, 22, "#ffffff", "#d6d3ca")}
      {face(164, 44, 58, 22, "#f6f5f2", "#c9c6bd")}
      {face(130, 28, 22, 14, "#f5d033", "#bb9d12")}

      {/* les rouages */}
      <g transform="translate(74 112)">
        <circle r="17" fill="#ffffff" fillOpacity="0.95" />
        <circle r="7" fill="#1b1a18" />
        {Array.from({ length: 8 }).map((_, i) => (
          <rect
            key={i}
            x="-3"
            y="-23"
            width="6"
            height="7"
            rx="1.5"
            fill="#ffffff"
            fillOpacity="0.95"
            transform={`rotate(${i * 45})`}
          />
        ))}
      </g>
      <g transform="translate(108 132)">
        <circle r="12" fill="#f5d033" />
        <circle r="5" fill="#1b1a18" />
        {Array.from({ length: 6 }).map((_, i) => (
          <rect key={i} x="-2.5" y="-17" width="5" height="6" rx="1.2" fill="#f5d033" transform={`rotate(${i * 60})`} />
        ))}
      </g>

      <path d="M186 36c22 10 34 26 30 44" stroke="#f5d033" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 6" />
    </svg>
  );
}

/**
 * Une jauge du panneau de droite : libellé et valeur en tête, piste en
 * dessous. Celle qui porte le pointeur affiche sa part en bulle, comme la
 * maquette.
 */
function Jauge({
  label,
  valeur,
  part,
  ton,
  pointeur,
}: {
  label: string;
  valeur: string;
  part: number;
  ton: string;
  pointeur?: boolean;
}) {
  return (
    <div className={pointeur ? "pb-5" : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] text-ink-mid">{label}</span>
        <span className="text-[13.5px] font-semibold tnum">{valeur}</span>
      </div>
      <div className="relative mt-2.5">
        {pointeur && (
          <span
            className="absolute top-3.5 z-10 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[11px] font-semibold text-[var(--color-card)]"
            style={{ left: `${Math.min(92, Math.max(8, part))}%` }}
          >
            {part} %
          </span>
        )}
        <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${part}%`, background: ton }}
          />
        </div>
        {pointeur && (
          <span
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--color-card)] bg-[var(--color-accent)] shadow-sm"
            style={{ left: `${part}%` }}
          />
        )}
      </div>
    </div>
  );
}

function Legende({ couleur, label }: { couleur: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-ink-soft">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: couleur }} />
      {label}
    </span>
  );
}

function IconPoints() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function IconFleche() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Carte({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[18px] bg-card p-5 ${className}`}>{children}</section>;
}

function EnTete({ titre, sous }: { titre: string; sous?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[17px] font-bold tracking-tight">{titre}</h2>
      {sous && <p className="mt-0.5 text-[12.5px] text-ink-soft">{sous}</p>}
    </div>
  );
}

function Total({ couleur, label, valeur }: { couleur: string; label: string; valeur: string }) {
  return (
    <span className="text-center">
      <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
        <span className="h-2 w-2 rounded-full" style={{ background: couleur }} />
        {label}
      </span>
      <span className="mt-0.5 block text-[15px] font-semibold tnum">{valeur}</span>
    </span>
  );
}

function LigneTotal({
  couleur,
  titre,
  sous,
  valeur,
}: {
  couleur: string;
  titre: string;
  sous: string;
  valeur: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-xl"
        style={{ background: `${couleur}1f`, color: couleur }}
      >
        <IconBox />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-tight">{titre}</span>
        <span className="block text-[11px] leading-tight text-ink-soft">{sous}</span>
      </span>
      <span className="text-[14px] font-semibold tnum" style={{ color: couleur }}>
        {valeur}
      </span>
    </div>
  );
}

const S = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;
function IconInbox() { return <svg {...S}><path d="M22 12h-6l-2 3h-4l-2-3H2" strokeLinecap="round" strokeLinejoin="round" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconEuro() { return <svg {...S}><path d="M18 7a7 7 0 1 0 0 10M4 10h9M4 14h9" strokeLinecap="round" /></svg>; }
function IconBox() { return <svg {...S}><path d="M21 8 12 3 3 8v8l9 5 9-5z" strokeLinejoin="round" /><path d="m3 8 9 5 9-5M12 13v8" strokeLinecap="round" /></svg>; }
function IconUser() { return <svg {...S}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" /></svg>; }

/** Les quatre dessins des tuiles, appelés par leur clé. */
const ICONES: Record<string, React.ReactNode> = {
  inbox: <IconInbox />,
  euro: <IconEuro />,
  box: <IconBox />,
  user: <IconUser />,
};
