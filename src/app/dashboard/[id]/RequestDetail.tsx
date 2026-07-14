"use client";

import { useState, useTransition } from "react";
import type { RequestDetail as Detail } from "@/lib/requests";
import type { RequestStatus } from "@/lib/types";
import { STATUS_META, STATUS_ORDER, scoreColor, sourceLabel, sourceClass, isIncomplete, missingFields, PIPELINE } from "../status";
import { updateStatus, updateScores } from "@/lib/actions/requests";

const TABS = ["Infos", "Analyse", "Volume & photos", "Devis", "Messages", "Historique"] as const;
type Tab = (typeof TABS)[number];

export default function RequestDetail({
  detail,
  photoUrls,
}: {
  detail: Detail;
  photoUrls: Record<string, string>;
}) {
  const { request: r } = detail;
  const [tab, setTab] = useState<Tab>("Infos");
  const [pending, start] = useTransition();
  const missing = missingFields(r);

  return (
    <div className="mt-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="font-serif text-3xl">{r.client_nom ?? "Demande"}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
            <span>{r.client_email}</span>
            {r.client_tel && <span>· {r.client_tel}</span>}
            <span>· reçue le {new Date(r.created_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} à {new Date(r.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sourceClass(r.source)}`}>
              {sourceLabel(r.source)}
            </span>
            {isIncomplete(r) ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Incomplète</span>
            ) : (
              <span className="rounded-full bg-good/15 px-2 py-0.5 text-xs font-medium text-good">Complète</span>
            )}
          </div>
        </div>
        <StatusPicker
          value={r.status}
          onChange={(s) => start(() => updateStatus(r.id, s))}
          disabled={pending}
        />
      </div>

      {/* Avancée */}
      <ProgressStepper status={r.status} />

      {/* Ce qui manque */}
      {missing.length > 0 && <MissingBanner missing={missing} token={r.completion_token} />}

      {/* Onglets */}
      <div className="mt-6 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-4 py-2.5 text-sm transition ${
              tab === t ? "font-medium text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            {t}
            {tab === t && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </button>
        ))}
      </div>

      <div className="py-6">
        {tab === "Infos" && <InfosTab detail={detail} />}
        {tab === "Analyse" && <AnalyseTab detail={detail} />}
        {tab === "Volume & photos" && <VolumeTab detail={detail} photoUrls={photoUrls} />}
        {tab === "Devis" && <DevisTab detail={detail} />}
        {tab === "Messages" && <MessagesTab detail={detail} />}
        {tab === "Historique" && <TimelineTab detail={detail} />}
      </div>
    </div>
  );
}

/* ---------- Onglet Infos ---------- */

function InfosTab({ detail }: { detail: Detail }) {
  const r = detail.request;
  const [notes, setNotes] = useState(r.score_notes ?? "");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card title="Départ">
          <AddressBlock
            adresse={r.depart_adresse}
            cp={r.depart_code_postal}
            ville={r.depart_ville}
            etage={r.depart_etage}
            ascenseur={r.depart_ascenseur}
            type={r.type_logement_depart}
          />
        </Card>
        <Card title="Arrivée">
          <AddressBlock
            adresse={r.arrivee_adresse}
            cp={r.arrivee_code_postal}
            ville={r.arrivee_ville}
            etage={r.arrivee_etage}
            ascenseur={r.arrivee_ascenseur}
            type={r.type_logement_arrivee}
          />
        </Card>
        <Card title="Prestation">
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <Row k="Date souhaitée" v={r.date_souhaitee ?? "à définir"} />
            <Row k="Flexibilité" v={r.flexibilite ?? "—"} />
            <Row k="Formule" v={r.formule ?? "—"} />
            <Row k="Distance" v={r.distance_km != null ? `${r.distance_km} km` : "—"} />
            <Row
              k="Services"
              v={
                Object.entries(r.services ?? {})
                  .filter(([, v]) => v)
                  .map(([k]) => k.replace("_", "-"))
                  .join(", ") || "—"
              }
            />
          </dl>
        </Card>
      </div>

      {/* Évaluation automatique (lecture seule) + notes */}
      <Card title="Évaluation">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-paper p-3">
              <div className="eyebrow text-ink-soft">Potentiel</div>
              <div className={`mt-1 font-serif text-2xl ${scoreColor(r.score_potentiel)}`}>{r.score_potentiel ?? "—"}<span className="text-sm text-ink-soft">/100</span></div>
            </div>
            <div className="rounded-xl border border-line bg-paper p-3">
              <div className="eyebrow text-ink-soft">Difficulté</div>
              <div className={`mt-1 font-serif text-2xl ${scoreColor(r.score_difficulte)}`}>{r.score_difficulte ?? "—"}<span className="text-sm text-ink-soft">/100</span></div>
            </div>
          </div>
          <p className="text-xs text-ink-soft">Calculé automatiquement à la qualification. Détail dans l&apos;onglet <span className="font-medium text-ink">Analyse</span>.</p>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Notes internes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Contexte, points d'attention…"
            />
          </div>
          <button
            onClick={() =>
              start(async () => {
                await updateScores(r.id, r.score_potentiel, r.score_difficulte, notes || null);
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
              })
            }
            disabled={pending}
            className="w-full rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition hover:bg-subtle disabled:opacity-50"
          >
            {pending ? "…" : saved ? "Enregistré ✓" : "Enregistrer les notes"}
          </button>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Onglet Volume ---------- */

function VolumeTab({ detail, photoUrls }: { detail: Detail; photoUrls: Record<string, string> }) {
  const { request: r, items, photos } = detail;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-soft">Volume total</div>
          <div className="font-serif text-4xl">
            {r.volume_m3 ?? "—"} <span className="text-xl text-ink-soft">m³</span>
          </div>
        </div>
        <div className="rounded-full bg-paper px-3 py-1 text-sm text-ink-soft">
          Méthode : {r.volume_method === "ai" ? "photos (IA)" : r.volume_method === "list" ? "liste" : r.volume_method === "explicit" ? "déclaré" : "—"}
        </div>
      </div>

      {items.length > 0 && (
        <Card title="Inventaire">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line/70">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="py-2">{it.label}</td>
                  <td className="py-2 text-right tabular-nums text-ink-soft">×{it.quantite}</td>
                  <td className="py-2 text-right tabular-nums">
                    {(it.quantite * it.volume_unitaire_m3).toFixed(1)} m³
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {photos.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {photos.map((p) => (
            <Card key={p.id} title={p.piece ?? "Pièce"}>
              {photoUrls[p.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrls[p.id]}
                  alt={p.piece ?? ""}
                  className="mb-3 aspect-video w-full rounded-lg object-cover"
                />
              )}
              <div className="mb-2 text-right font-serif text-xl">{p.volume_m3} m³</div>
              <ul className="space-y-1 text-sm text-ink-soft">
                {p.ai_analysis?.objets?.map((o, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{o.quantite}× {o.label}</span>
                    <span className="tabular-nums">{o.volume_m3} m³</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {items.length === 0 && photos.length === 0 && (
        <div className="rounded-xl border border-dashed border-line p-8 text-center text-ink-soft">
          Volume renseigné sans détail.
        </div>
      )}
    </div>
  );
}

/* ---------- Onglet Devis ---------- */

function DevisTab({ detail }: { detail: Detail }) {
  const r = detail.request;
  const devis = detail.devis;
  const complete = r.volume_m3 != null && !!r.depart_ville && !!r.arrivee_ville;

  if (!devis) {
    return (
      <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
        {complete
          ? "Le devis est en cours de génération…"
          : "Le devis PDF est généré automatiquement dès que la demande est complète (volume + adresses)."}
      </div>
    );
  }

  const lignes = Array.isArray(devis.lignes) ? devis.lignes : [];
  const statusLabel: Record<string, string> = { brouillon: "Brouillon", envoye: "Envoyé", accepte: "Accepté", refuse: "Refusé" };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card title="Détail du devis">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line/70">
              {lignes.map((l, i) => (
                <tr key={i}>
                  <td className="py-2 text-ink-soft">{l.label}</td>
                  <td className="py-2 text-right tabular-nums">{l.amount.toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line">
                <td className="py-2 text-ink-soft">Total HT</td>
                <td className="py-2 text-right tabular-nums">{devis.montant_ht.toFixed(2)} €</td>
              </tr>
              <tr>
                <td className="py-1 text-ink-soft">TVA</td>
                <td className="py-1 text-right tabular-nums">{devis.montant_tva.toFixed(2)} €</td>
              </tr>
              <tr>
                <td className="pt-2 font-serif text-lg">Total TTC</td>
                <td className="pt-2 text-right font-serif text-lg text-accent tabular-nums">{devis.montant_ttc.toFixed(2)} €</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title={`Devis ${devis.reference}`}>
          <div className="font-serif text-3xl text-accent">
            {Math.round(devis.montant_ttc).toLocaleString("fr-FR")} €<span className="ml-1 text-sm text-ink-soft">TTC</span>
          </div>
          <div className="mt-1 text-xs text-ink-soft">
            {statusLabel[devis.status] ?? devis.status}
            {devis.valid_until ? ` · valable jusqu'au ${new Date(devis.valid_until).toLocaleDateString("fr-FR")}` : ""}
          </div>
          <a
            href={`/api/devis/${devis.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark"
          >
            ⬇ Télécharger le devis PDF
          </a>
          <p className="mt-3 text-[11px] text-ink-soft">Généré automatiquement à la qualification de la demande.</p>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Avancée & informations manquantes ---------- */

function ProgressStepper({ status }: { status: RequestStatus }) {
  const lost = status === "lost";
  const archived = status === "archived";
  const idx = PIPELINE.indexOf(status);
  return (
    <div className="mt-6">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">Avancée</div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {PIPELINE.map((s, i) => {
          const done = !lost && !archived && idx > i;
          const current = !lost && !archived && idx === i;
          return (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
                  current
                    ? "border-accent bg-accent text-white"
                    : done
                      ? "border-accent/40 bg-accent-soft/60 text-accent-dark"
                      : "border-line bg-card text-ink-soft/50"
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${current ? "bg-white/25" : done ? "bg-accent/20" : "bg-subtle"}`}>
                  {done ? "✓" : i + 1}
                </span>
                {STATUS_META[s].label}
              </div>
              {i < PIPELINE.length - 1 && <span className="text-ink-soft/30">—</span>}
            </div>
          );
        })}
        {lost && (
          <>
            <span className="text-ink-soft/30">—</span>
            <div className="whitespace-nowrap rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600">✕ Perdue</div>
          </>
        )}
        {archived && (
          <>
            <span className="text-ink-soft/30">—</span>
            <div className="whitespace-nowrap rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-500">Archivée</div>
          </>
        )}
      </div>
    </div>
  );
}

