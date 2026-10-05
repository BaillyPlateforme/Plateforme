"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Icone, type NomIcone } from "@/app/demande/ui";
import { quitterEspaceRh } from "@/lib/actions/rh";
import { themeEspace } from "@/lib/espaces";
import { FORMULES_RH, STATUTS_RH, demandesExemple, type DemandeRh, type DonneesRh } from "@/lib/rh-modele";
import type { RequestStatus } from "@/lib/types";

/*
 * L'espace RH : le pendant de l'espace équipe, pour les ressources humaines
 * d'une entreprise cliente. Une seule adresse pour toutes les entreprises ;
 * c'est le compte qui dit laquelle, et l'écran en prend la couleur et le logo.
 *
 * Tout y est en lecture : les RH suivent, ils ne règlent rien.
 */

type Vue = "accueil" | "demandes" | "budget" | "lien";
type Periode = "3" | "12" | "tout";
type Choix = { id: string; nom: string; couleur: string; logo: string | null };

const VUES: { cle: Vue; label: string; icone: NomIcone }[] = [
  { cle: "accueil", label: "Tableau de bord", icone: "maison" },
  { cle: "demandes", label: "Demandes", icone: "liste" },
  { cle: "budget", label: "Budget", icone: "euro" },
  { cle: "lien", label: "Lien salariés", icone: "cle" },
];

const euro = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const jour = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";
const EN_COURS: RequestStatus[] = ["new", "analyzing", "qualified", "quoted"];
const TONS: Record<string, string> = {
  attente: "bg-subtle text-ink-mid",
  cours: "bg-brand-soft text-brand-ink",
  fait: "bg-good-soft text-good",
  clos: "bg-subtle text-ink-soft",
};

