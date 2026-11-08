"use client";

import { useEffect, useRef } from "react";
import { ETAPE_RH, ETAPES_EN_COURS, type FactureRh, type MobiliteRh } from "@/lib/rh-modele";
import { PastilleEtape } from "./_ui/briques";
import { Picto } from "./_ui/Icones";
import { euro, formule, jourLong, joursAvant, quand, versDate } from "./calculs";
import { Initiales } from "./vues/Collaborateurs";

const NATURE: Record<NonNullable<MobiliteRh["montant"]>["nature"], string> = { estimation: "Estimation", devis: "Devis envoyé", signe: "Devis signé" };

/**
 * La fiche d'un collaborateur : où en est sa mobilité, combien elle coûte, et
 * sa chronologie — ce qui s'est passé, et ce qui est prévu. En lecture seule.
 */
export default function Fiche({
  m,
  factures,
  couts,
  maintenant,
  lienPdf,
  onFermer,
}: {
  m: MobiliteRh;
  factures: FactureRh[];
  couts: boolean;
  maintenant: number;
  lienPdf: (f: FactureRh) => string;
  onFermer: () => void;
}) {
  const fermer = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    fermer.current?.focus();
    const touche = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    document.addEventListener("keydown", touche);
    const ancien = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", touche);
      document.body.style.overflow = ancien;
    };
  }, [onFermer]);

  const e = ETAPE_RH[m.etape];
  const rang = ETAPES_EN_COURS.findIndex((x) => x.cle === m.etape);
  const termine = m.etape === "termine";
  const sesFactures = factures.filter((f) => f.mobilite === m.id);
  const auj = new Date(maintenant).toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Mobilité de ${m.nom}`}>
      <button type="button" aria-label="Fermer" tabIndex={-1} onClick={onFermer} className="absolute inset-0 bg-[#1b1a18]/40" />
      <div className="animate-step-in relative h-full w-full max-w-[500px] overflow-y-auto overscroll-contain bg-paper shadow-[-30px_0_60px_-30px_rgba(27,26,24,0.55)]">
        {/* ── L'en-tête, aux couleurs de l'entreprise ── */}
        <div className="relative overflow-hidden bg-[#1b1a18] px-6 pb-6 pt-5 text-white">
          <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-brand" />
          <div className="flex items-start justify-between gap-4">
            <p className="pt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
              {m.reference ? `Dossier ${m.reference}` : `Demande du ${jourLong(m.cree_le)}`}
            </p>
            <button
              ref={fermer}
              type="button"
              onClick={onFermer}
              aria-label="Fermer la fiche"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <Picto nom="croix" taille={16} trait={2.2} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3.5">
            <Initiales nom={m.nom} grand />
            <div className="min-w-0">
              <h2 className="font-serif truncate text-[26px] leading-tight">{m.nom}</h2>
              <p className="mt-0.5 truncate text-[14px] text-white/75">
                {m.depart ?? "?"} <span className="text-brand-clair">→</span> {m.arrivee ?? "?"}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-6 py-6">
          {/* ── L'avancement ── */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-soft">Avancement</h3>
              <PastilleEtape etape={m.etape} grande />
            </div>
            {e.ouverte || termine ? (
              <ol className="grid grid-cols-6 gap-1.5">
                {ETAPES_EN_COURS.map((x, i) => {
                  const fait = termine || i <= rang;
                  return (
                    <li key={x.cle} title={x.aide}>
                      <div className={`h-1.5 rounded-full ${fait ? "bg-brand" : "bg-line-strong"} ${i === rang ? "ring-2 ring-brand/30 ring-offset-1 ring-offset-paper" : ""}`} />
                      <div className={`mt-2 text-[10.5px] leading-tight ${i === rang ? "font-bold text-ink" : fait ? "text-ink-mid" : "text-ink-soft"}`}>{x.label}</div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="rounded-[14px] bg-subtle px-4 py-3 text-[13px] text-ink-mid">{e.aide}.</p>
            )}
          </section>

          {/* ── Le coût ── */}
          {couts && (
            <section className="rounded-[20px] bg-card p-5 ring-1 ring-line">
              <h3 className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-soft">Coût</h3>
              {m.montant ? (
                <>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5">
                    <span className="text-[30px] font-bold leading-none tracking-[-0.02em]">{euro(m.montant.ht)}</span>
                    <span className="text-[13px] font-semibold text-ink-soft">HT</span>
                    <span className="text-[13px] text-ink-soft">· {euro(m.montant.ttc)} TTC</span>
                  </div>
                  <p className="mt-2 text-[12.5px] text-ink-mid">
                    {NATURE[m.montant.nature]}
                    {m.montant.reference ? ` n° ${m.montant.reference}` : ""}
                    {m.montant.valide_jusqu && m.montant.nature !== "signe"
                      ? `${m.montant.valide_jusqu < auj ? " · arrivé à échéance le " : " · valable jusqu'au "}${jourLong(m.montant.valide_jusqu)}`
                      : ""}
                  </p>
                  {m.facture_ttc !== 0 && <p className="mt-1 text-[12.5px] text-ink-mid">Facturé : {euro(m.facture_ttc)} TTC</p>}
                </>
              ) : (
                <p className="mt-2 text-[13.5px] text-ink-mid">Pas encore chiffrée : l&apos;estimation arrive après l&apos;étude de la demande.</p>
              )}
            </section>
          )}

          {/* ── Les informations ── */}
          <section>
            <h3 className="mb-1 text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-soft">Informations</h3>
            <dl className="divide-y divide-line text-[13.5px]">
              {(
                [
                  ["Départ", [m.depart, m.depart_cp].filter(Boolean).join(" · ") || "—"],
                  ["Arrivée", [m.arrivee, m.arrivee_cp].filter(Boolean).join(" · ") || "—"],
                  ["Distance", m.distance_km != null ? `${Math.round(m.distance_km).toLocaleString("fr-FR")} km par la route` : "—"],
                  ["Déménagement", `${quand(m)}${m.date ? (m.date_fixee ? " · date fixée" : " · date souhaitée") : ""}`],
                  ...(m.periode && m.date ? [["Période indiquée", m.periode]] : []),
                  ["Volume", m.volume_m3 != null ? `${m.volume_m3.toLocaleString("fr-FR")} m³` : "—"],
                  ["Formule", formule(m.formule)],
                  ...(m.email ? [["E-mail", m.email]] : []),
                  ...(m.tel ? [["Téléphone", m.tel]] : []),
                ] as [string, string][]
              ).map(([cle, valeur]) => (
                <div key={cle} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-ink-soft">{cle}</dt>
                  <dd className="min-w-0 truncate text-right font-medium">{valeur}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* ── La chronologie ── */}
          <section>
            <h3 className="mb-3 text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-soft">Chronologie</h3>
            <ol className="relative">
              {m.chronologie.map((j, i) => {
                const avenir = joursAvant(j.date, maintenant) > 0 || (j.date.length > 10 && versDate(j.date).getTime() > maintenant);
                const dernier = i === m.chronologie.length - 1;
                return (
                  <li key={`${j.date}-${j.libelle}-${i}`} className="relative flex gap-3.5 pb-4 last:pb-0">
                    {!dernier && <span aria-hidden className="absolute left-[7px] top-4 h-[calc(100%-8px)] w-px bg-line-strong" />}
                    <span
                      aria-hidden
                      className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${avenir ? "border-line-strong bg-paper" : "border-paper bg-brand ring-1 ring-brand"}`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className={`text-[13.5px] font-semibold ${avenir ? "text-ink-mid" : ""}`}>{j.libelle}</span>
                        {avenir && <span className="rounded-full bg-brand-soft px-2 py-px text-[10.5px] font-bold uppercase tracking-[0.06em] text-brand-ink">à venir</span>}
                      </div>
                      <div className="text-[12px] text-ink-soft">
                        {jourLong(j.date)}
                        {j.date.length > 10 && !/T00:00:00/.test(j.date) ? ` · ${versDate(j.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                        {j.detail ? ` · ${j.detail}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* ── Les factures ── */}
          {couts && sesFactures.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-soft">Factures</h3>
              <ul className="divide-y divide-line rounded-[18px] bg-card ring-1 ring-line">
                {sesFactures.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold">{f.numero}</div>
                      <div className="truncate text-[12px] text-ink-soft">
                        {jourLong(f.emise_le)} · {euro(f.ttc)} TTC · {f.statut === "payee" ? "réglée" : f.statut === "annulee" ? "annulée" : "à régler"}
                      </div>
                    </div>
                    {f.pdf && (
                      <a href={lienPdf(f)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[12.5px] font-semibold hover:border-ink">
                        <Picto nom="telecharger" taille={14} /> PDF
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="flex gap-2.5 text-[12px] leading-relaxed text-ink-soft">
            <Picto nom="cadenas" taille={15} className="mt-px shrink-0" />
            L&apos;adresse exacte, l&apos;inventaire et les photos du logement restent entre votre collaborateur et Bailly Déménagement.
          </p>
        </div>
      </div>
    </div>
  );
}
