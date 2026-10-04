"use client";

import Image from "next/image";
import { useEffect, useState, type CSSProperties } from "react";
import TrajetMap from "@/components/TrajetMap";
import { Icone } from "./ui";

/* ---------- Résultat instantané : génération puis devis complet (PDF + montant) ---------- */

type DevisData = {
  id: string; reference: string; montant_ht: number; montant_tva: number; montant_ttc: number;
  lignes: { label: string; amount: number }[]; valid_until: string | null;
  ville_depart: string | null; ville_arrivee: string | null; volume_m3: number | null;
};
const euro = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

export function InstantResult({ requestId, volume, count = 1, onNewQuote }: { requestId: string; volume: number | null; count?: number; onNewQuote?: () => void }) {
  const DURATION = 7000; // génération visible mais rapide
  const STEPS = [
    "Analyse de votre demande…",
    "Calcul du volume et de la distance…",
    "Application de nos tarifs…",
    "Préparation de votre estimation…",
  ];
  const [progress, setProgress] = useState(2);
  const [msg, setMsg] = useState(0);
  const [ready, setReady] = useState(false);
  const [devis, setDevis] = useState<DevisData | null>(null);

  useEffect(() => {
    // Récupère le devis généré (avec quelques tentatives si la qualification finit à peine).
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 6 && !cancelled; i++) {
        try {
          const r = await fetch(`/api/requests/${requestId}/devis`);
          if (r.ok) { const d = await r.json(); if (!cancelled) setDevis(d); break; }
        } catch { /* retry */ }
        await new Promise((res) => setTimeout(res, 1500));
      }
    })();
    return () => { cancelled = true; };
  }, [requestId]);

  useEffect(() => {
    const start = Date.now();
    const iv = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / DURATION);
      setProgress(Math.min(98, Math.round(t * 98)));
      setMsg(Math.min(STEPS.length - 1, Math.floor(t * STEPS.length)));
    }, 250);
    const done = setTimeout(() => {
      clearInterval(iv);
      setProgress(100);
      setTimeout(() => setReady(true), 500);
    }, DURATION);
    return () => { clearInterval(iv); clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    const tour = 2 * Math.PI * 52;
    return (
      <Scene>
        <div className="w-full max-w-md text-center">
          <div className="relative mx-auto h-28 w-28">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="6" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="#f5d033"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={tour}
                strokeDashoffset={tour * (1 - progress / 100)}
                className="transition-[stroke-dashoffset] duration-300 ease-out"
              />
            </svg>
            <span className="font-serif absolute inset-0 flex items-center justify-center text-[27px] text-white tnum">
              {progress}
              <span className="ml-0.5 text-[14px] text-white/55">%</span>
            </span>
          </div>
          <h1 className="font-serif mt-8 text-balance text-[30px] text-white sm:text-[36px]">
            {count > 1 ? "Génération de vos estimations…" : "Génération de votre estimation…"}
          </h1>
          <ul className="mx-auto mt-8 max-w-[19rem] space-y-3.5 text-left">
            {STEPS.map((texte, i) => {
              const etat = i < msg ? "fait" : i === msg ? "cours" : "attente";
              return (
                <li
                  key={texte}
                  className={`flex items-center gap-3 text-[14px] transition-colors duration-500 ${
                    etat === "attente" ? "text-white/35" : etat === "cours" ? "text-white" : "text-white/70"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      etat === "fait"
                        ? "bg-brand text-[#1b1a18]"
                        : etat === "cours"
                          ? "border-2 border-brand"
                          : "border border-white/25"
                    }`}
                  >
                    {etat === "fait" && <Icone nom="check" taille={11} trait={3.4} className="coche-pop" />}
                    {etat === "cours" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />}
                  </span>
                  {texte.replace(/…$/, "")}
                </li>
              );
            })}
          </ul>
          <p className="mt-8 text-[12.5px] text-white/50">Encore quelques secondes…</p>
        </div>
      </Scene>
    );
  }

  // Plusieurs demandes (via le comparateur) : confirmation sans détailler chaque prix.
  if (count > 1) {
    return (
      <Scene>
        <div className="w-full max-w-lg text-center">
          <div className="reveal mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand text-[#1b1a18] shadow-[0_0_0_10px_rgba(245,208,51,0.18)]">
            <Icone nom="check" taille={28} trait={3} className="coche-pop" />
          </div>
          <h1 className="font-serif reveal mt-7 text-balance text-[36px] text-white sm:text-[46px]">
            Vos {count} estimations sont prêtes
          </h1>
          <p className="reveal mt-4 text-[15.5px] leading-relaxed text-white/72">
            Nous vous adressons une estimation pour chaque scénario par e-mail.
          </p>
          <p className="reveal mx-auto mt-3 max-w-[46ch] text-[14px] leading-relaxed text-white/60">
            Cette estimation vous convient ? Contactez-nous pour la transformer en devis ferme —
            nous revenons vers vous sous 24 h ouvrées.
          </p>
          {onNewQuote && (
            <button
              onClick={onNewQuote}
              className="reveal mt-8 inline-flex h-12 items-center rounded-full bg-brand px-6 text-[14px] font-semibold text-[#1b1a18] transition hover:bg-[#e0b81a] active:scale-[0.98]"
            >
              Faire une nouvelle demande
            </button>
          )}
        </div>
      </Scene>
    );
  }

  // Devis unique : on affiche le montant, le résumé et le PDF complet.
  return (
    <div className="min-h-dvh bg-paper">
      <section className="grain relative overflow-hidden bg-[#1b1a18] px-5 pb-32 pt-10 sm:pb-36 sm:pt-12">
        <Decor />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <Image
            src="/marque/bailly-logo-blanc.svg"
            alt="Bailly Déménagement"
            width={200}
            height={64}
            priority
            className="mx-auto h-auto w-[150px]"
          />
          <div className="reveal mx-auto mt-9 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-[#1b1a18] shadow-[0_0_0_9px_rgba(245,208,51,0.18)]">
            <Icone nom="check" taille={24} trait={3} className="coche-pop" />
          </div>
          <p className="eyebrow reveal mt-6 text-brand">Votre proposition</p>
          <h1 className="font-serif reveal mt-3 text-balance text-[36px] text-white sm:text-[50px]">
            Votre estimation <span className="gradient-flow-light">est prête</span>
          </h1>
          <p className="reveal mt-3 text-[15px] text-white/70">Estimation établie selon les informations transmises.</p>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-24 max-w-3xl space-y-5 px-5 pb-16 sm:-mt-28">
        {devis ? (
          <>
            <div className="bloc reveal overflow-hidden rounded-[26px] border border-line bg-card">
              <div className="flex flex-wrap items-end justify-between gap-5 p-6 sm:p-8">
                <div className="min-w-0">
                  <div className="eyebrow text-brand-ink">Votre trajet</div>
                  <div className="font-serif mt-2 text-[22px] leading-tight sm:text-[26px]">
                    {devis.ville_depart ?? "?"} → {devis.ville_arrivee ?? "?"}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {devis.volume_m3 != null && <Puce>~{devis.volume_m3} m³</Puce>}
                    <Puce>Estimation {devis.reference}</Puce>
                    {devis.valid_until && (
                      <Puce>valable jusqu&apos;au {new Date(devis.valid_until).toLocaleDateString("fr-FR")}</Puce>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] text-ink-soft">Total estimé</div>
                  <div className="font-serif mt-1 text-[42px] leading-none tnum sm:text-[54px]">
                    {euro(devis.montant_ttc)}
                    <span className="ml-2 text-[15px] font-medium text-ink-soft">TTC</span>
                  </div>
                </div>
              </div>
              <table className="w-full text-[14px]">
                <tbody>
                  {(devis.lignes ?? []).map((l, i) => (
                    <tr key={i} className="border-t border-line/70">
                      <td className="px-6 py-3 text-ink-mid sm:px-8">{l.label}</td>
                      <td className="whitespace-nowrap px-6 py-3 text-right tnum sm:px-8">{l.amount.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-subtle">
                  <tr className="border-t border-line">
                    <td className="px-6 pb-1 pt-3.5 text-ink-soft sm:px-8">Total HT</td>
                    <td className="px-6 pb-1 pt-3.5 text-right tnum sm:px-8">{devis.montant_ht.toFixed(2)} €</td>
                  </tr>
                  <tr>
                    <td className="px-6 pb-3.5 pt-1 text-ink-soft sm:px-8">TVA</td>
                    <td className="px-6 pb-3.5 pt-1 text-right tnum sm:px-8">{devis.montant_tva.toFixed(2)} €</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Carte du trajet */}
            {(devis.ville_depart || devis.ville_arrivee) && (
              <div className="bloc overflow-hidden rounded-[26px] border border-line bg-card">
                <TrajetMap nu departVille={devis.ville_depart} arriveeVille={devis.ville_arrivee} height={300} />
              </div>
            )}

            {/* PDF complet */}
            <div className="bloc overflow-hidden rounded-[26px] border border-line bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-6">
                <span className="font-serif text-[18px]">Votre estimation</span>
                <a
                  href={`/api/devis/${devis.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-semibold text-shell transition active:scale-[0.98]"
                >
                  <span className="coche-or">
                    <Icone nom="telecharger" taille={15} trait={2.2} />
                  </span>
                  Télécharger le PDF
                </a>
              </div>
              <iframe src={`/api/devis/${devis.id}/pdf`} title="Devis" className="h-[640px] w-full" />
            </div>
          </>
        ) : (
          <div className="bloc rounded-[26px] border border-line bg-card p-8 text-center text-[14px] text-ink-soft">
            Votre devis est en cours de finalisation — un conseiller vous l&apos;adresse par e-mail très vite.
          </div>
        )}

        {/* La phrase de fin, et ce qu'il faut faire pour aller plus loin. */}
        <div className="bloc overflow-hidden rounded-[26px] border border-line bg-card p-6 text-center sm:p-9">
          <h3 className="font-serif text-[24px] leading-snug">Et maintenant ?</h3>
          <p className="mx-auto mt-3 max-w-[58ch] text-[14px] leading-relaxed text-ink-soft">
            Cette estimation est établie sur notre grille tarifaire, à partir de ce que vous avez
            renseigné. Elle vaut pour un déménagement dans des conditions normales d&apos;accès ;
            un conseiller la confirme après échange avec vous — par téléphone ou lors d&apos;une
            visite technique, gratuite et sans engagement.
          </p>
          <p className="mx-auto mt-3 max-w-[58ch] text-[14px] leading-relaxed text-ink-soft">
            Si cette proposition vous intéresse, le plus simple est de nous appeler : nous bloquons
            votre date, et vous recevez un devis ferme sous 24 heures ouvrées.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <BoutonRappel requestId={requestId} />
            <a
              href="tel:+33169103520"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-line-strong px-5 text-[14px] font-semibold transition hover:border-ink"
            >
              <Icone nom="tel" taille={15} />
              01 69 10 35 20
            </a>
            {onNewQuote && (
              <button
                onClick={onNewQuote}
                className="inline-flex h-12 items-center rounded-full px-4 text-[14px] font-medium text-ink-soft transition hover:text-ink"
              >
                Demander un nouveau devis
              </button>
            )}
          </div>
          <p className="mt-6 text-[12px] text-ink-soft">
            Estimation indicative, valable 30 jours — elle ne vaut pas devis contractuel.
          </p>
        </div>
      </div>
    </div>
  );
}

function Puce({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-subtle px-2.5 py-1 text-[12px] font-medium text-ink-mid">
      {children}
    </span>
  );
}

/**
 * « Être rappelé ».
 *
 * Le client n'a pas toujours envie d'appeler. Un clic suffit : la demande
 * remonte dans le tableau des rappels de l'équipe, classée par potentiel.
 */
function BoutonRappel({ requestId }: { requestId: string }) {
  const [etat, setEtat] = useState<"repos" | "envoi" | "fait" | "echec">("repos");

  async function demander() {
    setEtat("envoi");
    try {
      const res = await fetch("/api/rappels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId }),
      });
      setEtat(res.ok ? "fait" : "echec");
    } catch {
      setEtat("echec");
    }
  }

  if (etat === "fait") {
    return (
      <span className="animate-step-in inline-flex h-12 items-center gap-2 rounded-full bg-good-soft px-5 text-[14px] font-semibold text-good">
        <Icone nom="check" taille={15} trait={3} className="coche-pop" />
        Nous vous rappelons très vite
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={demander}
      disabled={etat === "envoi"}
      className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 text-[14px] font-semibold text-[#1b1a18] shadow-[0_14px_28px_-14px_rgba(245,208,51,0.9)] transition hover:bg-[#e0b81a] active:scale-[0.98] disabled:opacity-60"
    >
      <Icone nom="tel" taille={15} trait={2.2} />
      {etat === "envoi" ? "…" : etat === "echec" ? "Réessayer" : "Être rappelé"}
    </button>
  );
}

/** Le décor sombre de la vitrine : la photo, ses voiles et le halo doré. */
function Decor() {
  return (
    <div aria-hidden className="absolute inset-0">
      <Image src="/login-interieur.jpg" alt="" fill priority sizes="100vw" className="ken-burns object-cover" />
      <div className="absolute inset-0 bg-[#1b1a18]/72" />
      <div className="absolute inset-0 bg-linear-to-b from-[#1b1a18]/88 via-[#1b1a18]/45 to-[#1b1a18]/95" />
      <div
        className="halo drift absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2"
        style={{ "--halo": "rgba(245,208,51,0.2)" } as CSSProperties}
      />
    </div>
  );
}

/** Un écran entier posé sur le décor : l'attente, puis la confirmation. */
function Scene({ children }: { children: React.ReactNode }) {
  return (
    <div className="grain relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#1b1a18] px-6 py-16">
      <Decor />
      <div className="relative z-10 flex w-full justify-center">{children}</div>
    </div>
  );
}

/* ---------- Comparateur de scénarios (sans prix) ---------- */

export type CompareBase = {
  nom: string;
  email: string;
  tel: string;
  departVille: string;
  departCP: string;
  arriveeVille: string;
  date: string;
};

type Variant = {
  volume: string; distance: string;
  departEtage: string; departAsc: boolean; departType: string;
  arriveeEtage: string; arriveeAsc: boolean; arriveeType: string;
  emballage: boolean; demontage: boolean; montage: boolean; monteMeuble: boolean; gardeMeuble: boolean;
  formule: "" | "eco" | "standard" | "luxe";
  include: boolean;
};

const blank = (v?: Partial<Variant>): Variant => ({
  volume: "", distance: "",
  departEtage: "0", departAsc: false, departType: "",
  arriveeEtage: "0", arriveeAsc: false, arriveeType: "",
  emballage: false, demontage: false, montage: false, monteMeuble: false, gardeMeuble: false,
  formule: "", include: true, ...v,
});

const LOGE = ["", "Studio", "T1", "T2", "T3", "T4", "T5+", "Maison"];

export function Comparateur({
  base,
  initial,
  simple = false,
  onClose,
  onDone,
}: {
  base: CompareBase;
  initial?: Partial<Variant>;
  simple?: boolean;
  onClose: () => void;
  onDone: (count: number, firstId: string) => void;
}) {
  const [cols, setCols] = useState<Variant[]>([blank(initial), blank(initial)]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const included = cols.filter((c) => c.include);
  const missingBase = !base.nom || !base.email || !base.departVille || !base.arriveeVille;
  const canSubmit = !missingBase && included.length > 0 && included.every((c) => Number(c.volume) > 0);

  const patch = (i: number, p: Partial<Variant>) => setCols((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const addCol = () => setCols((cs) => (cs.length < 3 ? [...cs, blank(cs[cs.length - 1])] : cs));
  const removeCol = (i: number) => setCols((cs) => (cs.length > 2 ? cs.filter((_, j) => j !== i) : cs));

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const ids: string[] = [];
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (!c.include) continue;
        const res = await fetch("/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client: { nom: base.nom, email: base.email, tel: base.tel || undefined },
            depart: { ville: base.departVille || undefined, code_postal: base.departCP || undefined, etage: Number(c.departEtage) || 0, ascenseur: c.departAsc, type_logement: c.departType || undefined },
            arrivee: { ville: base.arriveeVille || undefined, etage: Number(c.arriveeEtage) || 0, ascenseur: c.arriveeAsc, type_logement: c.arriveeType || undefined },
            date_souhaitee: base.date || undefined,
            distance_km: Number(c.distance) || undefined,
            formule: c.formule || undefined,
            volume: { method: "explicit", volume_m3: Number(c.volume) || 0 },
            services: { emballage: c.emballage, demontage: c.demontage, montage: c.montage, monte_meuble: c.monteMeuble, garde_meuble: c.gardeMeuble },
            type_client: "particulier",
            details: { variante: i } as unknown as Record<string, unknown>,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Envoi impossible");
        ids.push(data.id);
      }
      onDone(ids.length, ids[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/65 p-4 md:p-8">
      <div className={`w-full ${simple ? "max-w-3xl" : "max-w-6xl"} rounded-[18px] bg-subtle p-6 shadow-[var(--shadow-md)]`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl">Comparer plusieurs scénarios</h2>
            <p className="text-sm text-ink-soft">
              Trajet : <span className="font-medium text-ink">{base.departVille || "?"} → {base.arriveeVille || "?"}</span>. Faites varier tous les paramètres — chaque variante ajoutée devient une demande, et vous recevrez un devis pour chacune par e-mail.
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-xl border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:text-ink">Fermer ✕</button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {cols.map((c, i) => (
            <div key={i} className={`rounded-2xl border-2 bg-card p-4 transition ${c.include ? "border-accent" : "border-line"}`}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium">{i === 0 ? "Votre demande" : `Variante ${i}`}</span>
                {cols.length > 2 && i > 0 && <button onClick={() => removeCol(i)} className="text-xs text-ink-soft hover:text-ink">retirer</button>}
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <NumF label="Volume (m³) *" value={c.volume} onChange={(v) => patch(i, { volume: v })} />
                  <NumF label="Distance (km)" value={c.distance} onChange={(v) => patch(i, { distance: v })} />
                </div>

                {!simple && (
                  <>
                    <Group title="Départ">
                      <div className="grid grid-cols-2 gap-2">
                        <NumF label="Étage" value={c.departEtage} onChange={(v) => patch(i, { departEtage: v })} />
                        <SelF label="Logement" value={c.departType} options={LOGE} onChange={(v) => patch(i, { departType: v })} />
                      </div>
                      <Toggle label="Ascenseur" checked={c.departAsc} onChange={(v) => patch(i, { departAsc: v })} />
                    </Group>

                    <Group title="Arrivée">
                      <div className="grid grid-cols-2 gap-2">
                        <NumF label="Étage" value={c.arriveeEtage} onChange={(v) => patch(i, { arriveeEtage: v })} />
                        <SelF label="Logement" value={c.arriveeType} options={LOGE} onChange={(v) => patch(i, { arriveeType: v })} />
                      </div>
                      <Toggle label="Ascenseur" checked={c.arriveeAsc} onChange={(v) => patch(i, { arriveeAsc: v })} />
                    </Group>

                    <Group title="Prestations">
                      <Toggle label="Emballage" checked={c.emballage} onChange={(v) => patch(i, { emballage: v })} />
                      <Toggle label="Démontage" checked={c.demontage} onChange={(v) => patch(i, { demontage: v })} />
                      <Toggle label="Remontage" checked={c.montage} onChange={(v) => patch(i, { montage: v })} />
                      <Toggle label="Monte-meuble" checked={c.monteMeuble} onChange={(v) => patch(i, { monteMeuble: v })} />
                      <Toggle label="Garde-meuble" checked={c.gardeMeuble} onChange={(v) => patch(i, { gardeMeuble: v })} />
                    </Group>

                    <SelF label="Formule" value={c.formule} options={["", "eco", "standard", "luxe"]} labels={{ "": "— au choix —", eco: "Éco", standard: "Standard", luxe: "Confort" }} onChange={(v) => patch(i, { formule: v as Variant["formule"] })} />
                  </>
                )}
              </div>

              <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-sm">
                <input type="checkbox" checked={c.include} onChange={(e) => patch(i, { include: e.target.checked })} className="h-4 w-4 accent-[var(--color-accent)]" />
                <span className="font-medium">Ajouter à ma demande</span>
              </label>
            </div>
          ))}
          {cols.length < 3 && (
            <button onClick={addCol} className={`flex ${simple ? "min-h-[140px]" : "min-h-[300px]"} items-center justify-center rounded-2xl border-2 border-dashed border-line text-sm text-ink-soft transition hover:border-accent hover:text-accent`}>
              + Ajouter une variante
            </button>
          )}
        </div>

        {error && <div className="mt-4 rounded-xl border border-accent/40 bg-accent-soft/50 px-4 py-3 text-sm text-accent-dark">{error}</div>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <span className="text-sm text-ink-soft">
            {missingBase
              ? "Renseignez d'abord nom, e-mail, ville de départ et d'arrivée dans le formulaire."
              : `${included.length} demande${included.length > 1 ? "s" : ""} — ${included.length} devis à recevoir`}
          </span>
          <button
            onClick={submit}
            disabled={!canSubmit || submitting}
            className="rounded-xl bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Envoi…" : included.length > 1 ? `Envoyer mes ${included.length} demandes` : "Envoyer ma demande"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-paper/50 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SelF({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-soft">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent">
        {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? (o === "" ? "—" : o)}</option>)}
      </select>
    </label>
  );
}

function NumF({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-soft">{label}</span>
      <input type="number" min={0} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-accent" />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between text-sm">
      <span className="text-ink-soft">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
    </label>
  );
}
