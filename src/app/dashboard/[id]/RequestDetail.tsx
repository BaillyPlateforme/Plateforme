"use client";

import { useState, useTransition } from "react";
import type { RequestDetail as Detail } from "@/lib/requests";
import type { PricingGridRow, RequestStatus } from "@/lib/types";
import { estimateQuote } from "@/lib/quote";
import { STATUS_META, STATUS_ORDER, scoreColor, sourceLabel, sourceClass, isIncomplete, missingFields, PIPELINE } from "../status";
import { updateStatus, updateScores, applyEstimation } from "@/lib/actions/requests";
import { createDevisFromRequest } from "@/lib/actions/devis";

const TABS = ["Infos", "Volume & photos", "Devis", "Historique"] as const;
type Tab = (typeof TABS)[number];

export default function RequestDetail({
  detail,
  grids,
  photoUrls,
}: {
  detail: Detail;
  grids: PricingGridRow[];
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

      {/* Éléments déclenchés (emails / SMS automatiques) */}
      <TriggeredMessages detail={detail} />

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
        {tab === "Volume & photos" && <VolumeTab detail={detail} photoUrls={photoUrls} />}
        {tab === "Devis" && <DevisTab detail={detail} grids={grids} />}
        {tab === "Historique" && <TimelineTab detail={detail} />}
      </div>
    </div>
  );
}

/* ---------- Onglet Infos ---------- */

function InfosTab({ detail }: { detail: Detail }) {
  const r = detail.request;
  const [pot, setPot] = useState(r.score_potentiel?.toString() ?? "");
  const [dif, setDif] = useState(r.score_difficulte?.toString() ?? "");
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

      {/* Scoring */}
      <Card title="Évaluation">
        <div className="space-y-4">
          <ScoreInput label="Potentiel" value={pot} onChange={setPot} />
          <ScoreInput label="Difficulté" value={dif} onChange={setDif} />
          <div>
            <label className="mb-1.5 block text-sm font-medium">Notes</label>
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
                await updateScores(
                  r.id,
                  pot === "" ? null : Number(pot),
                  dif === "" ? null : Number(dif),
                  notes || null,
                );
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
              })
            }
            disabled={pending}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
          >
            {pending ? "…" : saved ? "Enregistré ✓" : "Enregistrer l'évaluation"}
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

