"use client";

import { useMemo } from "react";
import type { CleEtapeRh, FactureRh, MobiliteRh } from "@/lib/rh-modele";
import { Carte, NoteHorsBudget, PastilleEtape, Tuile, Vide } from "../_ui/briques";
import { BarresEtapes } from "../_ui/graphiques";
import { Picto, type NomPicto } from "../_ui/Icones";
import { aVenir, alertes, budget, cleMois, horsBudget, parEtape, dansJours, enCours, euro, joursAvant, moisLong, quand, trajet, versDate, type Alerte } from "../calculs";

/*
 * Le tableau de bord : l'état d'aujourd'hui, sans filtre de période — une
 * mobilité en cours reste en cours, qu'elle ait été demandée il y a un mois ou
 * un an.
 */
export default function VueAccueil({
  mobilites,
  factures,
  couts,
  maintenant,
  onOuvrir,
  onEtape,
  onVers,
}: {
  mobilites: MobiliteRh[];
  factures: FactureRh[];
  couts: boolean;
  maintenant: number;
  onOuvrir: (id: string) => void;
  onEtape: (cle: CleEtapeRh) => void;
  onVers: (vue: "collaborateurs" | "budget" | "lien") => void;
}) {
  const ouvertes = mobilites.filter(enCours);
  const b = useMemo(() => budget(mobilites, factures), [mobilites, factures]);
  const lesAlertes = useMemo(() => alertes(mobilites, factures, maintenant), [mobilites, factures, maintenant]);
  const venir = useMemo(() => aVenir(mobilites, maintenant), [mobilites, maintenant]);
  const etapes = useMemo(() => parEtape(mobilites), [mobilites]);
  const ceMois = cleMois(maintenant);
  const duMois = venir.ceMois;
  const signees = ouvertes.filter((m) => m.etape === "signe" || m.etape === "planifie").length;

  if (mobilites.length === 0)
    return (
      <Vide
        picto="personnes"
        titre="Aucune mobilité pour l'instant"
        texte="Transmettez le lien de votre espace à vos collaborateurs : chaque demande apparaîtra ici dès qu'elle est envoyée, puis chaque étape jusqu'au déménagement."
        action={
          <button type="button" onClick={() => onVers("lien")} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#1b1a18] px-5 text-[13.5px] font-semibold text-white">
            <Picto nom="lien" taille={16} /> Voir le lien des salariés
          </button>
        }
      />
    );

  const prochain = [...venir.ceMois, ...venir.ensuite].find((m) => (m.date ? joursAvant(m.date, maintenant) >= 0 : true));

  return (
    <div className="space-y-5">
      {/* ── Les chiffres du jour ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Tuile
          nuit
          picto="personnes"
          label="Mobilités en cours"
          valeur={ouvertes.length}
          note={!ouvertes.length ? "aucune en ce moment" : signees ? `dont ${signees} signée${signees > 1 ? "s" : ""} ou planifiée${signees > 1 ? "s" : ""}` : "aucune signée pour l'instant"}
        />
        <Tuile
          picto="calendrier"
          label={`Déménagements en ${moisLong(ceMois).split(" ")[0]}`}
          valeur={duMois.length}
          note={prochain ? `Prochain : ${prochain.nom.split(" ")[0]}, ${quand(prochain).toLowerCase()}` : "aucun de prévu"}
        />
        {couts ? (
          <>
            <Tuile picto="euro" label="Budget engagé HT" valeur={euro(b.engage.ht)} note={!b.engage.n ? "rien n'est encore chiffré" : `${euro(b.engage.ttc)} TTC · ${b.signe.ht ? `dont ${euro(b.signe.ht)} signés` : "rien de signé pour l'instant"}`} />
            <Tuile
              picto="document"
              label="Facturé TTC"
              valeur={euro(b.facture.ttc)}
              note={b.facture.n ? (b.facture.reste > 0 ? `${euro(b.facture.reste)} restent à régler` : `${b.facture.n} facture${b.facture.n > 1 ? "s" : ""}, toutes réglées`) : "aucune facture émise"}
            />
          </>
        ) : (
          <>
            <Tuile picto="check" label="Mobilités terminées" valeur={mobilites.filter((m) => m.etape === "termine").length} note="depuis l'ouverture de l'espace" />
            <Tuile picto="route" label="Demandes reçues" valeur={mobilites.length} note="toutes étapes confondues" />
          </>
        )}
      </div>

      {/* ── Où en sont les mobilités · À surveiller ── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Carte titre="Où en sont les mobilités" sous="Les mobilités en cours, étape par étape — touchez une étape pour en voir la liste">
          {ouvertes.length ? <BarresEtapes lignes={etapes} onChoisir={onEtape} /> : <p className="text-[13.5px] text-ink-soft">Aucune mobilité en cours : toutes sont terminées ou sans suite.</p>}
        </Carte>
        <Carte titre="À surveiller" sous={lesAlertes.length ? `${lesAlertes.length} point${lesAlertes.length > 1 ? "s" : ""} à suivre` : "Rien ne demande votre attention"}>
          {lesAlertes.length ? (
            <ul className="-my-1 divide-y divide-line">
              {lesAlertes.slice(0, 5).map((a) => (
                <LigneAlerte key={a.id} a={a} onOuvrir={onOuvrir} />
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-3 rounded-[16px] bg-subtle px-4 py-4 text-[13.5px] text-ink-mid">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-good-soft text-good">
                <Picto nom="check" taille={16} trait={2.4} />
              </span>
              Pas de déménagement dans les sept prochains jours, ni de devis en attente.
            </div>
          )}
        </Carte>
      </div>

      {/* ── À venir · Budget ── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Carte
          titre="Déménagements"
          sous="Ceux du mois, puis les suivants"
          action={
            <button type="button" onClick={() => onVers("collaborateurs")} className="text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              Tous les collaborateurs →
            </button>
          }
        >
          {venir.ceMois.length + venir.ensuite.length === 0 ? (
            <p className="text-[13.5px] text-ink-soft">Aucun déménagement daté à venir.</p>
          ) : (
            <div className="space-y-4">
              <Groupe titre={`En ${moisLong(ceMois).split(" ")[0]}`} liste={venir.ceMois} vide="Aucun déménagement ce mois-ci." maintenant={maintenant} onOuvrir={onOuvrir} />
              {venir.ensuite.length > 0 && <Groupe titre="Ensuite" liste={venir.ensuite.slice(0, 4)} maintenant={maintenant} onOuvrir={onOuvrir} />}
            </div>
          )}
        </Carte>

        {couts ? (
          <Carte
            titre="Budget"
            sous="Montants HT de vos mobilités, hors sans suite"
            action={
              <button type="button" onClick={() => onVers("budget")} className="text-[12.5px] font-semibold text-ink-soft hover:text-ink">
                Détail →
              </button>
            }
          >
            <EntonnoirBudget b={b} />
            <NoteHorsBudget {...horsBudget(mobilites)} className="mt-5 border-t border-line pt-4" />
          </Carte>
        ) : (
          <Carte titre="Dernières demandes" sous="Les plus récentes">
            <ul className="-my-1 divide-y divide-line">
              {mobilites.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => onOuvrir(m.id)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:text-brand-ink">
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold">{m.nom}</span>
                      <span className="block truncate text-[12px] text-ink-soft">{trajet(m)}</span>
                    </span>
                    <PastilleEtape etape={m.etape} />
                  </button>
                </li>
              ))}
            </ul>
          </Carte>
        )}
      </div>
    </div>
  );
}

const TONS: Record<Alerte["ton"], { picto: NomPicto; classe: string; label: string }> = {
  urgent: { picto: "alerte", classe: "bg-danger-soft text-danger", label: "Prochainement" },
  attention: { picto: "horloge", classe: "bg-warn-soft text-warn", label: "En attente" },
  info: { picto: "info", classe: "bg-subtle text-ink-mid", label: "Information" },
};

function LigneAlerte({ a, onOuvrir }: { a: Alerte; onOuvrir: (id: string) => void }) {
  const t = TONS[a.ton];
  return (
    <li>
      <button
        type="button"
        disabled={!a.mobilite}
        onClick={() => a.mobilite && onOuvrir(a.mobilite)}
        className="flex w-full items-start gap-3 py-3 text-left transition enabled:hover:opacity-80"
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${t.classe}`} title={t.label}>
          <Picto nom={t.picto} taille={16} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold first-letter:uppercase">{a.titre}</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-soft">{a.texte}</span>
        </span>
      </button>
    </li>
  );
}

function Groupe({ titre, liste, vide, maintenant, onOuvrir }: { titre: string; liste: MobiliteRh[]; vide?: string; maintenant: number; onOuvrir: (id: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">{titre}</p>
      {liste.length === 0 ? (
        <p className="rounded-[14px] bg-subtle px-4 py-3 text-[13px] text-ink-soft">{vide}</p>
      ) : (
        <ul className="space-y-2">
          {liste.map((m) => {
            const d = m.date ? versDate(m.date) : null;
            const j = m.date ? joursAvant(m.date, maintenant) : null;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  data-mobilite={m.id}
                  onClick={() => onOuvrir(m.id)}
                  className="flex w-full items-center gap-3.5 rounded-[16px] border border-line px-3 py-2.5 text-left transition hover:border-ink"
                >
                  <span
                    className={`flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-[13px] ${j != null && j < 0 ? "bg-subtle text-ink-mid [&>span:last-child]:text-ink-soft" : "bg-[#1b1a18] text-white"}`}
                  >
                    {d ? (
                      <>
                        <span className="text-[19px] font-bold leading-none">{d.getDate()}</span>
                        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-clair">{d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</span>
                      </>
                    ) : (
                      <span className="px-1 text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.06em] text-brand-clair">{m.mois ? moisLong(m.mois).split(" ")[0].slice(0, 4) : "?"}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{m.nom}</span>
                    <span className="block truncate text-[12.5px] text-ink-soft">
                      {trajet(m)}
                      {j != null ? ` · ${dansJours(j)}` : m.mois ? ` · ${moisLong(m.mois)}` : ""}
                      {m.date && !m.date_fixee ? " (souhaitée)" : ""}
                    </span>
                  </span>
                  <span className="hidden sm:block">
                    <PastilleEtape etape={m.etape} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Engagé → signé → facturé : une seule mesure à trois moments, donc une seule couleur. */
function EntonnoirBudget({ b }: { b: ReturnType<typeof budget> }) {
  const lignes = [
    { label: "Engagé", aide: "Estimations, devis envoyés et devis signés", ht: b.engage.ht, ttc: b.engage.ttc, n: `${b.engage.n} mobilité${b.engage.n > 1 ? "s" : ""}` },
    { label: "Signé", aide: "Devis signés ou acceptés", ht: b.signe.ht, ttc: b.signe.ttc, n: `${b.signe.n} mobilité${b.signe.n > 1 ? "s" : ""}` },
    { label: "Facturé", aide: "Factures émises, avoirs déduits", ht: b.facture.ht, ttc: b.facture.ttc, n: `${b.facture.n} facture${b.facture.n > 1 ? "s" : ""}` },
  ];
  const max = Math.max(1, ...lignes.map((l) => l.ht));
  return (
    <ul className="space-y-5">
      {lignes.map((l) => (
        <li key={l.label} title={l.aide}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13.5px] font-semibold">
              {l.label} <span className="font-normal text-ink-soft">· {l.n}</span>
            </span>
            <span className="text-right">
              <span className="text-[15px] font-bold tabular-nums">{euro(l.ht)}</span>
              <span className="ml-1.5 text-[12px] text-ink-soft tabular-nums">{euro(l.ttc)} TTC</span>
            </span>
          </div>
          <div className="relative mt-2 h-[14px]">
            <span className="absolute inset-y-0 my-auto h-px w-full bg-line" />
            {l.ht > 0 && <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-brand" style={{ width: `${Math.max(2, (l.ht / max) * 100)}%` }} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
