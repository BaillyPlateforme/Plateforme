import { listRequests } from "@/lib/requests";
import { listDevis } from "@/lib/devis";
import type { DevisRow, RequestRow } from "@/lib/types";
import { Aires, BarresEmpilees, BarresGroupees, Courbes, Popularite } from "./Charts";
import { TONS } from "./tons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tableau de bord — Bailly" };

const JOUR = 86_400_000;
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const eur = (n: number) =>
  n >= 1000 ? `${nf.format(Math.round(n / 100) / 10)} k€` : `${nf.format(n)} €`;
const moisCourt = new Intl.DateTimeFormat("fr-FR", { month: "short" });

const somme = (rs: RequestRow[], f: (r: RequestRow) => number | null) =>
  rs.reduce((s, r) => s + (f(r) ?? 0), 0);

const QUALIFIEES = ["qualified", "quoted", "won"];

/** Fenêtre d'observation : assez large pour couvrir un cycle de demandes. */
const FENETRE = 90;

async function preparer() {
  let requests: RequestRow[] = [];
  let devis: DevisRow[] = [];
  try {
    [requests, devis] = await Promise.all([listRequests(), listDevis()]);
  } catch {
    /* base indisponible : la page s'affiche à zéro plutôt que de planter */
  }

  const now = Date.now();
  const depuis = (n: number) => requests.filter((r) => +new Date(r.created_at) >= now - n * JOUR);
  const entre = (a: number, b: number) =>
    requests.filter((r) => {
      const t = +new Date(r.created_at);
      return t >= now - a * JOUR && t < now - b * JOUR;
    });

  const mois = depuis(FENETRE);
  const moisPrec = entre(FENETRE * 2, FENETRE);
  // Sans période précédente, une variation de « +100 % » ne veut rien dire.
  const delta = (a: number, b: number): number | null =>
    b === 0 ? null : Math.round(((a - b) / b) * 100);

  const clients = (rs: RequestRow[]) => new Set(rs.map((r) => r.client_email).filter(Boolean)).size;

  const tuiles = [
    {
      valeur: nf.format(mois.length),
      label: "Demandes reçues",
      delta: delta(mois.length, moisPrec.length),
      fond: "#ffe2e5",
      pastille: "#fa5a7d",
      icone: <IconInbox />,
    },
    {
      valeur: eur(somme(mois, (r) => r.estimation_prix)),
      label: "Estimations cumulées",
      delta: delta(somme(mois, (r) => r.estimation_prix), somme(moisPrec, (r) => r.estimation_prix)),
      fond: "#fff4de",
      pastille: "#ff947a",
      icone: <IconEuro />,
    },
    {
      valeur: `${nf.format(somme(mois, (r) => r.volume_m3))} m³`,
      label: "Volume à déménager",
      delta: delta(somme(mois, (r) => r.volume_m3), somme(moisPrec, (r) => r.volume_m3)),
      fond: "#dcfce7",
      pastille: "#3cd856",
      icone: <IconBox />,
    },
    {
      valeur: nf.format(clients(mois)),
      label: "Nouveaux clients",
      delta: delta(clients(mois), clients(moisPrec)),
      fond: "#f3e8ff",
      pastille: "#bf83ff",
      icone: <IconUser />,
    },
  ];

  // ── Flux des demandes, 12 derniers mois ──
  const moisSerie = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (11 - i), 1);
    return d;
  });
  const dansMois = (r: RequestRow, d: Date) => {
    const t = new Date(r.created_at);
    return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth();
  };
  const fluxLabels = moisSerie.map((d) => moisCourt.format(d).replace(".", ""));
  const flux = [
    {
      label: "Reçues",
      color: TONS.violet,
      data: moisSerie.map((d) => requests.filter((r) => dansMois(r, d)).length),
    },
    {
      label: "Qualifiées",
      color: TONS.vert,
      data: moisSerie.map(
        (d) => requests.filter((r) => dansMois(r, d) && QUALIFIEES.includes(r.status)).length,
      ),
    },
    {
      label: "Devisées",
      color: TONS.rouge,
      data: moisSerie.map(
        (d) => requests.filter((r) => dansMois(r, d) && ["quoted", "won"].includes(r.status)).length,
      ),
    },
  ];

  // ── Estimations par jour de la semaine, par origine ──
  const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const indexJour = (r: RequestRow) => (new Date(r.created_at).getDay() + 6) % 7;
  const parJour = (source: RequestRow["source"]) =>
    JOURS.map((_, i) =>
      Math.round(
        somme(
          requests.filter((r) => r.source === source && indexJour(r) === i),
          (r) => r.estimation_prix,
        ),
      ),
    );
  const revenus = [
    { label: "Formulaire", color: TONS.bleu, data: parJour("form") },
    { label: "E-mail", color: TONS.vert, data: parJour("email") },
  ];

  // ── Rythme hebdomadaire sur la fenêtre : reçues contre qualifiées ──
  const SEMAINES = 12;
  const semaine = (i: number) => entre((SEMAINES - i) * 7, (SEMAINES - i - 1) * 7);
  const semaines = [
    {
      label: "Reçues",
      color: TONS.bleu,
      data: Array.from({ length: SEMAINES }, (_, i) => semaine(i).length),
    },
    {
      label: "Qualifiées",
      color: TONS.vert,
      data: Array.from({ length: SEMAINES }, (_, i) =>
        semaine(i).filter((r) => QUALIFIEES.includes(r.status)).length,
      ),
    },
  ];
  const totalRecues = semaines[0].data.reduce((a, b) => a + b, 0);
  const totalQualifiees = semaines[1].data.reduce((a, b) => a + b, 0);

  // ── Reçues vs qualifiées, 7 derniers mois ──
  const sept = moisSerie.slice(-7);
  const objectif = [
    {
      label: "Qualifiées",
      color: TONS.sapin,
      data: sept.map(
        (d) => requests.filter((r) => dansMois(r, d) && QUALIFIEES.includes(r.status)).length,
      ),
    },
    {
      label: "Reçues",
      color: TONS.jaune,
      data: sept.map((d) => requests.filter((r) => dansMois(r, d)).length),
    },
  ];

  // ── Top villes de départ ──
  const villes = Object.entries(
    requests.reduce<Record<string, number>>((acc, r) => {
      const v = (r.depart_ville ?? "").trim();
      if (v) acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const villeMax = villes[0]?.[1] ?? 1;
  const tons = [TONS.bleu, TONS.vert, TONS.violet, "#f59e0b", TONS.rouge];

  // ── Départements ──
  const deps = Object.entries(
    requests.reduce<Record<string, number>>((acc, r) => {
      const cp = (r.depart_code_postal ?? "").trim();
      if (cp.length >= 2) {
        const d = cp.slice(0, 2);
        acc[d] = (acc[d] ?? 0) + 1;
      }
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const depMax = deps[0]?.[1] ?? 1;

  // ── Volume traité, 6 derniers mois ──
  const six = moisSerie.slice(-6);
  const volQualifie = six.map((d) =>
    Math.round(somme(requests.filter((r) => dansMois(r, d) && QUALIFIEES.includes(r.status)), (r) => r.volume_m3)),
  );
  const volAttente = six.map((d) =>
    Math.round(somme(requests.filter((r) => dansMois(r, d) && !QUALIFIEES.includes(r.status)), (r) => r.volume_m3)),
  );

  return {
    requests, devis, tuiles, fluxLabels, flux, JOURS, revenus, semaines, SEMAINES,
    totalRecues, totalQualifiees, sept, objectif, villes, villeMax, tons, deps, depMax,
    six, volQualifie, volAttente,
  };
}

export default async function TableauDeBordPage() {
  const {
    requests, devis, tuiles, fluxLabels, flux, JOURS, revenus, semaines, SEMAINES,
    totalRecues, totalQualifiees, sept, objectif, villes, villeMax, tons, deps, depMax,
    six, volQualifie, volAttente,
  } = await preparer();

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-center justify-end gap-4">
        <span className="rounded-full border border-line bg-card px-3.5 py-1.5 text-xs text-ink-soft">
          {FENETRE} derniers jours · {nf.format(requests.length)} demandes suivies · {devis.length} devis
        </span>
      </header>

      <div className="grid grid-cols-12 gap-5">
        {/* ── Activité du mois ── */}
        <Carte className="col-span-12 xl:col-span-7">
          <EnTete titre="Activité récente" sous={`Résumé sur ${FENETRE} jours`} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {tuiles.map((t) => (
              <div key={t.label} className="rounded-2xl p-4" style={{ background: t.fond }}>
                <span
                  className="mb-3 flex h-9 w-9 items-center justify-center rounded-full text-white"
                  style={{ background: t.pastille }}
                >
                  {t.icone}
                </span>
                <div className="font-serif text-[26px] leading-none tnum">{t.valeur}</div>
                <div className="mt-1.5 text-[13px] text-ink/70">{t.label}</div>
                <div className="mt-1 text-[11.5px] font-medium" style={{ color: t.pastille }}>
                  {t.delta === null
                    ? `sur ${FENETRE} jours`
                    : `${t.delta >= 0 ? "+" : ""}${t.delta} % vs ${FENETRE} j préc.`}
                </div>
              </div>
            ))}
          </div>
        </Carte>

        {/* ── Flux des demandes ── */}
        <Carte className="col-span-12 xl:col-span-5">
          <EnTete titre="Flux des demandes" sous="Sur douze mois" />
          <Courbes labels={fluxLabels} series={flux} />
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
            <Total couleur={TONS.bleu} label="Reçues" valeur={`${totalRecues}`} />
            <span className="h-8 w-px bg-line" />
            <Total couleur={TONS.vert} label="Qualifiées" valeur={`${totalQualifiees}`} />
          </div>
        </Carte>

        {/* ── Reçues vs qualifiées ── */}
        <Carte className="col-span-12 xl:col-span-4">
          <EnTete titre="Reçues vs qualifiées" sous="Sept derniers mois" />
          <BarresGroupees labels={sept.map((d) => moisCourt.format(d).replace(".", ""))} series={objectif} />
          <div className="mt-3 space-y-2">
            <LigneTotal
              couleur={TONS.sapin}
              titre="Qualifiées"
              sous="complètes et chiffrées"
              valeur={nf.format(objectif[0].data.reduce((a, b) => a + b, 0))}
            />
            <LigneTotal
              couleur={TONS.jaune}
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
                        className="rounded-lg px-2 py-1 text-[11.5px] font-medium tnum"
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
            labels={six.map((d) => moisCourt.format(d).replace(".", ""))}
            bas={{ label: "Qualifié", color: TONS.bleu, data: volQualifie }}
            haut={{ label: "En attente", color: TONS.vert, data: volAttente }}
          />
          <div className="mt-3 flex items-center justify-center gap-6 border-t border-line pt-3">
            <Total
              couleur={TONS.bleu}
              label="Qualifié"
              valeur={`${nf.format(volQualifie.reduce((a, b) => a + b, 0))} m³`}
            />
            <span className="h-8 w-px bg-line" />
            <Total
              couleur={TONS.vert}
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
        className="flex h-8 w-8 items-center justify-center rounded-lg"
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