function DevisTab({ detail, grids }: { detail: Detail; grids: PricingGridRow[] }) {
  const r = detail.request;
  const activeGrids = grids.filter((g) => g.is_active);
  const initial = r.grid_id ?? activeGrids.find((g) => g.is_default)?.id ?? activeGrids[0]?.id;
  const [gridId, setGridId] = useState<string | undefined>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [generated, setGenerated] = useState(false);

  const grid = grids.find((g) => g.id === gridId);
  const quote = grid ? estimateQuote(r, grid) : null;

  if (activeGrids.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line p-8 text-center text-ink-soft">
        Aucune grille active. Créez-en une dans « Grilles tarifaires ».
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card title="Estimation">
          {quote ? (
            <div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line/70">
                  {quote.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="py-2 text-ink-soft">{l.label}</td>
                      <td className="py-2 text-right tabular-nums">{l.amount.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line">
                    <td className="py-2 text-ink-soft">Total HT</td>
                    <td className="py-2 text-right tabular-nums">{quote.ht.toFixed(2)} €</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-ink-soft">TVA ({grid!.vat_rate}%)</td>
                    <td className="py-1 text-right tabular-nums">{quote.tva.toFixed(2)} €</td>
                  </tr>
                  <tr>
                    <td className="pt-2 font-serif text-lg">Total TTC</td>
                    <td className="pt-2 text-right font-serif text-lg text-accent tabular-nums">
                      {quote.ttc.toFixed(2)} €
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Sélectionnez une grille.</p>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Grille appliquée">
          <select
            value={gridId}
            onChange={(e) => setGridId(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {activeGrids.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.is_default ? " (défaut)" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              start(async () => {
                await applyEstimation(r.id, gridId);
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
              })
            }
            disabled={pending || !quote}
            className="mt-3 w-full rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition hover:bg-accent-soft/40 disabled:opacity-50"
          >
            {pending ? "…" : saved ? "Enregistré ✓" : "Enregistrer l'estimation"}
          </button>
          <button
            onClick={() =>
              start(async () => {
                await createDevisFromRequest(r.id, gridId);
                setGenerated(true);
                setTimeout(() => setGenerated(false), 2000);
              })
            }
            disabled={pending || !quote}
            className="mt-2 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
          >
            {generated ? "Devis créé ✓" : "Générer le devis"}
          </button>
          {r.estimation_prix != null && (
            <p className="mt-3 text-xs text-ink-soft">
              Dernière estimation : {Math.round(r.estimation_prix)} € TTC
            </p>
          )}
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

function TriggeredMessages({ detail }: { detail: Detail }) {
  const msgs = detail.events.filter((e) => e.type === "message");
  return (
    <div className="mt-5">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">Éléments déclenchés</div>
      {msgs.length === 0 ? (
        <p className="text-sm text-ink-soft">Aucune action automatique (email / SMS) déclenchée pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {msgs.map((e) => {
            const p = (e.payload ?? {}) as MsgPayload;
            const failed = p.status === "echec";
            const ignored = p.status === "ignore";
            return (
              <span
                key={e.id}
                title={p.erreur ?? undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${failed ? "border-warn/40 bg-warn/10" : ignored ? "border-line bg-subtle" : "border-good/40 bg-good/10"}`}
              >
                <span>{p.channel === "sms" ? "💬" : "✉️"}</span>
                <span className="font-medium text-ink">{p.template ?? p.rule}</span>
                {p.to && <span className="text-ink-soft">→ {p.to}</span>}
                <span className={`font-medium ${failed ? "text-warn" : ignored ? "text-ink-soft" : "text-good"}`}>· {failed ? "échec" : ignored ? "non envoyé" : "envoyé"}</span>
              </span>
            );
          })}
        </div>
      )}
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
  const { events } = detail;
  if (events.length === 0)
    return <div className="text-sm text-ink-soft">Aucun événement.</div>;
  return (
    <div className="relative space-y-4 pl-6">
      <div className="absolute inset-y-1 left-[7px] w-px bg-line" />
      {events.map((e) => {
        const isMsg = e.type === "message";
        const p = (e.payload ?? {}) as MsgPayload;
        const failed = isMsg && p.status === "echec";
        const ignored = isMsg && p.status === "ignore";
        return (
          <div key={e.id} className="relative">
            <div className={`absolute -left-6 top-1.5 h-3.5 w-3.5 rounded-full border-2 bg-card ${failed ? "border-warn" : ignored ? "border-line-strong" : isMsg ? "border-good" : "border-accent"}`} />
            {isMsg ? (
              <div>
                <div className="text-sm font-medium">
                  {p.channel === "sms" ? "💬 SMS" : "✉️ Email"} — {p.template ?? p.rule}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${failed ? "bg-warn/15 text-warn" : ignored ? "bg-subtle text-ink-soft" : "bg-good/15 text-good"}`}>
                    {failed ? "échec" : ignored ? "non envoyé" : "envoyé"}
                  </span>
                </div>
                <div className="text-xs text-ink-soft">
                  {p.to ? `→ ${p.to}` : ""}
                  {(failed || ignored) && p.erreur ? `${p.to ? " · " : ""}${p.erreur}` : ""}
                </div>
              </div>
            ) : (
              <div className="text-sm font-medium">{eventLabel(e.type)}</div>
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

function ScoreInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const n = value === "" ? null : Number(value);
  return (
    <div>
      <label className="mb-1.5 flex items-center justify-between text-sm font-medium">
        {label}
        <span className={`tabular-nums ${scoreColor(n)}`}>{value || "—"}/100</span>
      </label>
      <input
        type="range"
        min={0}
        max={100}
        value={value === "" ? 0 : value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-[var(--color-accent)]"
      />
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