export default function PortailRh({ apercu }: { apercu: string | null }) {
  const [donnees, setDonnees] = useState<DonneesRh | null>(null);
  const [choix, setChoix] = useState<Choix[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [vue, setVue] = useState<Vue>("accueil");
  const [periode, setPeriode] = useState<Periode>("12");
  const [exemple, setExemple] = useState(true);
  const [ouverte, setOuverte] = useState<DemandeRh | null>(null);

  useEffect(() => {
    let annule = false;
    fetch(`/api/rh/donnees${apercu ? `?apercu=${encodeURIComponent(apercu)}` : ""}`)
      .then(async (r) => {
        const j = await r.json();
        if (annule) return;
        if (!r.ok) return setErreur(j?.error ?? "Lecture impossible");
        // La page reste la même quand l'équipe passe du choix à un espace :
        // l'un chasse l'autre, sinon la liste resterait affichée.
        setChoix(j.choix ?? null);
        setDonnees(j.choix ? null : j);
      })
      .catch(() => !annule && setErreur("Connexion impossible. Réessayez dans un instant."));
    return () => {
      annule = true;
    };
  }, [apercu]);

  // L'équipe qui ouvre l'espace d'un client sans aucune demande y voit un jeu
  // d'exemple — annoncé comme tel. Un compte RH ne voit jamais que le réel.
  const maintenant = donnees?.maintenant ?? 0;
  const fictif = !!donnees && donnees.apercu && donnees.demandes.length === 0 && exemple;
  const toutes = useMemo(
    () => (!donnees ? [] : fictif ? demandesExemple(donnees.espace.nom, donnees.espace.couts, maintenant) : donnees.demandes),
    [donnees, fictif, maintenant],
  );
  const demandes = useMemo(() => {
    if (periode === "tout") return toutes;
    const seuil = maintenant - Number(periode) * 30.4 * 86_400_000;
    return toutes.filter((d) => new Date(d.cree_le).getTime() >= seuil);
  }, [toutes, periode, maintenant]);

  if (erreur) return <Message titre="Espace indisponible" texte={erreur} />;
  if (choix) return <ChoixEspace choix={choix} />;
  if (!donnees) return <Message titre="Chargement de votre espace…" attente />;

  const { espace } = donnees;
  const theme = (themeEspace(espace.couleur) ?? {}) as CSSProperties;

  return (
    <div className="min-h-dvh bg-paper text-ink lg:grid lg:grid-cols-[264px_minmax(0,1fr)]" style={theme}>
      {/* ── Le menu ── */}
      <aside className="flex flex-col border-b border-line bg-card px-5 py-5 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3">
          {espace.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo de l'entreprise, servi par notre API
            <img src={espace.logo} alt={espace.nom} className="h-9 max-w-[112px] object-contain" />
          ) : (
            <span className="rounded-[10px] bg-brand px-2.5 py-1.5 text-[13px] font-bold text-sur-brand">{espace.nom}</span>
          )}
          <span className="h-6 w-px bg-line-strong" />
          <Image src="/marque/bailly-logo.svg" alt="Bailly Déménagement" width={200} height={64} className="h-auto w-[84px]" />
        </div>
        <p className="eyebrow mt-5 text-brand-ink">Espace RH</p>
        <p className="mt-1 text-[13px] leading-snug text-ink-soft">Les déménagements de vos collaborateurs, suivis en un coup d&apos;œil.</p>

        <nav className="mt-5 flex gap-1.5 overflow-x-auto lg:mt-7 lg:flex-col lg:overflow-visible">
          {VUES.map((v) => (
            <button
              key={v.cle}
              onClick={() => setVue(v.cle)}
              className={`flex shrink-0 items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-left text-[14px] font-medium transition ${
                vue === v.cle ? "bg-brand text-sur-brand" : "text-ink-mid hover:bg-subtle hover:text-ink"
              }`}
            >
              <Icone nom={v.icone} taille={17} />
              {v.label}
              {v.cle === "demandes" && (
                <span className={`ml-auto rounded-full px-2 text-[11.5px] font-semibold tabular-nums ${vue === v.cle ? "bg-[#1b1a18] text-brand-clair" : "bg-subtle text-ink-mid"}`}>
                  {demandes.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-5 hidden rounded-[18px] border border-line bg-paper p-4 lg:mt-auto lg:block">
          <div className="text-[12px] text-ink-soft">{donnees.apercu ? "Aperçu de l'équipe Bailly" : "Connecté"}</div>
          <div className="mt-0.5 truncate text-[13.5px] font-semibold">{donnees.compte?.nom || donnees.compte?.email || espace.nom}</div>
          {donnees.apercu ? (
            <div className="mt-3 grid gap-1.5 text-[12.5px] font-medium">
              <Link href="/rh" className="inline-flex items-center gap-1.5 text-brand-ink hover:text-ink">
                <Icone nom="immeuble" taille={12} /> Changer d&apos;entreprise
              </Link>
              <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-ink-soft hover:text-ink">
                <Icone nom="gauche" taille={12} trait={2.4} /> Retour à l&apos;espace équipe
              </Link>
            </div>
          ) : (
            <form action={quitterEspaceRh}>
              <button type="submit" className="mt-3 text-[12.5px] font-medium text-ink-soft transition hover:text-ink">
                Se déconnecter
              </button>
            </form>
          )}
        </div>
      </aside>

      {/* ── Le contenu ── */}
      <main className="min-w-0 px-5 py-6 md:px-9 md:py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-ink-soft">{espace.nom}</p>
            <h1 className="font-serif mt-1.5 text-[30px] leading-tight sm:text-[36px]">{VUES.find((v) => v.cle === vue)?.label}</h1>
          </div>
          {vue !== "lien" && (
            <div className="flex rounded-full border border-line bg-card p-1 text-[12.5px] font-medium">
              {([["3", "3 mois"], ["12", "12 mois"], ["tout", "Tout"]] as [Periode, string][]).map(([cle, label]) => (
                <button
                  key={cle}
                  onClick={() => setPeriode(cle)}
                  className={`rounded-full px-3.5 py-1.5 transition ${periode === cle ? "bg-ink text-shell" : "text-ink-mid hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </header>

        {donnees.apercu && donnees.demandes.length === 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-brand bg-brand-soft px-4 py-3 text-[13px]">
            <span>
              <span className="font-semibold">Aperçu équipe.</span>{" "}
              {exemple
                ? "Aucune demande réelle dans cet espace pour l'instant : ce que vous voyez est un jeu d'exemple, que les RH ne verront jamais."
                : "Voici l'espace tel que les RH le voient aujourd'hui : sans demande."}
            </span>
            <button onClick={() => setExemple((x) => !x)} className="shrink-0 font-semibold text-brand-ink underline-offset-4 hover:underline">
              {exemple ? "Voir l'espace vide" : "Afficher l'exemple"}
            </button>
          </div>
        )}

        <div className="mt-6">
          {vue === "accueil" && <Accueil demandes={demandes} couts={espace.couts} maintenant={maintenant} onOuvrir={setOuverte} onTout={() => setVue("demandes")} />}
          {vue === "demandes" && <Demandes demandes={demandes} couts={espace.couts} nom={espace.nom} onOuvrir={setOuverte} />}
          {vue === "budget" && <Budget demandes={demandes} couts={espace.couts} maintenant={maintenant} onOuvrir={setOuverte} />}
          {vue === "lien" && <Lien lien={espace.lien} nom={espace.nom} />}
        </div>
      </main>

      {ouverte && <Fiche d={ouverte} couts={espace.couts} onFermer={() => setOuverte(null)} />}
    </div>
  );
}

/* ─────────────────────────── Tableau de bord ─────────────────────────── */

function Accueil({
  demandes,
  couts,
  maintenant,
  onOuvrir,
  onTout,
}: {
  demandes: DemandeRh[];
  couts: boolean;
  maintenant: number;
  onOuvrir: (d: DemandeRh) => void;
  onTout: () => void;
}) {
  const s = useMemo(() => synthese(demandes), [demandes]);
  const mois = useMemo(() => parMois(demandes, maintenant), [demandes, maintenant]);
  if (demandes.length === 0) return <Vide />;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicateur icone="liste" label="Demandes" valeur={String(s.total)} note={`${s.enCours} en cours · ${s.confirmees} confirmée${s.confirmees > 1 ? "s" : ""}`} />
        <Indicateur icone="carton" label="Volume déménagé" valeur={`${Math.round(s.volume).toLocaleString("fr-FR")} m³`} note={`${s.volumeMoyen.toFixed(0)} m³ en moyenne`} />
        <Indicateur icone="route" label="Distance moyenne" valeur={`${Math.round(s.distanceMoyenne).toLocaleString("fr-FR")} km`} note={`${s.destinations.length} ville${s.destinations.length > 1 ? "s" : ""} d'arrivée`} />
        {couts ? (
          <Indicateur accent icone="euro" label="Budget estimé HT" valeur={euro(s.budget)} note={s.chiffrees ? `${euro(s.coutMoyen)} par déménagement` : "aucune demande chiffrée"} />
        ) : (
          <Indicateur icone="horloge" label="Délai moyen souhaité" valeur={s.delaiMoyen != null ? `${Math.round(s.delaiMoyen)} j` : "—"} note="entre la demande et la date visée" />
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Carte titre="Demandes par mois" sous="Les douze derniers mois">
          <Histogramme serie={mois.map((m) => ({ label: m.label, valeur: m.n }))} />
        </Carte>
        <Carte titre="Où en sont les demandes" sous="Répartition par étape">
          <Repartition demandes={demandes} />
        </Carte>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Carte titre="Villes d'arrivée" sous="Les plus demandées">
          <Classement lignes={s.destinations.slice(0, 6)} total={s.total} />
        </Carte>
        <Carte titre="Formules" sous="Le niveau de prestation retenu">
          <Classement lignes={s.formules} total={s.total} />
        </Carte>
        <Carte titre="Dernières demandes" sous="Les plus récentes" action={<button onClick={onTout} className="text-[12.5px] font-semibold text-brand-ink hover:text-ink">Tout voir →</button>}>
          <ul className="-my-1">
            {demandes.slice(0, 5).map((d) => (
              <li key={d.id}>
                <button onClick={() => onOuvrir(d)} className="flex w-full items-center justify-between gap-3 border-b border-line py-2.5 text-left last:border-0 hover:text-brand-ink">
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium">{d.nom}</span>
                    <span className="block truncate text-[12px] text-ink-soft">{d.depart ?? "?"} → {d.arrivee ?? "?"}</span>
                  </span>
                  <Statut statut={d.statut} />
                </button>
              </li>
            ))}
          </ul>
        </Carte>
      </div>
    </div>
  );
}

/* ─────────────────────────── Demandes ─────────────────────────── */

function Demandes({ demandes, couts, nom, onOuvrir }: { demandes: DemandeRh[]; couts: boolean; nom: string; onOuvrir: (d: DemandeRh) => void }) {
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "cours" | "fait" | "clos">("tous");
  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    return demandes.filter((d) => {
      const ton = STATUTS_RH[d.statut].ton;
      if (filtre === "cours" && !EN_COURS.includes(d.statut)) return false;
      if (filtre === "fait" && ton !== "fait") return false;
      if (filtre === "clos" && ton !== "clos") return false;
      return !t || [d.nom, d.depart, d.arrivee, d.devis_reference].some((x) => (x ?? "").toLowerCase().includes(t));
    });
  }, [demandes, q, filtre]);

  const exporter = () => {
    const entetes = ["Collaborateur", "Départ", "Arrivée", "Date souhaitée", "Volume (m³)", "Distance (km)", "Formule", "Étape", "Demandée le", ...(couts ? ["Coût estimé HT", "Coût estimé TTC"] : [])];
    const cellule = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const corps = lignes.map((d) =>
      [d.nom, d.depart, d.arrivee, d.date_souhaitee ?? d.periode, d.volume_m3, d.distance_km, d.formule ? (FORMULES_RH[d.formule] ?? d.formule) : "", STATUTS_RH[d.statut].label, d.cree_le.slice(0, 10), ...(couts ? [d.cout_ht, d.cout_ttc] : [])].map(cellule).join(";"),
    );
    // Le point-virgule et la marque d'encodage : c'est ce qu'Excel attend en France.
    const blob = new Blob(["﻿" + [entetes.map(cellule).join(";"), ...corps].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `demenagements-${nom.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un collaborateur, une ville…"
          className="min-w-[220px] flex-1 rounded-full border border-line bg-card px-4 py-2.5 text-[13.5px] outline-none transition focus:border-ink"
        />
        <div className="flex rounded-full border border-line bg-card p-1 text-[12.5px] font-medium">
          {([["tous", "Toutes"], ["cours", "En cours"], ["fait", "Confirmées"], ["clos", "Closes"]] as const).map(([cle, label]) => (
            <button key={cle} onClick={() => setFiltre(cle)} className={`rounded-full px-3 py-1.5 transition ${filtre === cle ? "bg-ink text-shell" : "text-ink-mid hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={exporter} disabled={lignes.length === 0} className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-[13px] font-semibold text-sur-brand transition active:scale-[0.98] disabled:opacity-40">
          <Icone nom="telecharger" taille={15} /> Exporter
        </button>
      </div>

      <div className="overflow-hidden rounded-[22px] border border-line bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                {["Collaborateur", "Trajet", "Date souhaitée", "Volume", "Formule", "Étape", ...(couts ? ["Coût estimé HT"] : [])].map((t, i) => (
                  <th key={t} className={`px-5 py-3 font-semibold ${i === 6 || i === 3 ? "text-right" : ""}`}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((d) => (
                <tr key={d.id} onClick={() => onOuvrir(d)} className="cursor-pointer border-b border-line transition last:border-0 hover:bg-brand-soft/60">
                  <td className="px-5 py-3.5">
                    <div className="font-medium">{d.nom}</div>
                    <div className="text-[12px] text-ink-soft">demandée le {jour(d.cree_le)}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    {d.depart ?? "?"} <span className="text-ink-soft">→</span> {d.arrivee ?? "?"}
                    {d.distance_km != null && <div className="text-[12px] text-ink-soft">{d.distance_km} km</div>}
                  </td>
                  <td className="px-5 py-3.5">{d.date_souhaitee ? jour(d.date_souhaitee) : (d.periode ?? "—")}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{d.volume_m3 != null ? `${d.volume_m3} m³` : "—"}</td>
                  <td className="px-5 py-3.5">{d.formule ? (FORMULES_RH[d.formule] ?? d.formule) : "—"}</td>
                  <td className="px-5 py-3.5"><Statut statut={d.statut} /></td>
                  {couts && <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{d.cout_ht != null ? euro(d.cout_ht) : <span className="font-normal text-ink-soft">en cours</span>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lignes.length === 0 && <p className="px-5 py-10 text-center text-[13.5px] text-ink-soft">Aucune demande ne correspond.</p>}
      </div>
    </div>
  );
}

/* ─────────────────────────── Budget ─────────────────────────── */

function Budget({ demandes, couts, maintenant, onOuvrir }: { demandes: DemandeRh[]; couts: boolean; maintenant: number; onOuvrir: (d: DemandeRh) => void }) {
  const s = useMemo(() => synthese(demandes), [demandes]);
  const mois = useMemo(() => parMois(demandes, maintenant), [demandes, maintenant]);
  if (!couts)
    return (
      <Carte titre="Coûts non communiqués" sous="Votre espace ne présente pas les montants">
        <p className="text-[14px] leading-relaxed text-ink-soft">Les estimations sont transmises par votre interlocuteur Bailly Déménagement. Contactez-le pour les recevoir ici.</p>
      </Carte>
    );
  if (s.chiffrees === 0) return <Vide texte="Aucune demande n'est encore chiffrée sur cette période." />;
  const chers = [...demandes].filter((d) => d.cout_ht != null).sort((a, b) => (b.cout_ht ?? 0) - (a.cout_ht ?? 0)).slice(0, 6);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicateur accent icone="euro" label="Budget estimé HT" valeur={euro(s.budget)} note={`${euro(s.budget * 1.2)} TTC`} />
        <Indicateur icone="check" label="Dont confirmé" valeur={euro(s.budgetConfirme)} note={`${s.confirmees} déménagement${s.confirmees > 1 ? "s" : ""}`} />
        <Indicateur icone="user" label="Coût moyen" valeur={euro(s.coutMoyen)} note="par déménagement chiffré" />
        <Indicateur icone="carton" label="Coût au m³" valeur={s.coutM3 ? `${Math.round(s.coutM3)} €` : "—"} note="toutes distances confondues" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Carte titre="Budget par mois" sous="Montants estimés, hors taxes, à la date de la demande">
          <Histogramme serie={mois.map((m) => ({ label: m.label, valeur: m.cout }))} format={euro} />
        </Carte>
        <Carte titre="Les déménagements les plus coûteux" sous="Sur la période">
          <ul className="-my-1">
            {chers.map((d) => (
              <li key={d.id}>
                <button onClick={() => onOuvrir(d)} className="flex w-full items-center justify-between gap-3 border-b border-line py-2.5 text-left last:border-0 hover:text-brand-ink">
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium">{d.nom}</span>
                    <span className="block truncate text-[12px] text-ink-soft">{d.depart} → {d.arrivee} · {d.volume_m3} m³</span>
                  </span>
                  <span className="shrink-0 text-[13.5px] font-semibold tabular-nums">{euro(d.cout_ht ?? 0)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Carte>
      </div>
      <p className="text-[12.5px] leading-relaxed text-ink-soft">
        Ces montants sont des estimations établies sur la grille tarifaire, à partir des informations transmises par vos collaborateurs. Ils ne valent pas facture : le montant définitif est celui du devis signé.
      </p>
    </div>
  );
}

/* ─────────────────────────── Lien salariés ─────────────────────────── */

function Lien({ lien, nom }: { lien: string | null; nom: string }) {
  const [copie, setCopie] = useState(false);
  if (!lien) return <Vide texte="Votre espace est en pause : son lien n'est pas disponible pour l'instant." />;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Carte titre="Le lien à transmettre" sous={`Réservé aux collaborateurs de ${nom}`}>
        <div className="flex flex-wrap items-center gap-2.5 rounded-[16px] border border-line bg-paper p-2 pl-4">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{lien.replace(/^https?:\/\//, "")}</span>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(lien);
              setCopie(true);
              setTimeout(() => setCopie(false), 1800);
            }}
            className="rounded-full bg-brand px-4 py-2 text-[13px] font-semibold text-sur-brand transition active:scale-[0.97]"
          >
            {copie ? "Copié ✓" : "Copier"}
          </button>
          <a href={lien} target="_blank" rel="noreferrer" className="rounded-full border border-line-strong px-4 py-2 text-[13px] font-semibold transition hover:border-ink">
            Ouvrir
          </a>
        </div>
        <p className="mt-4 text-[13.5px] leading-relaxed text-ink-soft">
          Glissez ce lien dans votre intranet ou dans le courrier de mobilité. Le collaborateur décrit son déménagement en quelques minutes ; sa demande apparaît ici dès qu&apos;elle est envoyée.
        </p>
      </Carte>
      <Carte titre="Comment ça se passe" sous="De la demande au jour J">
        <ol className="space-y-3.5">
          {[
            ["Le collaborateur remplit sa demande", "Avec le lien ci-contre, à son rythme."],
            ["Bailly étudie et chiffre", "Un conseiller dédié reprend le dossier."],
            ["Vous suivez l'avancement", "Chaque étape se lit ici, en temps réel."],
            ["Le déménagement est planifié", "Dates, équipes et camions sont réservés."],
          ].map(([titre, texte], i) => (
            <li key={titre} className="flex gap-3.5">
              <span className="font-serif flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-[14px] text-sur-brand">{i + 1}</span>
              <span>
                <span className="block text-[14px] font-semibold">{titre}</span>
                <span className="block text-[13px] text-ink-soft">{texte}</span>
              </span>
            </li>
          ))}
        </ol>
      </Carte>
    </div>
  );
}

/* ─────────────────────────── La fiche d'une demande ─────────────────────────── */

function Fiche({ d, couts, onFermer }: { d: DemandeRh; couts: boolean; onFermer: () => void }) {
  const rang = STATUTS_RH[d.statut].ordre;
  const clos = STATUTS_RH[d.statut].ton === "clos";
  const etapes: RequestStatus[] = ["new", "qualified", "quoted", "won"];
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Demande de ${d.nom}`}>
      <button aria-label="Fermer" onClick={onFermer} className="absolute inset-0 bg-[#1b1a18]/35" />
      <div className="animate-step-in relative flex h-full w-full max-w-[460px] flex-col overflow-y-auto bg-card shadow-[-30px_0_60px_-30px_rgba(27,26,24,0.5)]">
        <div className="bg-brand px-6 py-6 text-sur-brand">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-70">Demande du {jour(d.cree_le)}</p>
              <h2 className="font-serif mt-1.5 truncate text-[26px] leading-tight">{d.nom}</h2>
            </div>
            <button onClick={onFermer} aria-label="Fermer la fiche" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1b1a18] text-brand-clair">
              <Icone nom="croix" taille={15} trait={2.4} />
            </button>
          </div>
          <p className="mt-3 text-[15px] font-medium">{d.depart ?? "?"} → {d.arrivee ?? "?"}</p>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-soft">Avancement</span>
              <Statut statut={d.statut} />
            </div>
            <ol className="grid grid-cols-4 gap-2">
              {etapes.map((e) => {
                const fait = !clos && STATUTS_RH[e].ordre <= rang;
                return (
                  <li key={e}>
                    <div className={`h-1.5 rounded-full ${fait ? "bg-brand" : "bg-line-strong"}`} />
                    <div className={`mt-2 text-[11.5px] leading-tight ${fait ? "font-semibold text-ink" : "text-ink-soft"}`}>{STATUTS_RH[e].label}</div>
                  </li>
                );
              })}
            </ol>
          </div>

          {couts && (
            <div className="rounded-[18px] bg-[#1b1a18] px-5 py-4 text-white">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-clair">Coût estimé</div>
              {d.cout_ht != null ? (
                <>
                  <div className="font-serif mt-1 text-[32px] leading-none">{euro(d.cout_ht)} <span className="text-[14px] opacity-70">HT</span></div>
                  <div className="mt-1.5 text-[12.5px] opacity-75">
                    {d.cout_ttc != null ? `${euro(d.cout_ttc)} TTC` : ""}
                    {d.devis_reference ? ` · estimation ${d.devis_reference}` : ""}
                  </div>
                </>
              ) : (
                <div className="mt-1.5 text-[14px] opacity-80">En cours de chiffrage par nos équipes.</div>
              )}
            </div>
          )}

          <dl className="divide-y divide-line text-[13.5px]">
            {(
              [
                ["Départ", [d.depart, d.depart_cp].filter(Boolean).join(" · ") || "—"],
                ["Arrivée", [d.arrivee, d.arrivee_cp].filter(Boolean).join(" · ") || "—"],
                ["Distance", d.distance_km != null ? `${d.distance_km} km par la route` : "—"],
                ["Date souhaitée", d.date_souhaitee ? jour(d.date_souhaitee) : (d.periode ?? "—")],
                ["Volume déclaré", d.volume_m3 != null ? `${d.volume_m3} m³` : "—"],
                ["Formule", d.formule ? (FORMULES_RH[d.formule] ?? d.formule) : "—"],
                ...(d.devis_valide_jusqu ? [["Estimation valable jusqu'au", jour(d.devis_valide_jusqu)]] : []),
                ...(d.email ? [["E-mail", d.email]] : []),
                ...(d.tel ? [["Téléphone", d.tel]] : []),
              ] as [string, string][]
            ).map(([cle, valeur]) => (
              <div key={cle} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="shrink-0 text-ink-soft">{cle}</dt>
                <dd className="min-w-0 truncate text-right font-medium">{valeur}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[12px] leading-relaxed text-ink-soft">
            L&apos;adresse exacte, l&apos;inventaire et les photos du logement restent entre votre collaborateur et Bailly Déménagement.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Briques ─────────────────────────── */

function Carte({ titre, sous, action, children }: { titre: string; sous?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="bloc rounded-[22px] border border-line bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15.5px] font-semibold">{titre}</h2>
          {sous && <p className="mt-0.5 text-[12.5px] text-ink-soft">{sous}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Indicateur({ icone, label, valeur, note, accent = false }: { icone: NomIcone; label: string; valeur: string; note: string; accent?: boolean }) {
  return (
    <div className={`bloc rounded-[22px] border p-5 ${accent ? "border-transparent bg-brand text-sur-brand" : "border-line bg-card"}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[12.5px] font-medium ${accent ? "opacity-80" : "text-ink-soft"}`}>{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-[12px] ${accent ? "bg-[#1b1a18] text-brand-clair" : "bg-brand-soft text-brand-ink"}`}>
          <Icone nom={icone} taille={17} />
        </span>
      </div>
      <div className="font-serif mt-3 text-[32px] leading-none tabular-nums">{valeur}</div>
      <div className={`mt-2 text-[12.5px] ${accent ? "opacity-80" : "text-ink-soft"}`}>{note}</div>
    </div>
  );
}

function Statut({ statut }: { statut: RequestStatus }) {
  const s = STATUTS_RH[statut];
  return <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TONS[s.ton]}`}>{s.label}</span>;
}

function Histogramme({ serie, format = (n: number) => String(n) }: { serie: { label: string; valeur: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...serie.map((s) => s.valeur));
  return (
    <div className="flex h-[220px] items-end gap-1.5 sm:gap-2.5">
      {serie.map((s, i) => (
        <div key={i} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
          <span className="text-[11px] font-semibold tabular-nums text-ink opacity-0 transition group-hover:opacity-100">{s.valeur ? format(s.valeur) : ""}</span>
          <div
            className={`w-full rounded-t-[8px] transition-[height] duration-700 ${s.valeur ? "bg-brand group-hover:bg-brand-mid" : "bg-line"}`}
            style={{ height: s.valeur ? `${Math.max(4, (s.valeur / max) * 78)}%` : "3px" }}
            title={`${s.label} : ${format(s.valeur)}`}
          />
          <span className="truncate text-[11px] text-ink-soft">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function Repartition({ demandes }: { demandes: DemandeRh[] }) {
  const ordre = (Object.keys(STATUTS_RH) as RequestStatus[]).sort((a, b) => STATUTS_RH[a].ordre - STATUTS_RH[b].ordre);
  const lignes = ordre.map((s) => ({ s, n: demandes.filter((d) => d.statut === s).length })).filter((l) => l.n > 0);
  const total = demandes.length || 1;
  const teinte = (i: number) => `color-mix(in srgb, var(--color-brand) ${Math.max(22, 100 - i * 16)}%, var(--color-card))`;
  return (
    <div>
      <div className="flex h-3.5 overflow-hidden rounded-full bg-line">
        {lignes.map((l, i) => (
          <div key={l.s} style={{ width: `${(l.n / total) * 100}%`, background: teinte(i) }} title={`${STATUTS_RH[l.s].label} : ${l.n}`} />
        ))}
      </div>
      <ul className="mt-5 space-y-2.5">
        {lignes.map((l, i) => (
          <li key={l.s} className="flex items-center justify-between gap-3 text-[13.5px]">
            <span className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: teinte(i) }} />
              {STATUTS_RH[l.s].label}
            </span>
            <span className="tabular-nums text-ink-soft">
              <span className="font-semibold text-ink">{l.n}</span> · {Math.round((l.n / total) * 100)} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Classement({ lignes, total }: { lignes: { label: string; n: number }[]; total: number }) {
  const max = Math.max(1, ...lignes.map((l) => l.n));
  if (lignes.length === 0) return <p className="text-[13px] text-ink-soft">Rien à afficher pour l&apos;instant.</p>;
  return (
    <ul className="space-y-3">
      {lignes.map((l) => (
        <li key={l.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="truncate font-medium">{l.label}</span>
            <span className="shrink-0 tabular-nums text-ink-soft">{l.n} · {Math.round((l.n / (total || 1)) * 100)} %</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brand" style={{ width: `${(l.n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Vide({ texte = "Aucune demande sur cette période. Transmettez le lien à vos collaborateurs : leurs demandes apparaîtront ici." }: { texte?: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-line-strong bg-card px-6 py-14 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
        <Icone nom="carton" taille={21} />
      </span>
      <p className="mx-auto mt-4 max-w-[46ch] text-[14.5px] leading-relaxed text-ink-soft">{texte}</p>
    </div>
  );
}

function Message({ titre, texte, attente = false }: { titre: string; texte?: string; attente?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center text-ink">
      <Image src="/marque/bailly-logo.svg" alt="Bailly Déménagement" width={200} height={64} className="h-auto w-[140px]" />
      {attente && <span className="mt-8 h-8 w-8 animate-spin rounded-full border-[3px] border-line-strong border-t-ink" />}
      <h1 className="font-serif mt-6 text-[26px]">{titre}</h1>
      {texte && <p className="mt-2 max-w-[44ch] text-[14.5px] text-ink-soft">{texte}</p>}
    </div>
  );
}

/** L'équipe Bailly, entrée sans désigner d'espace : elle choisit celui qu'elle veut regarder. */
function ChoixEspace({ choix }: { choix: Choix[] }) {
  return (
    <div className="min-h-dvh bg-paper px-6 py-12 text-ink">
      <div className="mx-auto max-w-[920px]">
        <Image src="/marque/bailly-logo.svg" alt="Bailly Déménagement" width={200} height={64} className="h-auto w-[140px]" />
        <p className="eyebrow mt-8 text-brand-ink">Espace RH · aperçu équipe</p>
        <h1 className="font-serif mt-2 text-[34px]">Quel espace voulez-vous voir ?</h1>
        <p className="mt-2 max-w-[60ch] text-[14.5px] text-ink-soft">
          Vous êtes connecté avec un compte de l&apos;équipe. Choisissez une entreprise pour voir son espace RH tel que ses RH le voient.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {choix.map((c) => (
            <Link key={c.id} href={`/rh?apercu=${encodeURIComponent(c.id)}`} className="bloc flex items-center gap-3.5 rounded-[18px] border border-line bg-card p-4 transition hover:-translate-y-0.5 hover:border-ink">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-white p-1.5" style={c.logo ? undefined : { background: c.couleur }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- logo de l'entreprise, servi par notre API */}
                {c.logo && <img src={c.logo} alt="" className="max-h-full max-w-full object-contain" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{c.nom}</span>
              <Icone nom="droite" taille={15} className="text-ink-soft" />
            </Link>
          ))}
        </div>
        <Link href="/dashboard" className="mt-8 inline-flex items-center gap-2 text-[13px] font-medium text-ink-soft hover:text-ink">
          <Icone nom="gauche" taille={13} trait={2.4} /> Retour à l&apos;espace équipe
        </Link>
      </div>
    </div>
  );
}

/* ─────────────────────────── Calculs ─────────────────────────── */

function synthese(demandes: DemandeRh[]) {
  const somme = (liste: number[]) => liste.reduce((a, b) => a + b, 0);
  const vivantes = demandes.filter((d) => d.statut !== "lost");
  const chiffrees = vivantes.filter((d) => d.cout_ht != null);
  const volumes = demandes.map((d) => d.volume_m3).filter((v): v is number => v != null);
  const distances = demandes.map((d) => d.distance_km).filter((v): v is number => v != null);
  const delais = demandes
    .filter((d) => d.date_souhaitee)
    .map((d) => (new Date(`${d.date_souhaitee}T12:00:00`).getTime() - new Date(d.cree_le).getTime()) / 86_400_000)
    .filter((j) => j > 0);
  const compter = (cles: (string | null)[]) => {
    const m = new Map<string, number>();
    for (const c of cles) if (c) m.set(c, (m.get(c) ?? 0) + 1);
    return [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  };
  const budget = somme(chiffrees.map((d) => d.cout_ht ?? 0));
  const volumeChiffre = somme(chiffrees.map((d) => d.volume_m3 ?? 0));
  return {
    total: demandes.length,
    enCours: demandes.filter((d) => EN_COURS.includes(d.statut)).length,
    confirmees: demandes.filter((d) => d.statut === "won").length,
    volume: somme(volumes),
    volumeMoyen: volumes.length ? somme(volumes) / volumes.length : 0,
    distanceMoyenne: distances.length ? somme(distances) / distances.length : 0,
    delaiMoyen: delais.length ? somme(delais) / delais.length : null,
    chiffrees: chiffrees.length,
    budget,
    budgetConfirme: somme(chiffrees.filter((d) => d.statut === "won").map((d) => d.cout_ht ?? 0)),
    coutMoyen: chiffrees.length ? budget / chiffrees.length : 0,
    coutM3: volumeChiffre ? budget / volumeChiffre : 0,
    destinations: compter(demandes.map((d) => d.arrivee)),
    formules: compter(demandes.map((d) => (d.formule ? (FORMULES_RH[d.formule] ?? d.formule) : "Non précisée"))),
  };
}

/** Les douze derniers mois, du plus ancien au plus récent — vides compris : un mois sans demande se voit. */
function parMois(demandes: DemandeRh[], maintenant: number) {
  const fin = new Date(maintenant);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(fin.getFullYear(), fin.getMonth() - (11 - i), 1);
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const duMois = demandes.filter((x) => x.cree_le.slice(0, 7) === cle);
    return {
      label: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
      n: duMois.length,
      cout: duMois.filter((x) => x.statut !== "lost").reduce((s, x) => s + (x.cout_ht ?? 0), 0),
    };
  });
}
