"use client";

import { useMemo, useState } from "react";
import { moisDe, type FactureRh, type MobiliteRh } from "@/lib/rh-modele";
import { Carte, NoteHorsBudget, Segments, Tuile, Vide } from "../_ui/briques";
import { BarresSimples, ColonnesMois } from "../_ui/graphiques";
import { Picto } from "../_ui/Icones";
import { auBudget, budget, budgetParFormule, budgetParMois, cleMois, euro, horsBudget, jourMoyen, moisDeLaFenetre } from "../calculs";

/*
 * Le budget : ce qui est engagé, signé, facturé — en HT et TTC —, mois par
 * mois (au mois du déménagement) et par formule, puis les factures.
 *
 * La période se choisit une fois, au-dessus de tout : « Tout », ou une année
 * (celle du déménagement ; pour une facture, celle de son émission).
 */
export default function VueBudget({
  mobilites,
  factures,
  couts,
  maintenant,
  apercu,
  onOuvrir,
}: {
  mobilites: MobiliteRh[];
  factures: FactureRh[];
  couts: boolean;
  maintenant: number;
  /** L'identifiant de l'espace quand l'équipe regarde : le lien du PDF le porte. */
  apercu: string | null;
  onOuvrir: (id: string) => void;
}) {
  const annee = String(new Date(maintenant).getFullYear());
  const annees = useMemo(() => {
    const s = new Set<string>([annee]);
    for (const m of mobilites) {
      const c = moisDe(m);
      if (c && auBudget(m)) s.add(c.slice(0, 4));
    }
    for (const f of factures) s.add(f.emise_le.slice(0, 4));
    return [...s].sort();
  }, [mobilites, factures, annee]);
  const [periode, setPeriode] = useState<string>("tout");

  const dansPeriode = useMemo(
    () => (periode === "tout" ? mobilites : mobilites.filter((m) => moisDe(m)?.startsWith(periode))),
    [mobilites, periode],
  );
  const facturesPeriode = useMemo(() => (periode === "tout" ? factures : factures.filter((f) => f.emise_le.startsWith(periode))), [factures, periode]);
  const b = useMemo(() => budget(dansPeriode, facturesPeriode), [dansPeriode, facturesPeriode]);
  const courant = cleMois(maintenant);
  // « Tout » : cinq mois passés, le mois en cours, six à venir ; une année : de janvier à décembre.
  const fenetre = useMemo(() => {
    if (periode !== "tout") return moisDeLaFenetre(`${periode}-01`, 12);
    const d = new Date(maintenant);
    return moisDeLaFenetre(cleMois(new Date(d.getFullYear(), d.getMonth() - 5, 15).getTime()), 12);
  }, [periode, maintenant]);
  const mois = useMemo(() => budgetParMois(dansPeriode, fenetre), [dansPeriode, fenetre]);
  const formules = useMemo(() => budgetParFormule(dansPeriode), [dansPeriode]);

  if (!couts)
    return (
      <Vide
        picto="euro"
        titre="Les montants ne sont pas communiqués dans votre espace"
        texte="Les estimations et les factures sont transmises par votre interlocuteur Bailly Déménagement. Contactez-le pour les recevoir ici."
      />
    );

  // Rien que l'entreprise paie, ni facture : un état vide, qui dit pourquoi.
  const hors = horsBudget(mobilites);
  if (!mobilites.some(auBudget) && factures.length === 0)
    return (
      <div className="space-y-4">
        <Vide
          picto="euro"
          titre="Rien n'entre encore dans votre budget"
          texte="Le budget compte les mobilités que votre entreprise paie, dès leur première estimation ou leur premier devis."
        />
        <NoteHorsBudget {...hors} className="px-1" />
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segments label="Période" valeur={periode} onChange={setPeriode} options={[["tout", "Toutes les mobilités"], ...annees.map((a) => [a, a] as [string, string])]} />
        <p className="text-[12.5px] text-ink-soft">Au mois du déménagement prévu · factures à leur date d&apos;émission</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Tuile nuit picto="euro" label="Engagé HT" valeur={euro(b.engage.ht)} note={`${euro(b.engage.ttc)} TTC · ${b.engage.n} mobilité${b.engage.n > 1 ? "s" : ""}`} />
        <Tuile picto="check" label="Signé HT" valeur={euro(b.signe.ht)} note={`${euro(b.signe.ttc)} TTC · ${b.signe.n} mobilité${b.signe.n > 1 ? "s" : ""}`} />
        <Tuile picto="horloge" label="En attente de signature HT" valeur={euro(b.attente.ht)} note={`${euro(b.attente.ttc)} TTC · estimations et devis envoyés`} />
        <Tuile
          picto="document"
          label="Facturé TTC"
          valeur={euro(b.facture.ttc)}
          note={b.facture.n ? `${euro(b.facture.ht)} HT${b.facture.reste > 0 ? ` · ${euro(b.facture.reste)} à régler` : " · tout est réglé"}` : "aucune facture sur la période"}
        />
      </div>
      <NoteHorsBudget {...horsBudget(dansPeriode)} className="-mt-1 px-1" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Carte
          titre="Budget par mois"
          sous={
            <>
              Montants HT, au mois du déménagement
              {mois.horsFenetre + mois.sansDate > 0 && (
                <>
                  {" "}
                  · {mois.horsFenetre + mois.sansDate} mobilité{mois.horsFenetre + mois.sansDate > 1 ? "s" : ""} hors de ces douze mois
                  {mois.sansDate ? ` (dont ${mois.sansDate} sans date)` : ""}
                </>
              )}
            </>
          }
        >
          <ColonnesMois serie={mois.serie} courant={courant} />
        </Carte>
        <Carte titre="Par formule" sous="Montants HT engagés, par niveau de prestation">
          <BarresSimples lignes={formules.map((f) => ({ label: f.label, valeur: f.ht, note: `${f.n} mobilité${f.n > 1 ? "s" : ""}` }))} />
          {b.engage.n > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-5">
              <div>
                <div className="text-[12px] text-ink-soft">Coût moyen HT</div>
                <div className="mt-1 text-[18px] font-bold">{euro(b.engage.ht / b.engage.n)}</div>
                <div className="text-[11.5px] text-ink-soft">par mobilité chiffrée</div>
              </div>
              <CoutM3 mobilites={dansPeriode} />
            </div>
          )}
        </Carte>
      </div>

      <Carte
        titre="Factures"
        sous={factures.length ? "Les factures émises par Bailly Déménagement pour vos mobilités" : undefined}
      >
        {facturesPeriode.length === 0 ? (
          <div className="flex items-center gap-3 rounded-[16px] bg-subtle px-4 py-4 text-[13.5px] text-ink-mid">
            <Picto nom="document" taille={18} className="shrink-0 text-ink-soft" />
            {factures.length === 0 ? "Aucune facture n'a encore été émise pour vos mobilités." : "Aucune facture émise sur cette période."}
          </div>
        ) : (
          <ListeFactures factures={facturesPeriode} apercu={apercu} onOuvrir={onOuvrir} />
        )}
      </Carte>

      {/* TEXTES À VALIDER — les définitions d'engagé, signé, facturé. */}
      <div className="grid gap-3 text-[12.5px] leading-relaxed text-ink-soft md:grid-cols-3">
        <p>
          <span className="font-semibold text-ink">Engagé :</span> estimations, devis envoyés et devis signés des mobilités en cours ou terminées, hors mobilités sans suite.
        </p>
        <p>
          <span className="font-semibold text-ink">Signé :</span> devis signés par vos collaborateurs. Le montant définitif est celui du devis signé ; une estimation ne vaut pas facture.
        </p>
        <p>
          <span className="font-semibold text-ink">Facturé :</span> factures émises par Bailly Déménagement, avoirs déduits. Le HT d&apos;une estimation sans devis est son TTC divisé par 1,2.
        </p>
      </div>
    </div>
  );
}

