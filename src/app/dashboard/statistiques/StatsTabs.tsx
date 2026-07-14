"use client";

import { useMemo, useState } from "react";
import type { RequestRow } from "@/lib/types";
import { STATUS_META, STATUS_ORDER } from "../status";
import { KpiCard, Donut, MultiAreaTrend, CategoryBars, BarList, Heatmap, Funnel, type Slice } from "./charts";

const TABS = ["Vue d'ensemble", "Mails", "Formulaire", "Heatmap", "Analyse", "Formules", "Géographie", "Conversion"] as const;
type Tab = (typeof TABS)[number];

const CATC: Record<string, string> = {
  new: "#94a3b8", analyzing: "#f59e0b", qualified: "#6366f1", quoted: "#3b82f6", won: "#10b981", lost: "#ef4444", archived: "#cbd5e1",
};

const isComplete = (r: RequestRow) => r.volume_m3 != null && !!r.depart_ville && !!r.arrivee_ville && !r.completion_token;
const isExpress = (r: RequestRow) => {
  const d = (r.raw_payload as { details?: { express?: boolean }; express?: boolean } | null) ?? null;
  return d?.details?.express === true || d?.express === true;
};
const dayStart = (iso: string) => new Date(iso).setHours(0, 0, 0, 0);

function dailyCounts(requests: RequestRow[], days: number, filter: (r: RequestRow) => boolean = () => true) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const arr = new Array(days).fill(0);
  requests.filter(filter).forEach((r) => {
    const i = days - 1 - Math.round((today.getTime() - dayStart(r.created_at)) / 86_400_000);
    if (i >= 0 && i < days) arr[i] += 1;
  });
  return arr;
}
function labelsFor(days: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Array(days).fill(0).map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - i));
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  });
}
const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
function histogram(values: number[], bounds: number[], unit = "") {
  const out = bounds.slice(0, -1).map((lo, i) => {
    const hi = bounds[i + 1];
    const n = values.filter((v) => v >= lo && (i === bounds.length - 2 ? v <= hi : v < hi)).length;
    return { label: `${lo}–${hi}${unit}`, value: n };
  });
  return out;
}
function topMap(requests: RequestRow[], key: (r: RequestRow) => string | null, n = 8) {
  const m = new Map<string, number>();
  requests.forEach((r) => { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); });
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, n);
}

export default function StatsTabs({ requests }: { requests: RequestRow[] }) {
  const [tab, setTab] = useState<Tab>("Vue d'ensemble");
  return (
    <div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`relative whitespace-nowrap px-4 py-2.5 text-sm transition ${tab === t ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}`}>
            {t}
            {tab === t && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {tab === "Vue d'ensemble" && <Overview requests={requests} />}
      {tab === "Mails" && <SourceTab requests={requests} source="email" />}
      {tab === "Formulaire" && <SourceTab requests={requests} source="form" />}
      {tab === "Heatmap" && <HeatmapTab requests={requests} />}
      {tab === "Analyse" && <AnalyseTab requests={requests} />}
      {tab === "Formules" && <FormulesTab requests={requests} />}
      {tab === "Géographie" && <GeoTab requests={requests} />}
      {tab === "Conversion" && <ConversionTab requests={requests} />}
    </div>
  );
}

