"use client";

import Link from "next/link";
import { useRessource } from "@/lib/donnees";
import { Echec, Squelette } from "@/components/Squelette";
import { Aires, BarresEmpilees, BarresGroupees, Courbes, Popularite } from "./Charts";
import { TONS } from "./tons";
import type { preparerTableauDeBord } from "@/lib/tableau-de-bord";

type Donnees = Awaited<ReturnType<typeof preparerTableauDeBord>>;

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const FENETRE = 90;

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

function Contenu({ d }: { d: Donnees }) {
  const {
    requests, devis, tuiles, fluxLabels, flux, JOURS, revenus, semaines, SEMAINES,
    totalRecues, totalQualifiees, objectif, villes, villeMax, tons, deps, depMax,
    volQualifie, volAttente, septLabels, sixLabels,
  } = d;

  const suivi = [
    { label: "Demandes qualifiées", part: pct(totalQualifiees, totalRecues), ton: TONS.foret },
    { label: "Demandes devisées", part: pct(devis.length, requests.length), ton: TONS.abricot },
    {
      label: "Volume déjà chiffré",
      part: pct(
        volQualifie.reduce((a, b) => a + b, 0),
        volQualifie.reduce((a, b) => a + b, 0) + volAttente.reduce((a, b) => a + b, 0),
      ),
      ton: TONS.mousse,
    },
    { label: "Part du formulaire dans les estimations", part: pct(revenus[0].data.reduce((a, b) => a + b, 0), revenus.reduce((t, s) => t + s.data.reduce((a, b) => a + b, 0), 0)), ton: TONS.ardoise },
  ];

  return (
    <div className="px-5 py-5 md:px-7 md:py-6">
      <Banniere demandes={requests.length} devis={devis.length} />

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tuiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                style={{ background: t.pastille }}
              >
                {ICONES[t.icone]}
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{ background: t.fond, color: t.pastille }}
              >
                {t.delta === null ? `${FENETRE} j` : `${t.delta >= 0 ? "+" : ""}${t.delta} %`}
              </span>
            </div>
            <div className="mt-5 text-[13px] text-ink-soft">{t.label}</div>
            <div className="mt-1 font-serif text-[27px] leading-none tnum">{t.valeur}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-12 gap-4">
        {/* ── Flux des demandes ── */}
        <Carte className="col-span-12 xl:col-span-8">
          <EnTete titre="Flux des demandes" sous="Sur douze mois" />
          <Courbes labels={fluxLabels} series={flux} />
        </Carte>

        {/* ── Ce qui avance, en jauges — le panneau de droite de la maquette ── */}
        <Carte className="col-span-12 xl:col-span-4">
          <EnTete titre="Où en est le flux" sous={`Sur ${FENETRE} jours`} />
          <div className="flex items-baseline gap-2.5">
            <span className="font-serif text-[34px] leading-none tnum">{totalQualifiees}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-2 py-1 text-[11px] font-medium text-good">
              <IconFleche />
              {pct(totalQualifiees, totalRecues)} %
            </span>
          </div>
          <p className="mt-1.5 text-[12.5px] text-ink-soft">
            demandes qualifiées sur {totalRecues} reçues
          </p>
          <div className="mt-6 space-y-4">
            {suivi.map((j) => (
              <Jauge key={j.label} label={j.label} part={j.part} ton={j.ton} />
            ))}
          </div>
        </Carte>

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
 * La bannière de la maquette : un bandeau en dégradé, une phrase, un bouton,
 * et un dessin à droite.
 */
function Banniere({ demandes, devis }: { demandes: number; devis: number }) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-linear-to-r from-[#c9a46c] via-[#7fa267] to-accent px-6 py-6 text-white md:px-8">
      <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[12px] text-white/80">
            {FENETRE} derniers jours · {nf.format(demandes)} demandes suivies · {devis} devis
          </p>
          <h2 className="font-serif mt-2 max-w-[34ch] text-[22px] leading-snug md:text-[25px]">
            L&apos;activité de l&apos;agence, du formulaire client au camion chargé
          </h2>
          <Link
            href="/dashboard?statut=new"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[13px] font-medium text-ink transition hover:bg-white/90"
          >
            Ouvrir la file d&apos;attente
          </Link>
        </div>
        <Camion />
      </div>
    </section>
  );
}

/** Dessin décoratif du bandeau : des caisses et un camion, au trait. */
function Camion() {
  return (
    <svg
      width="190"
      height="120"
      viewBox="0 0 190 120"
      fill="none"
      className="hidden shrink-0 text-white/85 md:block"
      aria-hidden
    >
      <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M14 96V58l24-12 24 12v38" fill="rgba(255,255,255,0.12)" />
        <path d="M14 58l24 12 24-12M38 70v26" />
        <path d="M70 96V72l20-10 20 10v24" fill="rgba(255,255,255,0.18)" />
        <path d="M70 72l20 10 20-10M90 82v14" />
        <path d="M118 96V64h32v32z" fill="rgba(255,255,255,0.1)" />
        <path d="M150 74h14l10 11v11h-24z" fill="rgba(255,255,255,0.16)" />
        <circle cx="130" cy="100" r="6" fill="rgba(255,255,255,0.2)" />
        <circle cx="163" cy="100" r="6" fill="rgba(255,255,255,0.2)" />
        <path d="M8 100h110M172 100h10" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Une jauge du panneau de droite : libellé, barre, valeur. */
function Jauge({ label, part, ton }: { label: string; part: number; ton: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="text-ink-soft">{label}</span>
        <span className="font-medium tnum">{part} %</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${part}%`, background: ton }}
        />
      </div>
    </div>
  );
}

function IconFleche() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Carte({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-5 ${className}`}>{children}</section>
  );
}

function EnTete({ titre, sous }: { titre: string; sous?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-serif text-[19px] leading-tight">{titre}</h2>
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