function CoutM3({ mobilites }: { mobilites: MobiliteRh[] }) {
  const avecVolume = mobilites.filter((m) => auBudget(m) && (m.volume_m3 ?? 0) > 0);
  const volume = avecVolume.reduce((s, m) => s + (m.volume_m3 ?? 0), 0);
  if (!volume) return <div />;
  const total = avecVolume.reduce((s, m) => s + m.montant!.ht, 0);
  return (
    <div>
      <div className="text-[12px] text-ink-soft">Coût moyen au m³</div>
      <div className="mt-1 text-[18px] font-bold">{euro(total / volume)}</div>
      <div className="text-[11.5px] text-ink-soft">HT, toutes distances confondues</div>
    </div>
  );
}

const STATUTS: Record<FactureRh["statut"], { label: string; classe: string }> = {
  payee: { label: "Réglée", classe: "bg-good-soft text-good" },
  emise: { label: "À régler", classe: "bg-subtle text-ink-mid" },
  retard: { label: "En retard", classe: "bg-danger-soft text-danger" },
  annulee: { label: "Annulée", classe: "border border-line-strong text-ink-soft" },
};
const GENRES: Record<FactureRh["genre"], string> = { facture: "Facture", solde: "Facture de solde", acompte: "Facture d'arrhes", avoir: "Avoir" };