/* ---------- Primitives de mise en page ---------- */
function Panel({ title, hint, children, wide }: { title: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-6 ${wide ? "lg:col-span-2" : ""}`}>
      <h3 className="font-serif text-lg">{title}</h3>
      {hint && <p className="mb-4 text-sm text-ink-soft">{hint}</p>}
      {!hint && <div className="mb-4" />}
      {children}
    </section>
  );
}

/* ================= Vue d'ensemble ================= */
function Overview({ requests }: { requests: RequestRow[] }) {
  const total = requests.length;
  const completes = requests.filter(isComplete).length;
  const scored = requests.filter((r) => r.score_potentiel != null);
  const scoreMoyen = round1(avg(scored.map((r) => r.score_potentiel!)));
  const caPot = Math.round(requests.reduce((s, r) => s + (r.estimation_prix ?? 0), 0));
  const devis = requests.filter((r) => ["quoted", "won"].includes(r.status)).length;
  const gagnes = requests.filter((r) => r.status === "won").length;

  const recues = dailyCounts(requests, 30);
  const qualifiees = dailyCounts(requests, 30, (r) => ["qualified", "quoted", "won", "lost"].includes(r.status));
  const labels = labelsFor(30);

  const statutBars = STATUS_ORDER.map((s) => ({ label: STATUS_META[s].label, value: requests.filter((r) => r.status === s).length, color: CATC[s] })).filter((b) => b.value > 0).sort((a, b) => b.value - a.value);
  const statutSlices: Slice[] = statutBars.map((b) => ({ label: b.label, value: b.value, color: b.color }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <KpiCard label="Demandes" value={total} sub="Total reçues" color="#10b981" />
        <KpiCard label="Complètes" value={completes} sub={`${total - completes} incomplètes`} color="#6366f1" />
        <KpiCard label="Taux complétude" value={total ? round1((completes / total) * 100) : 0} suffix=" %" decimals={1} sub="Complètes ÷ reçues" color="#f59e0b" />
        <KpiCard label="Score moyen" value={scoreMoyen} suffix=" /100" decimals={1} sub="Qualité" color="#3b82f6" />
        <KpiCard label="CA potentiel" value={caPot} suffix=" €" sub="Estimations cumulées" color="#8b5cf6" />
        <KpiCard label="Gagnés" value={gagnes} sub={`sur ${devis} devis`} color="#10b981" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Demandes & qualification" hint="Reçues vs qualifiées · 30 j" wide>
          <MultiAreaTrend labels={labels} series={[{ name: "Reçues", color: "#10b981", data: recues }, { name: "Qualifiées", color: "#6366f1", data: qualifiees }]} />
        </Panel>
        <Panel title="Répartition par statut" hint="Part de chaque étape">
          <Donut data={statutSlices} centerLabel="demandes" size={190} />
        </Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Statuts — volume"><CategoryBars data={statutBars} /></Panel>
        <Panel title="Top villes de départ"><BarList data={topMap(requests, (r) => r.depart_ville, 7)} /></Panel>
      </div>
    </div>
  );
}

/* ================= Mails / Formulaire ================= */
function SourceTab({ requests, source }: { requests: RequestRow[]; source: "email" | "form" }) {
  const rs = useMemo(() => requests.filter((r) => r.source === source), [requests, source]);
  const total = rs.length;
  const completes = rs.filter(isComplete).length;
  const incompletes = total - completes;
  const scored = rs.filter((r) => r.score_potentiel != null);
  const scoreMoyen = round1(avg(scored.map((r) => r.score_potentiel!)));
  const caPot = Math.round(rs.reduce((s, r) => s + (r.estimation_prix ?? 0), 0));

  const recues = dailyCounts(rs, 30);
  const complets30 = dailyCounts(rs, 30, isComplete);
  const labels = labelsFor(30);

  // Champs manquants (parmi incomplètes)
  const inc = rs.filter((r) => !isComplete(r));
  const manque = [
    { label: "Volume", value: inc.filter((r) => r.volume_m3 == null).length, color: "#f59e0b" },
    { label: "Adresse départ", value: inc.filter((r) => !r.depart_ville).length, color: "#ec4899" },
    { label: "Adresse arrivée", value: inc.filter((r) => !r.arrivee_ville).length, color: "#8b5cf6" },
  ].filter((m) => m.value > 0);

  const complSlices: Slice[] = [
    { label: "Complètes", value: completes, color: "#10b981" },
    { label: "Incomplètes", value: incompletes, color: "#f59e0b" },
  ].filter((s) => s.value > 0);

  if (source === "email") {
    const domains = topMap(rs, (r) => (r.client_email ? r.client_email.split("@")[1] ?? null : null), 7);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <KpiCard label="Mails reçus" value={total} sub="Source e-mail" color="#3b82f6" />
          <KpiCard label="Complets" value={completes} sub="Prêts à qualifier" color="#10b981" />
          <KpiCard label="Incomplets" value={incompletes} sub="Relance envoyée" color="#f59e0b" />
          <KpiCard label="Taux complétude" value={total ? round1((completes / total) * 100) : 0} suffix=" %" decimals={1} sub="Complets ÷ reçus" color="#6366f1" />
          <KpiCard label="Score moyen" value={scoreMoyen} suffix=" /100" decimals={1} sub="Qualité" color="#8b5cf6" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Mails reçus vs complets" hint="30 derniers jours" wide>
            <MultiAreaTrend labels={labels} series={[{ name: "Reçus", color: "#3b82f6", data: recues }, { name: "Complets", color: "#10b981", data: complets30 }]} />
          </Panel>
          <Panel title="Complétude" hint="Complets vs incomplets"><Donut data={complSlices} centerLabel="mails" size={180} /></Panel>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Informations manquantes" hint="Parmi les mails incomplets">{manque.length ? <CategoryBars data={manque} /> : <p className="text-sm text-ink-soft">Aucun mail incomplet.</p>}</Panel>
          <Panel title="Domaines expéditeurs" hint="Origine des e-mails"><BarList data={domains} /></Panel>
        </div>
      </div>
    );
  }

  // Formulaire
  const express = rs.filter(isExpress).length;
  const complet = total - express;
  const volMoyen = round1(avg(rs.filter((r) => r.volume_m3 != null).map((r) => r.volume_m3!)));
  const typeSlices: Slice[] = [
    { label: "Express", value: express, color: "#6366f1" },
    { label: "Complet", value: complet, color: "#3b82f6" },
  ].filter((s) => s.value > 0);
  const formuleBars = [
    { key: "eco", label: "Éco", color: "#94a3b8" }, { key: "standard", label: "Standard", color: "#6366f1" }, { key: "luxe", label: "Confort", color: "#10b981" },
  ].map((f) => ({ label: f.label, value: rs.filter((r) => r.formule === f.key).length, color: f.color })).filter((b) => b.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Formulaires" value={total} sub="Source formulaire" color="#6366f1" />
        <KpiCard label="Express" value={express} sub="Devis rapide" color="#3b82f6" />
        <KpiCard label="Complet" value={complet} sub="Dossier détaillé" color="#8b5cf6" />
        <KpiCard label="Volume moyen" value={volMoyen} suffix=" m³" decimals={1} sub="Par demande" color="#10b981" />
        <KpiCard label="CA potentiel" value={caPot} suffix=" €" sub="Estimations" color="#f59e0b" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Formulaires reçus" hint="30 derniers jours" wide>
          <MultiAreaTrend labels={labels} series={[{ name: "Reçus", color: "#6366f1", data: recues }, { name: "Complets", color: "#10b981", data: complets30 }]} />
        </Panel>
        <Panel title="Type de devis" hint="Express vs Complet"><Donut data={typeSlices} centerLabel="formulaires" size={180} /></Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Formules choisies">{formuleBars.length ? <CategoryBars data={formuleBars} /> : <p className="text-sm text-ink-soft">Non renseigné.</p>}</Panel>
        <Panel title="Top villes de départ"><BarList data={topMap(rs, (r) => r.depart_ville, 7)} /></Panel>
      </div>
    </div>
  );
}

/* ================= Heatmap ================= */
function HeatmapTab({ requests }: { requests: RequestRow[] }) {
  // 13 semaines alignées lundi→dimanche.
  const weeks = 13;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7; // 0 = lundi
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - dow)); // dimanche courant
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));
  const counts = new Map<string, number>();
  requests.forEach((r) => {
    const d = new Date(r.created_at);
    d.setHours(0, 0, 0, 0);
    const k = d.toISOString().slice(0, 10);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  const cells: { date: string; value: number }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const k = d.toISOString().slice(0, 10);
    cells.push({ date: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }), value: counts.get(k) ?? 0 });
  }

  // Par jour de semaine + par heure
  const jours = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const parJour = jours.map((label, i) => ({ label, value: requests.filter((r) => (new Date(r.created_at).getDay() + 6) % 7 === i).length }));
  const parHeure = new Array(24).fill(0).map((_, h) => ({ label: `${h}h`, value: requests.filter((r) => new Date(r.created_at).getHours() === h).length })).filter((x) => x.value > 0);

  return (
    <div className="space-y-6">
      <Panel title="Activité au fil des jours" hint="13 dernières semaines · nombre de demandes reçues par jour">
        <Heatmap cells={cells} />
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Par jour de la semaine"><BarList data={parJour} /></Panel>
        <Panel title="Par heure de réception"><BarList data={parHeure} /></Panel>
      </div>
    </div>
  );
}

/* ================= Analyse ================= */
function AnalyseTab({ requests }: { requests: RequestRow[] }) {
  const pot = requests.filter((r) => r.score_potentiel != null).map((r) => r.score_potentiel!);
  const dif = requests.filter((r) => r.score_difficulte != null).map((r) => r.score_difficulte!);
  const vol = requests.filter((r) => r.volume_m3 != null).map((r) => r.volume_m3!);
  const est = requests.filter((r) => r.estimation_prix != null).map((r) => r.estimation_prix!);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Score potentiel moyen" value={round1(avg(pot))} suffix=" /100" decimals={1} sub={`${pot.length} évaluées`} color="#6366f1" />
        <KpiCard label="Difficulté moyenne" value={round1(avg(dif))} suffix=" /100" decimals={1} sub="Complexité chantier" color="#f59e0b" />
        <KpiCard label="Volume moyen" value={round1(avg(vol))} suffix=" m³" decimals={1} sub={`${vol.length} demandes`} color="#10b981" />
        <KpiCard label="Estimation moyenne" value={Math.round(avg(est))} suffix=" €" sub="Devis générés" color="#3b82f6" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Distribution du potentiel" hint="Répartition des scores /100"><BarList data={histogram(pot, [0, 20, 40, 60, 80, 100])} /></Panel>
        <Panel title="Distribution de la difficulté" hint="Répartition des scores /100"><BarList data={histogram(dif, [0, 20, 40, 60, 80, 100])} /></Panel>
        <Panel title="Distribution du volume" hint="Nb de demandes par tranche de m³"><BarList data={histogram(vol, [0, 10, 20, 30, 50, 100], " m³")} /></Panel>
        <Panel title="Distribution des estimations" hint="Nb de demandes par tranche de € TTC"><BarList data={histogram(est, [0, 1000, 2000, 3000, 5000, 10000], " €")} /></Panel>
      </div>
    </div>
  );
}

/* ================= Formules ================= */
function FormulesTab({ requests }: { requests: RequestRow[] }) {
  const defs = [
    { key: "eco", label: "Éco", color: "#94a3b8" },
    { key: "standard", label: "Standard", color: "#6366f1" },
    { key: "luxe", label: "Confort", color: "#10b981" },
  ];
  const rows = defs.map((f) => {
    const rs = requests.filter((r) => r.formule === f.key);
    return {
      ...f,
      count: rs.length,
      volMoyen: round1(avg(rs.filter((r) => r.volume_m3 != null).map((r) => r.volume_m3!))),
      caTotal: Math.round(rs.reduce((s, r) => s + (r.estimation_prix ?? 0), 0)),
      scoreMoyen: round1(avg(rs.filter((r) => r.score_potentiel != null).map((r) => r.score_potentiel!))),
    };
  });
  const active = rows.filter((r) => r.count > 0);
  const slices: Slice[] = active.map((r) => ({ label: r.label, value: r.count, color: r.color }));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Répartition des formules" wide><Donut data={slices} centerLabel="demandes" size={190} /></Panel>
        <Panel title="Volume moyen par formule"><CategoryBars data={active.map((r) => ({ label: r.label, value: r.volMoyen, color: r.color }))} /></Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="CA potentiel par formule" hint="Estimations cumulées (€)"><CategoryBars data={active.map((r) => ({ label: r.label, value: r.caTotal, color: r.color }))} /></Panel>
        <Panel title="Score moyen par formule" hint="Qualité /100"><CategoryBars data={active.map((r) => ({ label: r.label, value: r.scoreMoyen, color: r.color }))} /></Panel>
      </div>
    </div>
  );
}

/* ================= Géographie ================= */
function GeoTab({ requests }: { requests: RequestRow[] }) {
  const dist = requests.filter((r) => r.distance_km != null).map((r) => r.distance_km!);
  const trajets = topMap(requests, (r) => (r.depart_ville && r.arrivee_ville ? `${r.depart_ville} → ${r.arrivee_ville}` : null), 8);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard label="Distance moyenne" value={Math.round(avg(dist))} suffix=" km" sub={`${dist.length} trajets`} color="#3b82f6" />
        <KpiCard label="Villes de départ" value={new Set(requests.map((r) => r.depart_ville).filter(Boolean)).size} sub="distinctes" color="#6366f1" />
        <KpiCard label="Villes d'arrivée" value={new Set(requests.map((r) => r.arrivee_ville).filter(Boolean)).size} sub="distinctes" color="#10b981" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Top villes de départ"><BarList data={topMap(requests, (r) => r.depart_ville, 8)} /></Panel>
        <Panel title="Top villes d'arrivée"><BarList data={topMap(requests, (r) => r.arrivee_ville, 8)} /></Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Trajets les plus fréquents"><BarList data={trajets} /></Panel>
        <Panel title="Distribution des distances" hint="Nb de demandes par tranche de km"><BarList data={histogram(dist, [0, 50, 150, 300, 600, 1500], " km")} /></Panel>
      </div>
    </div>
  );
}

/* ================= Conversion ================= */
function ConversionTab({ requests }: { requests: RequestRow[] }) {
  const total = requests.length;
  const completes = requests.filter(isComplete).length;
  const qualifiees = requests.filter((r) => ["qualified", "quoted", "won", "lost"].includes(r.status)).length;
  const devis = requests.filter((r) => ["quoted", "won"].includes(r.status)).length;
  const gagnes = requests.filter((r) => r.status === "won").length;
  const steps = [
    { label: "Reçues", value: total, color: "#94a3b8" },
    { label: "Complètes", value: completes, color: "#6366f1" },
    { label: "Qualifiées", value: qualifiees, color: "#3b82f6" },
    { label: "Devis envoyés", value: devis, color: "#f59e0b" },
    { label: "Gagnées", value: gagnes, color: "#10b981" },
  ];
  const decided = requests.filter((r) => ["won", "lost"].includes(r.status)).length;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Taux de complétude" value={total ? round1((completes / total) * 100) : 0} suffix=" %" decimals={1} sub="Complètes ÷ reçues" color="#6366f1" />
        <KpiCard label="Taux de qualification" value={completes ? round1((qualifiees / completes) * 100) : 0} suffix=" %" decimals={1} sub="Qualifiées ÷ complètes" color="#3b82f6" />
        <KpiCard label="Taux de conversion" value={decided ? round1((gagnes / decided) * 100) : 0} suffix=" %" decimals={1} sub="Gagnées ÷ décidées" color="#10b981" />
        <KpiCard label="Affaires gagnées" value={gagnes} sub={`sur ${total} demandes`} color="#f59e0b" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Entonnoir de conversion" hint="De la réception à la signature"><Funnel steps={steps} /></Panel>
        <Panel title="Répartition par statut">
          <Donut
            data={STATUS_ORDER.map((s) => ({ label: STATUS_META[s].label, value: requests.filter((r) => r.status === s).length, color: CATC[s] })).filter((s) => s.value > 0)}
            centerLabel="demandes" size={190}
          />
        </Panel>
      </div>
    </div>
  );
}