type MsgPayload = { channel?: string; template?: string; rule?: string; to?: string; status?: string; erreur?: string | null };

/* ---------- Onglet Analyse (qualification notée) ---------- */

type QualifLine = { key: string; label: string; note: number; poids: number; contribution: number; detail: string };
type QualifPayload = { score: number; difficulte: number; lines: QualifLine[] };

function AnalyseTab({ detail }: { detail: Detail }) {
  const r = detail.request;
  const evt = detail.events.find((e) => e.type === "analysis");
  const complete = r.volume_m3 != null && !!r.depart_ville && !!r.arrivee_ville;

  if (!evt) {
    return (
      <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
        {complete
          ? "Analyse en cours de génération…"
          : "L'estimation et l'évaluation /100 sont générées automatiquement dès que la demande est complète (volume + adresses)."}
      </div>
    );
  }

  const p = (evt.payload ?? {}) as QualifPayload;
  return (
    <div className="space-y-6">
      <div className="grid items-center gap-5 rounded-2xl border border-line bg-card p-6 sm:grid-cols-[auto_1fr]">
        <ScoreRing score={p.score} />
        <div>
          <div className="font-serif text-2xl">Note de qualification</div>
          <p className="mt-1 text-sm text-ink-soft">
            Score global pondéré sur {p.lines?.length ?? 0} critères. Difficulté estimée : <span className="font-medium text-ink">{p.difficulte}/100</span>.
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {(p.lines ?? []).map((l) => (
          <div key={l.key} className="rounded-xl border border-line bg-card p-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="font-medium">{l.label}</span>
              <span className="text-xs text-ink-soft">{l.detail}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
                <div className="h-full rounded-full bg-accent" style={{ width: `${l.note}%` }} />
              </div>
              <span className={`w-9 text-right text-sm font-medium tabular-nums ${scoreColor(l.note)}`}>{l.note}</span>
              <span className="w-16 text-right text-[11px] text-ink-soft">poids {l.poids}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(100, score)) / 100);
  const col = score >= 70 ? "var(--color-good)" : score >= 40 ? "#d97706" : "var(--color-accent)";
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={R} fill="none" stroke="var(--color-line)" strokeWidth="7" />
        <circle cx="40" cy="40" r={R} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-3xl leading-none">{score}</span>
        <span className="text-[10px] text-ink-soft">/ 100</span>
      </div>
    </div>
  );
}

/* ---------- Onglet Messages (emails / SMS envoyés) ---------- */

function MessagesTab({ detail }: { detail: Detail }) {
  const msgs = detail.events.filter((e) => e.type === "message");
  if (msgs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
        Aucun email ni SMS envoyé pour cette demande.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {msgs.map((e) => {
        const p = (e.payload ?? {}) as MsgPayload;
        const failed = p.status === "echec";
        const ignored = p.status === "ignore";
        return (
          <div key={e.id} className="flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3">
            <span className="text-lg">{p.channel === "sms" ? "💬" : "✉️"}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.template ?? p.rule}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${failed ? "bg-warn/15 text-warn" : ignored ? "bg-subtle text-ink-soft" : "bg-good/15 text-good"}`}>
                  {failed ? "échec" : ignored ? "non envoyé" : "envoyé"}
                </span>
                <span className="text-[11px] uppercase text-ink-soft">{p.channel}</span>
              </div>
              <div className="mt-0.5 text-xs text-ink-soft">
                {p.to ? `→ ${p.to} · ` : ""}
                {new Date(e.created_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" })}
              </div>
              {(failed || ignored) && p.erreur && <div className="mt-1 text-xs text-warn">{p.erreur}</div>}
              {p.rule && p.rule !== p.template && <div className="mt-0.5 text-[11px] text-ink-soft/70">Règle : {p.rule}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MissingBanner({ missing, token }: { missing: string[]; token: string | null }) {
  return (
    <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-medium text-amber-900">Informations manquantes :</span>
        {missing.map((m) => (
          <span key={m} className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white/70 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {m}
          </span>
        ))}
        {token && (
          <a
            href={`/completer/${token}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100"
          >
            Ouvrir le lien de complétion ↗
          </a>
        )}
      </div>
    </div>
  );
}

/* ---------- Onglet Historique ---------- */

function TimelineTab({ detail }: { detail: Detail }) {
  // Les envois email/SMS ont leur propre onglet « Messages ».
  const events = detail.events.filter((e) => e.type !== "message");
  if (events.length === 0)
    return <div className="text-sm text-ink-soft">Aucun événement.</div>;
  return (
    <div className="relative space-y-4 pl-6">
      <div className="absolute inset-y-1 left-[7px] w-px bg-line" />
      {events.map((e) => {
        const p = (e.payload ?? {}) as { manque?: string[]; rempli?: { champ: string; valeur: string }[] };
        const incomplete = e.type === "incomplete";
        const completed = e.type === "completed";
        return (
          <div key={e.id} className="relative">
            <div className={`absolute -left-6 top-1.5 h-3.5 w-3.5 rounded-full border-2 bg-card ${incomplete ? "border-amber-400" : completed ? "border-good" : "border-accent"}`} />
            <div className="text-sm font-medium">{eventLabel(e.type)}</div>

            {incomplete && Array.isArray(p.manque) && p.manque.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.manque.map((m) => (
                  <span key={m} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">manque : {m}</span>
                ))}
              </div>
            )}

            {completed && (
              <div className="mt-1 space-y-0.5 text-xs">
                {Array.isArray(p.rempli) && p.rempli.length > 0 ? (
                  p.rempli.map((r, i) => (
                    <div key={i} className="text-ink-soft">✓ {r.champ} : <span className="text-ink">{r.valeur}</span></div>
                  ))
                ) : (
                  <div className="text-ink-soft">Informations confirmées.</div>
                )}
              </div>
            )}

            <div className="text-xs text-ink-soft">
              {new Date(e.created_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function eventLabel(type: string): string {
  const map: Record<string, string> = {
    created: "Demande créée",
    status_changed: "Statut modifié",
    scored: "Évaluation mise à jour",
    estimated: "Estimation calculée",
    note: "Note ajoutée",
    message: "Message envoyé",
    incomplete: "Demande incomplète",
    completed: "Demande complétée",
  };
  return map[type] ?? type;
}

/* ---------- Primitives ---------- */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-wide text-ink-soft">{title}</h3>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-ink-soft">{k}</dt>
      <dd className="text-right text-ink">{v}</dd>
    </>
  );
}

function AddressBlock({
  adresse,
  cp,
  ville,
  etage,
  ascenseur,
  type,
}: {
  adresse: string | null;
  cp: string | null;
  ville: string | null;
  etage: number | null;
  ascenseur: boolean | null;
  type: string | null;
}) {
  return (
    <div className="text-sm">
      <div className="text-ink">{adresse ?? "—"}</div>
      <div className="text-ink-soft">
        {cp} {ville}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {type && <span className="rounded-full bg-paper px-2 py-0.5">{type}</span>}
        <span className="rounded-full bg-paper px-2 py-0.5">Étage {etage ?? 0}</span>
        <span className="rounded-full bg-paper px-2 py-0.5">
          {ascenseur ? "Avec ascenseur" : "Sans ascenseur"}
        </span>
      </div>
    </div>
  );
}

function StatusPicker({
  value,
  onChange,
  disabled,
}: {
  value: RequestStatus;
  onChange: (s: RequestStatus) => void;
  disabled: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as RequestStatus)}
      disabled={disabled}
      className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium outline-none focus:border-accent disabled:opacity-50"
    >
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {STATUS_META[s].label}
        </option>
      ))}
    </select>
  );
}