const FACTURES_VISIBLES = 8;

function ListeFactures({ factures, apercu, onOuvrir }: { factures: FactureRh[]; apercu: string | null; onOuvrir: (id: string) => void }) {
  const [toutes, setToutes] = useState(false);
  const visibles = toutes ? factures : factures.slice(0, FACTURES_VISIBLES);
  const lienPdf = (f: FactureRh) => `/api/rh/factures/${f.id}/pdf${apercu ? `?apercu=${encodeURIComponent(apercu)}` : ""}`;
  return (
    <div className="-mx-5 sm:-mx-6">
      {/* Sur téléphone : une carte par facture. */}
      <ul className="divide-y divide-line border-t border-line md:hidden">
        {visibles.map((f) => {
          const s = STATUTS[f.statut];
          const signe = f.genre === "avoir" ? -1 : 1;
          return (
            <li key={f.id} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold tabular-nums">{f.numero}</div>
                  <div className="truncate text-[12px] text-ink-soft">
                    {f.collaborateur ?? GENRES[f.genre]} · {jourMoyen(f.emise_le)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[14px] font-bold tabular-nums">{euro(signe * Math.abs(f.ttc))}</div>
                  <div className="text-[11.5px] text-ink-soft">TTC</div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${s.classe}`}>{s.label}</span>
                {f.pdf && (
                  <a href={lienPdf(f)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[12px] font-semibold">
                    <Picto nom="telecharger" taille={13} /> PDF
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-line bg-subtle/60 text-[11px] uppercase tracking-[0.08em] text-ink-soft">
              <th className="px-5 py-2.5 font-semibold sm:px-6">Facture</th>
              <th className="px-3 py-2.5 font-semibold">Collaborateur</th>
              <th className="px-3 py-2.5 font-semibold">Émise le</th>
              <th className="px-3 py-2.5 font-semibold">Échéance</th>
              <th className="px-3 py-2.5 text-right font-semibold">HT</th>
              <th className="px-3 py-2.5 text-right font-semibold">TTC</th>
              <th className="px-3 py-2.5 font-semibold">Statut</th>
              <th className="px-5 py-2.5 text-right font-semibold sm:px-6">PDF</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const s = STATUTS[f.statut];
              const signe = f.genre === "avoir" ? -1 : 1;
              return (
                <tr key={f.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 sm:px-6">
                    <div className="font-semibold tabular-nums">{f.numero}</div>
                    <div className="max-w-[240px] truncate text-[12px] text-ink-soft">
                      {GENRES[f.genre]} · {f.objet}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {f.mobilite ? (
                      <button type="button" onClick={() => onOuvrir(f.mobilite!)} className="font-medium underline-offset-4 hover:underline">
                        {f.collaborateur ?? "—"}
                      </button>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{jourMoyen(f.emise_le)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{jourMoyen(f.echeance_le)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{f.ht != null ? euro(signe * Math.abs(f.ht)) : "—"}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{euro(signe * Math.abs(f.ttc))}</td>
                  <td className="px-3 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${s.classe}`}>{s.label}</span>
                  </td>
                  <td className="px-5 py-3 text-right sm:px-6">
                    {f.pdf ? (
                      <a href={lienPdf(f)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[12.5px] font-semibold transition hover:border-ink">
                        <Picto nom="telecharger" taille={14} /> PDF
                      </a>
                    ) : (
                      <span className="text-[12px] text-ink-soft" title="Le PDF de cette facture n'est pas disponible dans l'espace : demandez-le à votre interlocuteur Bailly.">
                        sur demande
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {factures.length > FACTURES_VISIBLES && (
        <div className="border-t border-line px-5 pt-4 sm:px-6">
          <button type="button" onClick={() => setToutes((t) => !t)} className="text-[13px] font-semibold text-ink underline-offset-4 hover:underline">
            {toutes ? "Afficher les plus récentes seulement" : `Afficher les ${factures.length} factures`}
          </button>
        </div>
      )}
    </div>
  );
}
