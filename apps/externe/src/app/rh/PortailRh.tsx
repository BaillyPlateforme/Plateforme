"use client";

import { PastilleEnvironnement } from "@/components/PastilleEnvironnement";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { quitterEspaceRh } from "@/lib/actions/rh";
import { versInterne } from "@/lib/adresses";
import { themeEspace } from "@/lib/espaces";
import { TEL_AGENCE } from "@/lib/messaging";
import { exempleRh, type CleEtapeRh, type DonneesRh, type FactureRh } from "@/lib/rh-modele";
import { Picto, type NomPicto } from "./_ui/Icones";
import { enCours } from "./calculs";
import Fiche from "./Fiche";
import VueAccueil from "./vues/Accueil";
import VueBudget from "./vues/Budget";
import VueCollaborateurs from "./vues/Collaborateurs";
import VueLien from "./vues/Lien";

/*
 * L'espace RH : le pendant de l'espace équipe, pour les ressources humaines
 * d'une entreprise cliente. Une seule adresse pour toutes les entreprises ;
 * c'est le compte qui dit laquelle, et l'écran en prend la couleur et le logo.
 *
 * Tout y est en lecture : les RH suivent, ils ne règlent rien.
 *
 * Quatre vues : le tableau de bord, les collaborateurs (une ligne par
 * mobilité, leur fiche et leur chronologie), le budget (et les factures), le
 * lien des salariés. Pas de vue « Documents » : aucun contrat cadre ni
 * condition d'entreprise n'est enregistré nulle part — rien à montrer.
 */

type Vue = "accueil" | "collaborateurs" | "budget" | "lien";
type Choix = { id: string; nom: string; couleur: string; logo: string | null };

const VUES: { cle: Vue; label: string; court: string; picto: NomPicto }[] = [
  { cle: "accueil", label: "Tableau de bord", court: "Accueil", picto: "maison" },
  { cle: "collaborateurs", label: "Collaborateurs", court: "Collaborateurs", picto: "personnes" },
  { cle: "budget", label: "Budget", court: "Budget", picto: "euro" },
  { cle: "lien", label: "Lien salariés", court: "Lien", picto: "lien" },
];
const estVue = (v: string): v is Vue => VUES.some((x) => x.cle === v);

export default function PortailRh({ apercu }: { apercu: string | null }) {
  const [donnees, setDonnees] = useState<DonneesRh | null>(null);
  const [choix, setChoix] = useState<Choix[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [vue, setVueBrute] = useState<Vue>("accueil");
  const [exemple, setExemple] = useState(false);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [etape, setEtape] = useState<CleEtapeRh | null>(null);

  useEffect(() => {
    let annule = false;
    fetch(`/api/rh/donnees${apercu ? `?apercu=${encodeURIComponent(apercu)}` : ""}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (annule) return;
        // Une session sans droit ici (ni RH ni membre actif de l'équipe) : la connexion le dit, au lieu de
        // renvoyer aussitôt ici (voir proxy.ts).
        if (r.status === 401) return window.location.assign("/rh/connexion?refus=1");
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

  // La vue suit l'adresse (#budget…) : un rechargement ou un lien partagé rouvre la même.
  useEffect(() => {
    const lire = () => {
      const h = window.location.hash.slice(1);
      if (estVue(h)) setVueBrute(h);
    };
    lire();
    window.addEventListener("hashchange", lire);
    return () => window.removeEventListener("hashchange", lire);
  }, []);
  const setVue = useCallback((v: Vue) => {
    setVueBrute(v);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${v}`);
    window.scrollTo({ top: 0 });
  }, []);
  // Sur téléphone, les onglets défilent : celui de la vue ouverte reste en vue.
  useEffect(() => {
    document.querySelector(`[data-vue="${vue}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [vue, donnees]);

  // L'équipe peut afficher un jeu d'exemple — annoncé comme tel. Un compte RH ne voit jamais que le réel.
  const maintenant = donnees?.maintenant ?? 0;
  const fictif = !!donnees?.apercu && exemple;
  const { mobilites, factures } = useMemo(() => {
    if (!donnees) return { mobilites: [], factures: [] as FactureRh[] };
    if (fictif) return exempleRh(donnees.espace.nom, donnees.espace.couts, maintenant);
    return { mobilites: donnees.mobilites, factures: donnees.factures };
  }, [donnees, fictif, maintenant]);
  const fermer = useCallback(() => setOuverte(null), []);

  if (erreur) return <Message titre="Espace indisponible" texte={erreur} />;
  if (choix) return <ChoixEspace choix={choix} />;
  if (!donnees) return <Message titre="Chargement de votre espace…" attente />;

  const { espace } = donnees;
  const theme = (themeEspace(espace.couleur) ?? {}) as CSSProperties;
  const lienPdf = (f: FactureRh) => `/api/rh/factures/${f.id}/pdf${donnees.apercu ? `?apercu=${encodeURIComponent(espace.id)}` : ""}`;
  const fiche = ouverte ? mobilites.find((m) => m.id === ouverte) : null;
  const nbEnCours = mobilites.filter(enCours).length;

  return (
    <div className="min-h-dvh bg-paper text-ink" style={theme}>
      <Bandeau donnees={donnees} vue={vue} setVue={setVue} nbEnCours={nbEnCours} nbTotal={mobilites.length} />

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        {donnees.apercu && (
          <BandeauApercu
            fictif={fictif}
            sources={donnees.sources}
            nom={espace.nom}
            onBascule={() => setExemple((x) => !x)}
          />
        )}
        {!donnees.apercu && !donnees.sources.crm && (
          <p className="mb-5 flex items-center gap-2.5 rounded-[16px] border border-line bg-card px-4 py-3 text-[13px] text-ink-mid">
            <Picto nom="info" taille={16} className="shrink-0 text-ink-soft" />
            Une partie du suivi est momentanément indisponible : les dossiers en cours chez Bailly s&apos;afficheront à nouveau dans un instant.
          </p>
        )}

        {vue === "accueil" && (
          <VueAccueil
            mobilites={mobilites}
            factures={factures}
            couts={espace.couts}
            maintenant={maintenant}
            onOuvrir={setOuverte}
            onEtape={(e) => {
              setEtape(e);
              setVue("collaborateurs");
            }}
            onVers={setVue}
          />
        )}
        {vue === "collaborateurs" && (
          <VueCollaborateurs mobilites={mobilites} couts={espace.couts} entreprise={espace.nom} etape={etape} onEtape={setEtape} onOuvrir={setOuverte} />
        )}
        {vue === "budget" && (
          <VueBudget mobilites={mobilites} factures={factures} couts={espace.couts} maintenant={maintenant} apercu={donnees.apercu ? espace.id : null} onOuvrir={setOuverte} />
        )}
        {vue === "lien" && <VueLien lien={espace.lien} entreprise={espace.nom} />}
      </main>

      <footer className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-6 text-[12px] text-ink-soft sm:px-6 lg:px-8">
        <span className="flex items-center gap-2.5">
          <Image src="/marque/bailly-symbole.svg" alt="" width={20} height={20} className="h-5 w-5" />
          Espace RH de {espace.nom}, opéré par Bailly Déménagement · consultation seule
        </span>
        <span>Les données se mettent à jour à chaque visite.</span>
      </footer>

      {fiche && <Fiche m={fiche} factures={factures} couts={espace.couts} maintenant={maintenant} lienPdf={lienPdf} onFermer={fermer} />}
    </div>
  );
}

/* ─────────────────────────── Le bandeau ─────────────────────────── */

/**
 * Le bandeau de l'espace : noir de la marque, la couleur de l'entreprise en
 * filet et en lueur, son logo sur une tuile blanche. Dessous, le titre de la
 * vue et l'interlocuteur Bailly ; en pied, les quatre vues.
 */
function Bandeau({ donnees, vue, setVue, nbEnCours, nbTotal }: { donnees: DonneesRh; vue: Vue; setVue: (v: Vue) => void; nbEnCours: number; nbTotal: number }) {
  const { espace, compte, contact } = donnees;
  const qui = compte?.nom || compte?.email || null;
  const prenom = compte?.nom?.split(" ")[0] || null;
  const titre = VUES.find((v) => v.cle === vue)!.label;
  return (
    <header className="relative overflow-hidden bg-[#1b1a18] text-white">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-brand" />
      <span
        aria-hidden
        className="halo absolute -left-40 -top-56 h-[560px] w-[760px] opacity-80"
        style={{ "--halo": "color-mix(in srgb, var(--color-brand) 42%, transparent)" } as CSSProperties}
      />
      <div className="relative mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
        {/* ── L'entreprise, Bailly, le compte ── */}
        <div className="flex items-center justify-between gap-3 pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 min-w-12 max-w-[132px] shrink-0 items-center justify-center rounded-[14px] bg-white px-2.5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]">
              {espace.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo de l'entreprise, servi par notre API
                <img src={espace.logo} alt={espace.nom} className="max-h-8 max-w-full object-contain" />
              ) : (
                <span className="text-[13px] font-bold text-[#1b1a18]">{espace.nom}</span>
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold leading-tight">{espace.nom}</p>
              <p className="truncate text-[12px] text-white/60">Espace RH · avec Bailly Déménagement</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <Image src="/marque/bailly-logo-blanc.svg" alt="Bailly Déménagement" width={200} height={64} className="hidden h-auto w-[92px] opacity-90 md:block" />
            <PastilleEnvironnement style={{ marginLeft: 0 }} />
            <span className="hidden h-7 w-px bg-white/15 md:block" />
            {donnees.apercu ? (
              <div className="flex items-center gap-1.5">
                <Link href="/rh" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12.5px] font-semibold transition hover:bg-white/20">
                  <Picto nom="immeuble" taille={15} /> <span className="hidden sm:inline">Changer d&apos;entreprise</span>
                </Link>
                <a href={versInterne("/dashboard")} className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-white/70 transition hover:text-white sm:inline-flex">
                  <Picto nom="gauche" taille={15} /> Espace équipe
                </a>
              </div>
            ) : (
              <form action={quitterEspaceRh} className="flex items-center gap-2">
                {qui && <span className="hidden max-w-[200px] truncate text-[12.5px] text-white/70 lg:block">{qui}</span>}
                <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12.5px] font-semibold transition hover:bg-white/20" title="Se déconnecter">
                  <Picto nom="sortie" taille={15} /> <span className="hidden sm:inline">Déconnexion</span>
                </button>
              </form>
            )}
          </div>
        </div>

        {/* ── Le titre de la vue, l'interlocuteur ── */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-5 pt-7">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-white/60">
              {donnees.apercu ? "Aperçu de l'équipe Bailly" : prenom ? `Bonjour ${prenom}` : "Bonjour"} · {new Date(donnees.maintenant).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="font-serif mt-1.5 text-[30px] leading-none sm:text-[38px]">{titre}</h1>
          </div>
          <Contact contact={contact} />
        </div>

        {/* ── Les vues ── */}
        <nav aria-label="Vues de l'espace RH" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {VUES.map((v) => {
            const actif = v.cle === vue;
            return (
              <button
                key={v.cle}
                type="button"
                data-vue={v.cle}
                aria-current={actif ? "page" : undefined}
                onClick={() => setVue(v.cle)}
                className={`relative flex shrink-0 items-center gap-2 rounded-t-[14px] px-3 pb-3.5 pt-3 text-[13.5px] font-semibold transition sm:px-4 ${
                  actif ? "bg-paper text-ink" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Picto nom={v.picto} taille={16} className={`hidden sm:block ${actif ? "text-brand-ink" : ""}`} />
                <span className="sm:hidden">{v.court}</span>
                <span className="hidden sm:inline">{v.label}</span>
                {v.cle === "collaborateurs" && nbTotal > 0 && (
                  <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${actif ? "bg-brand text-sur-brand" : "bg-white/12 text-white"}`} title={`${nbEnCours} en cours`}>
                    {nbTotal}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function Contact({ contact }: { contact: DonneesRh["contact"] }) {
  const tel = `tel:+33${contact.tel.replace(/\D/g, "").slice(1)}`;
  return (
    <div className="flex w-full items-center gap-3.5 rounded-[18px] bg-white/[0.07] px-4 py-3 ring-1 ring-white/10 sm:w-auto">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sur-brand">
        <Picto nom="bulle" taille={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">{contact.qualite === "conseiller" ? "Votre contact Bailly" : "Bailly Déménagement"}</p>
        <p className="truncate text-[14px] font-semibold">{contact.nom ?? (contact.tel === TEL_AGENCE ? "Standard de l'agence" : "Votre interlocuteur")}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-white/75">
          <a href={tel} className="inline-flex items-center gap-1.5 hover:text-white">
            <Picto nom="tel" taille={13} /> {contact.tel}
          </a>
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="inline-flex min-w-0 items-center gap-1.5 hover:text-white">
              <Picto nom="mail" taille={13} /> <span className="truncate">{contact.email}</span>
            </a>
          )}
        </p>
      </div>
    </div>
  );
}

/** Ce que l'équipe regarde vraiment : le réel, ou un exemple. Les RH ne voient jamais ce bandeau. */
function BandeauApercu({ fictif, sources, nom, onBascule }: { fictif: boolean; sources: DonneesRh["sources"]; nom: string; onBascule: () => void }) {
  return (
    <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border px-4 py-3 text-[13px] ${fictif ? "border-warn/40 bg-warn-soft" : "border-line bg-card"}`}>
      <span className="flex min-w-0 items-start gap-2.5">
        <Picto nom={fictif ? "alerte" : "oeil"} taille={16} className="mt-0.5 shrink-0 text-ink-soft" />
        <span>
          <span className="font-semibold">{fictif ? "Jeu d'exemple fictif." : "Aperçu équipe — l'espace tel que les RH de " + nom + " le voient."}</span>{" "}
          {fictif ? (
            "Rien de ce qui s'affiche n'est réel ; les RH ne le voient jamais."
          ) : (
            <>
              Données réelles : {sources.demandes} demande{sources.demandes > 1 ? "s" : ""} de l&apos;espace pro, {sources.dossiers} dossier{sources.dossiers > 1 ? "s" : ""} du CRM,{" "}
              {sources.clients} client{sources.clients > 1 ? "s" : ""} rattaché{sources.clients > 1 ? "s" : ""}
              {sources.crm ? "." : " (le CRM n'a pas répondu)."}
              {sources.crm && sources.clients === 0 && " Un client se rattache à l'entreprise depuis sa fiche, au CRM."}
            </>
          )}
        </span>
      </span>
      <button type="button" onClick={onBascule} className="shrink-0 font-semibold text-ink underline-offset-4 hover:underline">
        {fictif ? "Revenir aux données réelles" : "Afficher un exemple"}
      </button>
    </div>
  );
}

/* ─────────────────────────── Les écrans d'attente et de choix ─────────────────────────── */

function Message({ titre, texte, attente = false }: { titre: string; texte?: string; attente?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center text-ink">
      <Image src="/marque/bailly-logo.svg" alt="Bailly Déménagement" width={200} height={64} className="h-auto w-[140px]" />
      {attente && <span className="mt-8 h-8 w-8 animate-spin rounded-full border-[3px] border-line-strong border-t-ink" />}
      <h1 className="font-serif mt-6 text-[26px]">{titre}</h1>
      {texte && <p className="mt-2 max-w-[44ch] text-[14.5px] text-ink-soft">{texte}</p>}
      {!attente && (
        <Link href="/rh/connexion" className="mt-6 text-[13px] font-semibold text-ink underline-offset-4 hover:underline">
          Revenir à la connexion
        </Link>
      )}
    </div>
  );
}

/** L'équipe Bailly, entrée sans désigner d'espace : elle choisit celui qu'elle veut regarder. */
function ChoixEspace({ choix }: { choix: Choix[] }) {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="relative overflow-hidden bg-[#1b1a18] text-white">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-[#f5d033]" />
        <span aria-hidden className="halo absolute -left-40 -top-56 h-[560px] w-[760px]" style={{ "--halo": "rgba(245, 208, 51, 0.22)" } as CSSProperties} />
        <div className="relative mx-auto max-w-[1080px] px-5 pb-10 pt-6 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center">
              <Image src="/marque/bailly-logo-blanc.svg" alt="Bailly Déménagement" width={200} height={64} className="h-auto w-[120px]" />
              <PastilleEnvironnement />
            </span>
            <a href={versInterne("/dashboard")} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[12.5px] font-semibold transition hover:bg-white/20">
              <Picto nom="gauche" taille={15} /> Espace équipe
            </a>
          </div>
          <p className="mt-10 text-[11.5px] font-bold uppercase tracking-[0.18em] text-[#f5d033]">Espace RH · aperçu équipe</p>
          <h1 className="font-serif mt-2 text-[32px] leading-tight sm:text-[40px]">Quel espace voulez-vous voir ?</h1>
          <p className="mt-2 max-w-[62ch] text-[14.5px] text-white/70">
            Vous êtes connecté avec un compte de l&apos;équipe. Choisissez une entreprise pour voir son espace RH tel que ses RH le voient.
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-[1080px] px-5 py-8 sm:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {choix.map((c) => (
            <Link
              key={c.id}
              href={`/rh?apercu=${encodeURIComponent(c.id)}`}
              className="bloc group relative flex items-center gap-3.5 overflow-hidden rounded-[20px] border border-line bg-card p-4 transition hover:-translate-y-0.5 hover:border-ink"
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: c.couleur }} />
              <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-white p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- logo de l'entreprise, servi par notre API */}
                {c.logo ? <img src={c.logo} alt="" className="max-h-full max-w-full object-contain" /> : <span className="h-5 w-5 rounded-full" style={{ background: c.couleur }} />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{c.nom}</span>
              <Picto nom="fleche" taille={17} className="text-ink-soft transition group-hover:translate-x-0.5 group-hover:text-ink" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
