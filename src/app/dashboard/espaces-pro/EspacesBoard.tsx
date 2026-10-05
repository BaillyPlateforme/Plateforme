"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import {
  AJUSTEMENT_MAX,
  AJUSTEMENT_MIN,
  COULEUR_BAILLY,
  QUESTIONS,
  couleurValide,
  espaceVide,
  messageDe,
  messageFinDe,
  palette,
  slugifier,
  themeEspace,
  titreDe,
  urlLogo,
  volumeChiffre,
  type EspacePro,
  type QuestionCle,
  nomEnseigne,
  appliquerRegles,
  cheminEspace,
  espaceEffectif,
  memeReglage,
  CLES_REGLES,
  type CleRegle,
  type Regles,
} from "@/lib/espaces";
import { effacerEspace, enleverLogo, nouveauLien, sauverEspace, sauverRegles, televerserLogo } from "@/lib/actions/espaces";
import { ajouterCompteRh, comptesRh, nouveauMotDePasseRh, retirerCompteRh } from "@/lib/actions/rh";
import type { CompteRh } from "@/lib/rh";
import { rendreEmail } from "@/lib/email-render";

type Entreprise = { nom: string | null; email: string | null; tel: string | null };

const ONGLETS = [
  { cle: "identite", label: "Identité" },
  { cle: "parcours", label: "Parcours" },
  { cle: "prix", label: "Volume et prix" },
  { cle: "mail", label: "Mail et devis" },
  { cle: "rh", label: "Accès RH" },
] as const;
type Onglet = (typeof ONGLETS)[number]["cle"];

/** Quelques teintes de départ ; le champ accepte n'importe quel code. */
const TEINTES = [COULEUR_BAILLY, "#0055a4", "#0b2a4a", "#00864a", "#d1232a", "#e2001a", "#f28c00", "#6b2d8b", "#1b1a18"];

/** Le message type dont l'aperçu se sert pour montrer l'habillage du mail. */
const MODELE_APERCU = `Bonjour {{client_nom}},

Merci de votre confiance. Votre demande de déménagement est bien enregistrée : en voici le détail.

{{bloc_recapitulatif}}

{{bloc_estimation}}

{{bouton_estimation}}

{{bloc_suite}}

{{bloc_contact}}

À très bientôt,
L'équipe {{entreprise_nom}}`;

/**
 * Les espaces pro, vus de l'équipe : la liste à gauche, l'espace choisi à
 * droite. Tout ce qu'un espace change dans le parcours du client se règle ici.
 */
export default function EspacesBoard({
  espaces,
  regles: reglesInitiales,
  demandes,
  base,
  entreprise,
}: {
  espaces: EspacePro[];
  regles: Regles;
  demandes: Record<string, number>;
  base: string;
  entreprise: Entreprise;
}) {
  const [liste, setListe] = useState(espaces);
  const [brouillon, setBrouillon] = useState<EspacePro>(espaces[0] ?? espaceVide("Nouvel espace"));
  const [onglet, setOnglet] = useState<Onglet>("identite");
  const [recherche, setRecherche] = useState("");
  const [etat, setEtat] = useState<{ ton: "ok" | "erreur"; texte: string } | null>(null);
  const [enCours, lancer] = useTransition();
  const fichier = useRef<HTMLInputElement>(null);

  // Les règles générales des grands comptes : celles qui sont enregistrées, et
  // celles qu'on est en train de modifier.
  const [regles, setRegles] = useState(reglesInitiales);
  const [reglesBrouillon, setReglesBrouillon] = useState(reglesInitiales);
  /** Ce que le panneau de droite montre : un espace, ou les règles générales. */
  const [vue, setVue] = useState<"espace" | "regles">("espace");
  const general = vue === "regles";

  const origine = typeof window !== "undefined" ? window.location.origin : "";
  const racine = base || origine;
  const nouveau = !liste.some((e) => e.id === brouillon.id);
  const enregistre = liste.find((e) => e.id === brouillon.id);
  const modifie = general
    ? JSON.stringify(regles) !== JSON.stringify(reglesBrouillon)
    : nouveau || JSON.stringify(enregistre) !== JSON.stringify(brouillon);

  const grandsComptes = liste.filter((e) => e.grand_compte);
  /**
   * Les réglages à l'écran : les règles générales, ou ceux de l'espace tels
   * qu'ils s'appliquent — un grand compte montre la règle générale partout où
   * il n'a rien réglé lui-même.
   */
  const v: Regles = general ? reglesBrouillon : appliquerRegles(brouillon, regles);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? liste.filter((e) => e.nom.toLowerCase().includes(q) || e.slug.includes(q)) : liste;
  }, [liste, recherche]);

  const patch = (p: Partial<EspacePro>) => {
    setBrouillon((b) => ({ ...b, ...p }));
    setEtat(null);
  };

  /**
   * Changer un réglage. Dans les règles générales, il change pour tous ceux
   * qui les suivent. Dans un grand compte, le toucher suffit à le rendre
   * propre à cet espace : il cesse de suivre la règle générale sur ce point.
   */
  const regler = (p: Partial<Regles>) => {
    if (general) {
      setReglesBrouillon((r) => ({ ...r, ...p }));
      setEtat(null);
      return;
    }
    const cles = Object.keys(p) as CleRegle[];
    patch({ ...p, ...(brouillon.grand_compte ? { propres: CLES_REGLES.filter((c) => brouillon.propres.includes(c) || cles.includes(c)) } : {}) });
  };
  /** Rendre un réglage à la règle générale. */
  const reprendre = (cle: CleRegle) => patch({ propres: brouillon.propres.filter((c) => c !== cle) });

  /** D'où vient un réglage, dit à côté de lui — seulement dans un grand compte. */
  const origineDe = (cle: CleRegle): ReactNode =>
    general || !brouillon.grand_compte ? null : brouillon.propres.includes(cle) ? (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
        <span className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand-ink">Propre à cet espace</span>
        <button onClick={() => reprendre(cle)} className="font-medium text-ink-soft underline-offset-2 transition hover:text-ink hover:underline">
          Revenir à la règle générale
        </button>
      </span>
    ) : (
      <span className="rounded-full bg-subtle px-2 py-0.5 text-[11.5px] font-medium text-ink-soft">Règle générale</span>
    );

  /**
   * Grand compte ou espace indépendant. On ne change pas ce que l'espace fait
   * en changeant son type : ce qui différait de la règle générale reste propre
   * à l'espace, et un espace qui devient indépendant garde ce qu'il appliquait.
   */
  const changerType = (grand: boolean) => {
    if (grand === brouillon.grand_compte) return;
    if (grand) return patch({ grand_compte: true, propres: CLES_REGLES.filter((c) => !memeReglage(brouillon[c], regles[c])) });
    const applique = appliquerRegles(brouillon, regles);
    patch({ ...Object.fromEntries(CLES_REGLES.map((c) => [c, applique[c]])), grand_compte: false, propres: [] });
  };

  function ouvrir(e: EspacePro) {
    setVue("espace");
    setBrouillon(e);
    setEtat(null);
  }

  function ouvrirRegles() {
    setVue("regles");
    if (onglet === "identite" || onglet === "rh") setOnglet("parcours");
    setEtat(null);
  }

  function creer() {
    setVue("espace");
    // Un nouvel espace naît grand compte : il suit les règles générales tant qu'on ne règle rien.
    setBrouillon({ ...espaceVide("Nouvel espace"), id: `nouveau-${Date.now()}`, slug: "nouvel-espace", grand_compte: true });
    setOnglet("identite");
    setEtat(null);
  }

  function renouveler() {
    if (!window.confirm(`Donner un nouveau lien à « ${brouillon.nom} » ? L'ancien cessera aussitôt de fonctionner : il faudra retransmettre le nouveau.`)) return;
    lancer(async () => {
      const r = await nouveauLien(brouillon.id);
      if (!r.ok) return setEtat({ ton: "erreur", texte: r.erreur });
      setListe((l) => l.map((e) => (e.id === r.espace.id ? r.espace : e)));
      setBrouillon((b) => ({ ...b, code: r.espace.code, rotation: r.espace.rotation, updated_at: r.espace.updated_at }));
      setEtat({ ton: "ok", texte: "Nouveau lien créé" });
    });
  }

  function enregistrer() {
    if (general)
      return lancer(async () => {
        const r = await sauverRegles(reglesBrouillon);
        if (!r.ok) return setEtat({ ton: "erreur", texte: r.erreur });
        setRegles(r.regles);
        setReglesBrouillon(r.regles);
        setEtat({ ton: "ok", texte: `Enregistré — appliqué aux grands comptes` });
      });
    lancer(async () => {
      const r = await sauverEspace(nouveau ? { ...brouillon, id: undefined } : brouillon);
      if (!r.ok) return setEtat({ ton: "erreur", texte: r.erreur });
      setListe((l) => (l.some((e) => e.id === r.espace.id) ? l.map((e) => (e.id === r.espace.id ? r.espace : e)) : [...l, r.espace]));
      setBrouillon(r.espace);
      setEtat({ ton: "ok", texte: "Enregistré" });
    });
  }

  function supprimer() {
    if (nouveau) return ouvrir(liste[0] ?? espaceVide("Nouvel espace"));
    if (!window.confirm(`Supprimer l'espace « ${brouillon.nom} » ? Son lien cessera de fonctionner.`)) return;
    lancer(async () => {
      const r = await effacerEspace(brouillon.id);
      if (!r.ok) return setEtat({ ton: "erreur", texte: r.erreur ?? "Suppression impossible" });
      const reste = liste.filter((e) => e.id !== brouillon.id);
      setListe(reste);
      setBrouillon(reste[0] ?? espaceVide("Nouvel espace"));
    });
  }

  function envoyerLogo(f: File | undefined) {
    if (!f) return;
    const donnees = new FormData();
    donnees.set("id", brouillon.id);
    donnees.set("logo", f);
    lancer(async () => {
      const r = await televerserLogo(donnees);
      if (fichier.current) fichier.current.value = "";
      if (!r.ok) return setEtat({ ton: "erreur", texte: r.erreur });
      // Seul le logo vient d'être enregistré : le reste du brouillon est gardé.
      setListe((l) => l.map((e) => (e.id === r.espace.id ? r.espace : e)));
      setBrouillon((b) => ({ ...b, logo: r.espace.logo, updated_at: r.espace.updated_at }));
      setEtat({ ton: "ok", texte: "Logo enregistré" });
    });
  }

  function oterLogo() {
    lancer(async () => {
      const r = await enleverLogo(brouillon.id);
      if (!r.ok) return setEtat({ ton: "erreur", texte: r.erreur });
      setListe((l) => l.map((e) => (e.id === r.espace.id ? r.espace : e)));
      setBrouillon((b) => ({ ...b, logo: null, updated_at: r.espace.updated_at }));
    });
  }

  // Le lien n'existe qu'une fois l'espace enregistré : c'est le serveur qui en calcule le code.
  const lien = brouillon.code ? `${racine}${cheminEspace(brouillon)}` : "";
  // Les règles générales n'ont ni identité ni comptes RH ; l'espace standard
  // n'est celui d'aucune entreprise, donc d'aucun service RH.
  const onglets = general
    ? ONGLETS.filter((o) => o.cle !== "identite" && o.cle !== "rh")
    : ONGLETS.filter((o) => o.cle !== "rh" || brouillon.slug !== "standard");
  /** L'espace que les aperçus habillent : celui qu'on règle, ou un grand compte en exemple. */
  const exemple = general
    ? grandsComptes[0]
      ? espaceEffectif({ ...grandsComptes[0], propres: [] }, reglesBrouillon)
      : null
    : espaceEffectif(brouillon, regles);

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* ── La liste ── */}
      <aside className="space-y-3">
        <div className="flex gap-2">
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un espace…"
            className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={creer}
            title="Nouvel espace"
            className="shrink-0 rounded-xl bg-ink px-3.5 text-sm font-semibold text-shell transition active:scale-95"
          >
            + Nouveau
          </button>
        </div>

        <button
          onClick={ouvrirRegles}
          className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
            general ? "border-ink bg-ink text-shell" : "border-line bg-card hover:border-line-strong"
          }`}
        >
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${general ? "bg-brand text-sur-brand" : "bg-ink text-shell"}`}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Règles générales</span>
            <span className={`mt-0.5 block truncate text-xs ${general ? "opacity-70" : "text-ink-soft"}`}>
              Grands comptes · {grandsComptes.length} espace{grandsComptes.length > 1 ? "s" : ""}
            </span>
          </span>
        </button>

        <div className="space-y-1.5">
          {nouveau && !general && <LigneEspace espace={brouillon} regles={regles} actif n={0} brouillon onClick={() => {}} />}
          {visibles.map((e) => (
            <LigneEspace
              key={e.id}
              espace={e.id === brouillon.id ? brouillon : e}
              regles={regles}
              actif={!general && e.id === brouillon.id}
              n={demandes[e.slug] ?? 0}
              onClick={() => ouvrir(e)}
            />
          ))}
          {visibles.length === 0 && !nouveau && (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-soft">
              Aucun espace à ce nom.
            </p>
          )}
        </div>
      </aside>

      {/* ── L'espace choisi ── */}
      <section className="min-w-0 rounded-[18px] bg-card">
        {general ? (
          <header className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 md:px-6">
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-ink text-shell">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-semibold">Règles générales des grands comptes</div>
              <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">
                Un changement ici vaut pour les {grandsComptes.length} grands comptes — sauf pour un espace qui a réglé ce point
                lui-même. Le logo, la couleur et le titre restent propres à chaque entreprise.
              </p>
            </div>
          </header>
        ) : (
          <header className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 md:px-6">
            <Vignette espace={brouillon} taille={46} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[17px] font-semibold">{brouillon.nom || "Espace sans nom"}</span>
                <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                  {brouillon.grand_compte ? "Grand compte" : "Indépendant"}
                </span>
              </div>
              {lien ? (
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-soft">
                  <span className="truncate font-mono">{lien.replace(/^https?:\/\//, "")}</span>
                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(lien);
                      setEtat({ ton: "ok", texte: "Lien copié" });
                    }}
                    className="font-medium text-brand-ink transition hover:text-ink"
                  >
                    Copier
                  </button>
                  <a href={cheminEspace(brouillon)} target="_blank" rel="noreferrer" className="font-medium text-brand-ink transition hover:text-ink">
                    Ouvrir ↗
                  </a>
                  <button
                    onClick={renouveler}
                    disabled={enCours}
                    title="Créer un nouveau lien : l'ancien cesse de fonctionner"
                    className="font-medium text-ink-soft transition hover:text-ink"
                  >
                    Nouveau lien
                  </button>
                </div>
              ) : (
                <div className="mt-0.5 text-[12.5px] text-ink-soft">Le lien, avec son code, sera créé à l&apos;enregistrement.</div>
              )}
            </div>
            <Bascule
              actif={brouillon.actif}
              onChange={(actif) => patch({ actif })}
              label={brouillon.actif ? "Actif" : "Inactif"}
            />
          </header>
        )}

        <nav className="flex gap-1 overflow-x-auto border-b border-line px-4 md:px-5">
          {onglets.map((o) => (
            <button
              key={o.cle}
              onClick={() => setOnglet(o.cle)}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition ${
                onglet === o.cle ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </nav>

        <div className="grid gap-6 p-5 md:p-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            {onglet === "identite" && !general && (
              <>
                <Champ
                  label="Type d'espace"
                  aide="Un grand compte suit les règles générales, sauf sur les points que vous réglez ici pour lui. Un espace indépendant ne dépend que de ses propres réglages."
                >
                  <Segments
                    valeur={brouillon.grand_compte ? "grand" : "seul"}
                    options={[
                      ["grand", "Grand compte", "Suit les règles générales des grands comptes."],
                      ["seul", "Espace indépendant", "Ses réglages ne valent que pour lui."],
                    ]}
                    onChange={(t) => changerType(t === "grand")}
                  />
                </Champ>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Champ label="Nom de l'entreprise">
                    <input
                      value={brouillon.nom}
                      onChange={(e) =>
                        patch({
                          nom: e.target.value,
                          // Tant que l'espace n'existe pas, le lien suit le nom.
                          ...(nouveau ? { slug: slugifier(e.target.value) } : {}),
                        })
                      }
                      className={SAISIE}
                    />
                  </Champ>
                  <Champ
                    label="Nom dans le lien"
                    aide="Le code qui le précède est attribué par le serveur : c'est lui qui ouvre l'espace. Sans le code, le nom seul ne mène nulle part."
                  >
                    <div className="flex items-center rounded-xl border border-line bg-paper focus-within:border-accent">
                      <span className="shrink-0 pl-3 font-mono text-sm text-ink-soft">/pro/{brouillon.code || "code"}/</span>
                      <input
                        value={brouillon.slug}
                        onChange={(e) => patch({ slug: slugifier(e.target.value) })}
                        className="min-w-0 flex-1 bg-transparent py-2.5 pr-3 font-mono text-sm outline-none"
                      />
                    </div>
                  </Champ>
                </div>

                <Champ label="Logo" aide="PNG ou JPEG, 600 Ko au plus. Il apparaît dans l'espace, dans les mails et sur le devis.">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex h-[72px] w-[168px] items-center justify-center rounded-xl border border-line bg-white p-3">
                      {brouillon.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- logo téléversé, servi par notre API
                        <img src={urlLogo(brouillon) ?? ""} alt={brouillon.nom} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <span className="text-xs text-[#615f68]">Aucun logo</span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <input
                        ref={fichier}
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={(e) => envoyerLogo(e.target.files?.[0])}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => fichier.current?.click()}
                          disabled={nouveau || enCours}
                          className="rounded-xl border border-line-strong px-3.5 py-2 text-sm font-medium transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {brouillon.logo ? "Remplacer" : "Choisir un fichier"}
                        </button>
                        {brouillon.logo && (
                          <button onClick={oterLogo} disabled={enCours} className="rounded-xl px-3 py-2 text-sm text-ink-soft transition hover:text-danger">
                            Retirer
                          </button>
                        )}
                      </div>
                      {nouveau && <p className="text-xs text-ink-soft">Enregistrez l&apos;espace, puis ajoutez son logo.</p>}
                    </div>
                  </div>
                </Champ>

                <Champ label="Couleur" aide="Elle remplace le jaune de Bailly dans l'espace, les mails et le devis. Le texte posé dessus s'adapte tout seul.">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="color"
                      value={couleurValide(brouillon.couleur) ?? COULEUR_BAILLY}
                      onChange={(e) => patch({ couleur: e.target.value })}
                      className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-paper p-1"
                      aria-label="Choisir une couleur"
                    />
                    {/* La saisie prend toute la largeur par défaut : c'est son cadre qui la borne. */}
                    <div className="w-[116px] shrink-0">
                      <input
                        value={brouillon.couleur}
                        onChange={(e) => patch({ couleur: e.target.value })}
                        className={`${SAISIE} font-mono`}
                        aria-label="Code de la couleur"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {TEINTES.map((t) => (
                        <button
                          key={t}
                          onClick={() => patch({ couleur: t })}
                          title={t}
                          aria-label={`Couleur ${t}`}
                          className={`h-7 w-7 rounded-full border-2 transition ${
                            (couleurValide(brouillon.couleur) ?? "") === t ? "border-ink" : "border-card"
                          }`}
                          style={{ background: t, boxShadow: "0 0 0 1px var(--color-line-strong)" }}
                        />
                      ))}
                    </div>
                  </div>
                </Champ>

                <Champ label="Titre d'accueil" aide="Laissé vide, le titre par défaut s'affiche.">
                  <input
                    value={brouillon.titre}
                    onChange={(e) => patch({ titre: e.target.value })}
                    placeholder={titreDe({ ...brouillon, titre: "" })}
                    className={SAISIE}
                  />
                </Champ>
                <Champ label="Message d'accueil">
                  <textarea
                    value={brouillon.message}
                    onChange={(e) => patch({ message: e.target.value })}
                    placeholder={messageDe({ ...brouillon, message: "" })}
                    rows={4}
                    className={`${SAISIE} resize-y leading-relaxed`}
                  />
                </Champ>
              </>
            )}

            {onglet === "rh" && !general && (
              <AccesRh
                key={brouillon.id}
                espace={brouillon}
                enregistre={!nouveau}
                racine={racine}
                onCouts={(rh_couts) => patch({ rh_couts })}
              />
            )}

            {onglet !== "identite" && onglet !== "rh" && !general && brouillon.grand_compte && (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-line bg-paper px-4 py-3 text-[13px]">
                <span className="min-w-0 flex-1 leading-snug text-ink-soft">
                  <span className="font-semibold text-ink">
                    {brouillon.propres.length === 0
                      ? "Ce grand compte suit toutes les règles générales."
                      : `Ce grand compte a ${brouillon.propres.length} réglage${brouillon.propres.length > 1 ? "s" : ""} propre${brouillon.propres.length > 1 ? "s" : ""}.`}
                  </span>{" "}
                  Modifiez un réglage ici : il ne vaudra que pour {brouillon.nom || "cet espace"}.
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {brouillon.propres.length > 0 && (
                    <button onClick={() => patch({ propres: [] })} className="font-medium text-ink-soft underline-offset-2 transition hover:text-ink hover:underline">
                      Tout remettre aux règles générales
                    </button>
                  )}
                  <button onClick={ouvrirRegles} className="font-semibold text-brand-ink transition hover:text-ink">
                    Règles générales →
                  </button>
                </span>
              </div>
            )}

            {onglet === "parcours" && (
              <>
                <Champ label="Formulaire proposé" marque={origineDe("parcours")}>
                  <Segments
                    valeur={v.parcours}
                    options={[
                      ["complet", "Devis complet", "Sept étapes : accès, prestations, inventaire."],
                      ["express", "Devis express", "Une page : contact, trajet, date, volume."],
                    ]}
                    onChange={(choix) => regler({ parcours: choix as EspacePro["parcours"] })}
                  />
                </Champ>

                <Champ label="Formule" marque={origineDe("formule_imposee")} aide="Quand l'entreprise prend en charge une formule précise, elle s'applique sans que le salarié ait à choisir.">
                  <select
                    value={v.formule_imposee}
                    onChange={(e) => regler({ formule_imposee: e.target.value as EspacePro["formule_imposee"] })}
                    className={`${SAISIE} sm:w-80`}
                  >
                    <option value="">Le client choisit sa formule</option>
                    <option value="eco">Économique, imposée</option>
                    <option value="standard">Standard, imposée</option>
                    <option value="luxe">Premium, imposée</option>
                  </select>
                </Champ>

                <div>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-medium">Questions posées</span>
                    {origineDe("questions_masquees")}
                  </div>
                  <p className="mb-3 text-xs text-ink-soft">
                    Décochez ce qui ne se demande pas. Une question retirée prend sa valeur par défaut.
                  </p>
                  <div className="space-y-4">
                    {[...new Set(QUESTIONS.map((q) => q.groupe))].map((groupe) => (
                      <div key={groupe}>
                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{groupe}</div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {QUESTIONS.filter((q) => q.groupe === groupe).map((q) => {
                            const posee = !v.questions_masquees.includes(q.cle);
                            // L'étape Prestations disparaît d'office quand la formule est imposée.
                            const force = q.cle === "formules" && !!v.formule_imposee;
                            return (
                              <label
                                key={q.cle}
                                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition ${
                                  posee && !force ? "border-line bg-paper" : "border-dashed border-line text-ink-soft"
                                } ${force ? "cursor-not-allowed opacity-60" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={posee && !force}
                                  disabled={force}
                                  onChange={(e) => regler({ questions_masquees: basculer(v.questions_masquees, q.cle, !e.target.checked) })}
                                  className="mt-0.5 accent-[var(--color-ink)]"
                                />
                                <span>
                                  <span className="block font-medium">{q.label}</span>
                                  {(force || q.aide) && (
                                    <span className="mt-0.5 block text-xs text-ink-soft">
                                      {force ? "Masquée : la formule est imposée." : q.aide}
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {onglet === "prix" && (
              <>
                <div className="space-y-2">
                  <Reglage
                    titre="Afficher le prix à la fin du parcours"
                    aide="Décoché, le client voit une confirmation, pas un montant. Le chiffrage est fait quand même : il reste dans l'espace équipe."
                    actif={v.afficher_estimation}
                    marque={origineDe("afficher_estimation")}
                    onChange={(oui) => regler({ afficher_estimation: oui })}
                  />
                  <Reglage
                    titre="Envoyer l'estimation au client par e-mail"
                    aide="Décoché, il reçoit un accusé de réception sans prix ni pièce jointe. Un devis envoyé à la main par l'équipe part toujours."
                    actif={v.envoyer_devis}
                    marque={origineDe("envoyer_devis")}
                    onChange={(oui) => regler({ envoyer_devis: oui })}
                  />
                  <Reglage
                    titre="Afficher le volume calculé"
                    aide="Décoché, le client liste ses meubles ou envoie ses photos sans voir le total en mètres cubes."
                    actif={v.afficher_volume}
                    marque={origineDe("afficher_volume")}
                    onChange={(oui) => regler({ afficher_volume: oui })}
                  />
                </div>

                {!v.afficher_estimation && (
                  <Champ label="Mot de la fin" marque={origineDe("message_fin")} aide="Ce que le client lit à la place du prix.">
                    <textarea
                      value={v.message_fin}
                      onChange={(e) => regler({ message_fin: e.target.value })}
                      placeholder={messageFinDe({ nom: "", slug: "", message_fin: "" })}
                      rows={3}
                      className={`${SAISIE} resize-y leading-relaxed`}
                    />
                  </Champ>
                )}

                <div className="rounded-2xl border border-line bg-paper p-4 md:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Cote ou décote sur le volume</div>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Appliquée au chiffrage. Jamais montrée au client : ni à l&apos;écran, ni dans le mail, ni sur le devis.
                      </p>
                      {origineDe("ajustement_volume") && <div className="mt-2">{origineDe("ajustement_volume")}</div>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => regler({ ajustement_volume: borner(v.ajustement_volume - 5) })} className={PAS} aria-label="Moins 5 %">−</button>
                      <div className="flex items-center rounded-xl border border-line bg-card px-2.5">
                        <input
                          type="number"
                          value={v.ajustement_volume}
                          min={AJUSTEMENT_MIN}
                          max={AJUSTEMENT_MAX}
                          onChange={(e) => regler({ ajustement_volume: borner(Number(e.target.value) || 0) })}
                          className="w-14 bg-transparent py-2 text-right text-sm font-semibold tabular-nums outline-none"
                          aria-label="Cote sur le volume, en pour cent"
                        />
                        <span className="pl-1 text-sm text-ink-soft">%</span>
                      </div>
                      <button onClick={() => regler({ ajustement_volume: borner(v.ajustement_volume + 5) })} className={PAS} aria-label="Plus 5 %">+</button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={AJUSTEMENT_MIN}
                    max={AJUSTEMENT_MAX}
                    step={1}
                    value={v.ajustement_volume}
                    onChange={(e) => regler({ ajustement_volume: Number(e.target.value) })}
                    className="mt-4 w-full accent-[var(--color-ink)]"
                    aria-label="Cote sur le volume"
                  />
                  <p className="mt-3 text-[13px]">
                    {v.ajustement_volume === 0 ? (
                      "Aucune correction : le chiffrage se fait sur le volume déclaré."
                    ) : (
                      <>
                        Un volume déclaré de <strong>30 m³</strong> est chiffré sur{" "}
                        <strong>{volumeChiffre(30, v.ajustement_volume).toLocaleString("fr-FR")} m³</strong>
                        {v.ajustement_volume > 0 ? " — une cote" : " — une décote"} de{" "}
                        {Math.abs(v.ajustement_volume)} %. Le client continue de lire 30 m³.
                      </>
                    )}
                  </p>
                </div>
              </>
            )}

            {onglet === "mail" && (
              <>
                <Champ label="Objet du mail" marque={origineDe("mail_objet")} aide="Laissé vide, l'objet du modèle s'applique. Les variables fonctionnent : {{client_nom}}, {{reference}}… et {{espace_nom}}, le nom de l'entreprise.">
                  <input
                    value={v.mail_objet}
                    onChange={(e) => regler({ mail_objet: e.target.value })}
                    placeholder="{{titre_demande}} — {{entreprise_nom}}"
                    className={SAISIE}
                  />
                </Champ>
                <Champ label="Mot d'accueil du mail" marque={origineDe("mail_message")} aide="Ajouté juste après « Bonjour », avant le texte du modèle. {{espace_nom}} y devient le nom de l'entreprise.">
                  <textarea
                    value={v.mail_message}
                    onChange={(e) => regler({ mail_message: e.target.value })}
                    placeholder={`Vous déménagez dans le cadre de votre mobilité chez ${general || brouillon.grand_compte ? "{{espace_nom}}" : brouillon.slug === "standard" ? "votre employeur" : brouillon.nom || "votre employeur"} : Bailly Déménagement s'occupe de tout.`}
                    rows={3}
                    className={`${SAISIE} resize-y leading-relaxed`}
                  />
                </Champ>
                <Champ label="Mention sur le devis" marque={origineDe("devis_mention")} aide="Une ligne ajoutée à l'encadré « Ce qu'il faut savoir » du PDF.">
                  <textarea
                    value={v.devis_mention}
                    onChange={(e) => regler({ devis_mention: e.target.value })}
                    placeholder="Prestation prise en charge dans le cadre de l'accord de mobilité."
                    rows={2}
                    className={`${SAISIE} resize-y leading-relaxed`}
                  />
                </Champ>
                {exemple && (
                  <ApercuMail
                    espace={exemple}
                    base={racine}
                    entreprise={entreprise}
                    legende={general ? `Aperçu avec ${exemple.nom}, pris en exemple` : undefined}
                  />
                )}
              </>
            )}
          </div>

          {/* ── Ce que voit le client — ou, pour les règles générales, qui elles concernent ── */}
          <div className="xl:sticky xl:top-4 xl:self-start">
            {general ? (
              <>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Espaces concernés</div>
                <div className="overflow-hidden rounded-2xl border border-line">
                  {grandsComptes.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => ouvrir(e)}
                      className="flex w-full items-center gap-3 border-b border-line bg-paper px-3.5 py-2.5 text-left transition last:border-0 hover:bg-card"
                    >
                      <Vignette espace={e} taille={28} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.nom}</span>
                      <span className={`shrink-0 text-[11.5px] ${e.propres.length ? "font-semibold text-brand-ink" : "text-ink-soft"}`}>
                        {e.propres.length ? `${e.propres.length} propre${e.propres.length > 1 ? "s" : ""}` : "suit tout"}
                      </span>
                    </button>
                  ))}
                  {grandsComptes.length === 0 && (
                    <p className="bg-paper px-4 py-5 text-center text-sm text-ink-soft">Aucun espace n&apos;est un grand compte.</p>
                  )}
                </div>
                <p className="mt-3 text-[12.5px] leading-snug text-ink-soft">
                  Ouvrez un espace pour régler un point rien que pour lui : il gardera ce réglage même si la règle générale change.
                </p>
              </>
            ) : (
              <>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Ce que voit le client</div>
                <ApercuAccueil espace={brouillon} />
              </>
            )}
            <ul className="mt-3 space-y-1.5 text-[12.5px] text-ink-soft">
              <li>{v.parcours === "express" ? "Devis express, sur une page." : "Devis complet, en étapes."}</li>
              <li>{v.afficher_estimation ? "Le prix s'affiche à la fin." : "Le prix n'est pas affiché."}</li>
              <li>{v.envoyer_devis ? "L'estimation part par e-mail." : "L'estimation n'est pas envoyée."}</li>
              {v.ajustement_volume !== 0 && (
                <li className="font-medium text-ink">
                  Volume chiffré à {v.ajustement_volume > 0 ? "+" : ""}
                  {v.ajustement_volume} % (invisible côté client).
                </li>
              )}
            </ul>
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4 md:px-6">
          <button
            onClick={enregistrer}
            disabled={enCours || !modifie}
            className="rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-shell transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enCours ? "…" : general ? "Enregistrer les règles" : nouveau ? "Créer l'espace" : "Enregistrer"}
          </button>
          {modifie && !enCours && !etat && <span className="text-sm text-ink-soft">Modifications non enregistrées</span>}
          {etat && (
            <span className={`text-sm font-medium ${etat.ton === "ok" ? "text-good" : "text-danger"}`} role={etat.ton === "erreur" ? "alert" : "status"}>
              {etat.ton === "ok" ? "✓ " : ""}
              {etat.texte}
            </span>
          )}
          {!general && (
            <button onClick={supprimer} disabled={enCours} className="ml-auto rounded-xl px-3 py-2 text-sm text-ink-soft transition hover:bg-danger-soft hover:text-danger">
              {nouveau ? "Annuler" : "Supprimer"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

/* ─────────────────────────── Accès RH ─────────────────────────── */

/** Un mot de passe à transmettre de vive voix ou par un canal sûr : sans caractères qui se confondent. */
function motDePasseAuHasard(): string {
  const signes = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tirage = new Uint32Array(14);
  crypto.getRandomValues(tirage);
  return [...tirage].map((n) => signes[n % signes.length]).join("");
}

/**
 * Les comptes RH d'un espace. L'équipe les crée ici et transmet elle-même les
 * identifiants : la plateforme n'envoie aucun mot de passe par e-mail.
 */
function AccesRh({
  espace,
  enregistre,
  racine,
  onCouts,
}: {
  espace: EspacePro;
  enregistre: boolean;
  racine: string;
  onCouts: (v: boolean) => void;
}) {
  const [comptes, setComptes] = useState<CompteRh[] | null>(null);
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [message, setMessage] = useState<{ ton: "ok" | "erreur"; texte: string } | null>(null);
  /** Les identifiants qui viennent d'être créés ou changés : affichés une fois, pour être transmis. */
  const [aTransmettre, setATransmettre] = useState<{ email: string; motDePasse: string } | null>(null);
  const [enCours, lancer] = useTransition();
  const adresse = `${racine}/rh/connexion`;

  useEffect(() => {
    if (!enregistre) return;
    let annule = false;
    comptesRh(espace.id).then((r) => {
      if (annule) return;
      if (r.ok) setComptes(r.comptes);
      else setMessage({ ton: "erreur", texte: r.erreur });
    });
    return () => {
      annule = true;
    };
  }, [espace.id, enregistre]);

  if (!enregistre)
    return <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-soft">Enregistrez d&apos;abord l&apos;espace : ses accès RH se créent ensuite.</p>;

  const creer = () =>
    lancer(async () => {
      const r = await ajouterCompteRh(espace.id, { email, nom, motDePasse });
      if (!r.ok) return setMessage({ ton: "erreur", texte: r.erreur });
      setComptes((c) => [...(c ?? []), r.compte].sort((a, b) => a.email.localeCompare(b.email)));
      setATransmettre({ email: r.compte.email, motDePasse });
      setEmail("");
      setNom("");
      setMotDePasse("");
      setMessage({ ton: "ok", texte: "Accès créé" });
    });
  const retirer = (c: CompteRh) => {
    if (!window.confirm(`Retirer l'accès de ${c.email} ? Il ne pourra plus se connecter à l'espace RH.`)) return;
    lancer(async () => {
      const r = await retirerCompteRh(c.id);
      if (!r.ok) return setMessage({ ton: "erreur", texte: r.erreur });
      setComptes((liste) => (liste ?? []).filter((x) => x.id !== c.id));
      setMessage({ ton: "ok", texte: "Accès retiré" });
    });
  };
  const renouveler = (c: CompteRh) => {
    if (!window.confirm(`Donner un nouveau mot de passe à ${c.email} ? L'ancien cessera de fonctionner.`)) return;
    const nouveau = motDePasseAuHasard();
    lancer(async () => {
      const r = await nouveauMotDePasseRh(c.id, nouveau);
      if (!r.ok) return setMessage({ ton: "erreur", texte: r.erreur });
      setATransmettre({ email: c.email, motDePasse: nouveau });
      setMessage({ ton: "ok", texte: "Mot de passe changé" });
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-sm font-semibold">L&apos;espace RH de {espace.nom}</div>
          <p className="mt-0.5 text-xs leading-snug text-ink-soft">
            Les RH s&apos;y connectent à l&apos;adresse <span className="font-mono text-ink">{adresse.replace(/^https?:\/\//, "")}</span> — la même pour toutes les
            entreprises. C&apos;est leur compte qui ouvre l&apos;espace de {espace.nom}, à ses couleurs.
          </p>
        </div>
        <a href={`/rh?apercu=${encodeURIComponent(espace.id)}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-shell transition active:scale-[0.98]">
          Voir l&apos;espace RH ↗
        </a>
      </div>

      <Reglage
        titre="Montrer le coût estimé aux RH"
        aide="Coché, les RH voient le montant estimé de chaque déménagement et le budget de la période. La cote sur le volume, elle, ne leur est jamais montrée."
        actif={espace.rh_couts}
        onChange={onCouts}
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">Comptes RH</span>
          {message && <span className={`text-xs font-medium ${message.ton === "ok" ? "text-good" : "text-danger"}`}>{message.ton === "ok" ? "✓ " : ""}{message.texte}</span>}
        </div>
        <div className="overflow-hidden rounded-2xl border border-line">
          {comptes === null ? (
            <p className="bg-paper px-4 py-5 text-center text-sm text-ink-soft">Chargement…</p>
          ) : comptes.length === 0 ? (
            <p className="bg-paper px-4 py-5 text-center text-sm text-ink-soft">Aucun compte pour l&apos;instant : personne chez {espace.nom} n&apos;a accès à l&apos;espace RH.</p>
          ) : (
            comptes.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-paper px-4 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.nom || c.email}</div>
                  <div className="truncate text-xs text-ink-soft">
                    {c.nom ? `${c.email} · ` : ""}
                    {c.derniere_connexion ? `dernière connexion le ${new Date(c.derniere_connexion).toLocaleDateString("fr-FR")}` : "jamais connecté"}
                  </div>
                </div>
                <button onClick={() => renouveler(c)} disabled={enCours} className="text-xs font-medium text-brand-ink transition hover:text-ink">Nouveau mot de passe</button>
                <button onClick={() => retirer(c)} disabled={enCours} className="text-xs font-medium text-ink-soft transition hover:text-danger">Retirer</button>
              </div>
            ))
          )}
        </div>
      </div>

      {aTransmettre && (
        <div className="rounded-2xl border border-brand bg-brand-soft px-4 py-3.5 text-sm">
          <div className="font-semibold">À transmettre à {aTransmettre.email}</div>
          <p className="mt-0.5 text-xs text-ink-soft">Ce mot de passe ne sera plus affiché. Transmettez-le vous-même : la plateforme n&apos;envoie pas d&apos;identifiants par e-mail.</p>
          <div className="mt-2.5 grid gap-1 font-mono text-[13px]">
            <span>{adresse.replace(/^https?:\/\//, "")}</span>
            <span>{aTransmettre.email}</span>
            <span>{aTransmettre.motDePasse}</span>
          </div>
          <button
            onClick={() => void navigator.clipboard?.writeText(`Espace RH Bailly Déménagement\n${adresse}\nIdentifiant : ${aTransmettre.email}\nMot de passe : ${aTransmettre.motDePasse}`)}
            className="mt-3 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-shell"
          >
            Copier les identifiants
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-paper p-4 md:p-5">
        <div className="text-sm font-semibold">Ouvrir un accès</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="prenom.nom@entreprise.fr" className={SAISIE} aria-label="Adresse e-mail du RH" />
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Prénom Nom (facultatif)" className={SAISIE} aria-label="Nom du RH" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} placeholder="Mot de passe (10 caractères au moins)" className={`${SAISIE} min-w-[220px] flex-1 font-mono`} aria-label="Mot de passe" />
          <button onClick={() => setMotDePasse(motDePasseAuHasard())} className="rounded-xl border border-line bg-card px-3.5 text-sm font-medium transition hover:border-ink">Générer</button>
          <button onClick={creer} disabled={enCours || !email || motDePasse.length < 10} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-shell transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">
            {enCours ? "…" : "Créer l'accès"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── Briques ─────────────────────────── */

const SAISIE =
  "w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition focus:border-accent";
const PAS =
  "flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-card text-base font-medium transition hover:border-ink active:scale-95";

const borner = (n: number) => Math.min(AJUSTEMENT_MAX, Math.max(AJUSTEMENT_MIN, Math.round(n)));

function basculer(liste: QuestionCle[], cle: QuestionCle, masquer: boolean): QuestionCle[] {
  const sans = liste.filter((c) => c !== cle);
  return masquer ? [...sans, cle] : sans;
}

function Champ({ label, aide, marque, children }: { label: string; aide?: string; marque?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium">{label}</span>
        {marque}
      </div>
      {children}
      {aide && <p className="mt-1.5 text-xs leading-snug text-ink-soft">{aide}</p>}
    </div>
  );
}

function Bascule({ actif, onChange, label }: { actif: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      onClick={() => onChange(!actif)}
      className="inline-flex shrink-0 items-center gap-2.5 text-sm font-medium"
    >
      <span className={`relative h-6 w-11 rounded-full transition-colors ${actif ? "bg-good" : "bg-line-strong"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${actif ? "left-[22px]" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

function Reglage({
  titre,
  aide,
  actif,
  marque,
  onChange,
}: {
  titre: string;
  aide: string;
  actif: boolean;
  marque?: ReactNode;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-paper px-4 py-3.5">
      <div>
        <div className="text-sm font-semibold">{titre}</div>
        <p className="mt-0.5 text-xs leading-snug text-ink-soft">{aide}</p>
        {marque && <div className="mt-2">{marque}</div>}
      </div>
      <Bascule actif={actif} onChange={onChange} />
    </div>
  );
}

function Segments({
  valeur,
  options,
  onChange,
}: {
  valeur: string;
  options: [string, string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map(([cle, titre, texte]) => (
        <button
          key={cle}
          onClick={() => onChange(cle)}
          aria-pressed={valeur === cle}
          className={`rounded-2xl border px-4 py-3 text-left transition ${
            valeur === cle ? "border-ink bg-brand-soft" : "border-line bg-paper hover:border-line-strong"
          }`}
        >
          <div className="text-sm font-semibold">{titre}</div>
          <div className="mt-0.5 text-xs text-ink-soft">{texte}</div>
        </button>
      ))}
    </div>
  );
}

/** Le logo d'un espace, ou ses initiales sur sa couleur. */
function Vignette({ espace, taille }: { espace: EspacePro; taille: number }) {
  const p = palette(espace.couleur);
  const initiales = espace.nom
    .replace(/^espace\s+/i, "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase())
    .join("");
  const style: CSSProperties = { width: taille, height: taille };
  if (espace.logo)
    return (
      <span className="flex shrink-0 items-center justify-center rounded-xl border border-line bg-white p-1.5" style={style}>
        {/* eslint-disable-next-line @next/next/no-img-element -- logo téléversé, servi par notre API */}
        <img src={urlLogo(espace) ?? ""} alt="" className="max-h-full max-w-full object-contain" />
      </span>
    );
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl text-[13px] font-bold"
      style={{ ...style, background: p.accent, color: p.dessus }}
    >
      {initiales || "?"}
    </span>
  );
}

function LigneEspace({
  espace,
  regles,
  actif,
  n,
  brouillon = false,
  onClick,
}: {
  espace: EspacePro;
  regles: Regles;
  actif: boolean;
  n: number;
  brouillon?: boolean;
  onClick: () => void;
}) {
  // La ligne dit ce que l'espace applique réellement, règles générales comprises.
  const applique = appliquerRegles(espace, regles);
  const ecarts = espace.grand_compte ? espace.propres.length : 0;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
        actif ? "border-ink bg-card" : "border-line bg-card hover:border-line-strong"
      }`}
    >
      <Vignette espace={espace} taille={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{espace.nom || "Espace sans nom"}</span>
          {!espace.actif && <span className="shrink-0 rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">inactif</span>}
          {brouillon && <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-ink">nouveau</span>}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-soft">
          {espace.grand_compte
            ? ecarts === 0
              ? "règles générales"
              : `${ecarts} réglage${ecarts > 1 ? "s" : ""} propre${ecarts > 1 ? "s" : ""}`
            : "indépendant"}
          {" · "}
          {applique.afficher_estimation ? "prix affiché" : "prix masqué"}
          {applique.ajustement_volume !== 0 ? ` · volume ${applique.ajustement_volume > 0 ? "+" : ""}${applique.ajustement_volume} %` : ""}
        </span>
      </span>
      {n > 0 && (
        <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[11px] font-semibold tabular-nums" title={`${n} demande${n > 1 ? "s" : ""} reçue${n > 1 ? "s" : ""}`}>
          {n}
        </span>
      )}
    </button>
  );
}

/**
 * L'accueil de l'espace, en miniature. Toujours en clair, quel que soit le
 * thème de l'espace équipe : c'est la page du client qu'on regarde.
 */
function ApercuAccueil({ espace }: { espace: EspacePro }) {
  // Les jetons de l'espace — ou ceux de Bailly, redits en clair pour ne pas
  // hériter du thème sombre de l'espace équipe.
  const clair = (themeEspace(espace.couleur) ?? {
    "--color-brand": COULEUR_BAILLY,
    "--color-sur-brand": "#1b1a18",
    "--color-brand-ink": "#8a6f00",
  }) as CSSProperties;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-[#f6f5f2] p-5 text-[#1b1a18]" style={clair}>
      <div className="flex items-center gap-2.5">
        {espace.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo téléversé, servi par notre API
          <img src={urlLogo(espace) ?? ""} alt={espace.nom} className="h-7 max-w-[90px] object-contain" />
        ) : (
          <span className="max-w-[130px] truncate rounded-lg bg-brand px-2 py-1 text-[11.5px] font-bold text-sur-brand">{nomEnseigne(espace)}</span>
        )}
        <span className="h-5 w-px bg-[#dad8d1]" />
        <Image src="/marque/bailly-logo.svg" alt="Bailly Déménagement" width={200} height={64} className="h-auto w-[78px]" />
      </div>
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-ink">
        {espace.slug === "standard" ? "Espace pro" : `Espace ${espace.nom.replace(/^espace\s+/i, "")}`}
      </p>
      <p className="mt-2 text-[20px] font-bold leading-[1.12] tracking-[-0.02em]">{titreDe(espace)}</p>
      <p className="mt-2.5 line-clamp-4 text-[12.5px] leading-relaxed text-[#615f68]">{messageDe(espace)}</p>
      <span className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-brand px-4 text-[12.5px] font-semibold text-sur-brand">
        Commencer ma demande →
      </span>
    </div>
  );
}

/** Le mail type, habillé aux couleurs de l'espace. */
function ApercuMail({
  espace,
  base,
  entreprise,
  legende,
}: {
  espace: EspacePro;
  base: string;
  entreprise: Entreprise;
  legende?: string;
}) {
  const nom = entreprise.nom || "Bailly Déménagement";
  const avecPrix = espace.envoyer_devis;
  const { sujet, html } = rendreEmail(
    { name: "Aperçu", sujet: "{{titre_demande}} — {{entreprise_nom}}", contenu: MODELE_APERCU },
    {
      vars: {
        client_nom: "Camille Durand",
        ville_depart: "Lyon",
        ville_arrivee: "Toulouse",
        volume: 30,
        distance: 540,
        date: "2026-11-15",
        entreprise_nom: nom,
        entreprise_tel: entreprise.tel || "01 69 10 35 20",
        entreprise_email: entreprise.email || "",
        ...(avecPrix
          ? { reference: "DEV-2026-0042", validite: "15/12/2026", montant_ht: 1800, montant_ttc: 2160, lien_estimation: "#" }
          : {}),
      },
      lignes: avecPrix
        ? [
            { label: "Transport et manutention", amount: 1740 },
            { label: "Garantie dommages standard", amount: 60 },
          ]
        : undefined,
      base,
      entreprise: { nom, email: entreprise.email ?? undefined, tel: entreprise.tel || "01 69 10 35 20" },
      pieceJointe: avecPrix,
      espace: {
        nom: nomEnseigne(espace),
        couleur: espace.couleur,
        // Dans l'aperçu, le logo vient de la page ouverte : l'adresse publique
        // du site peut pointer vers une version qui ne l'a pas encore.
        logo: espace.logo ? urlLogo(espace, typeof window === "undefined" ? base : window.location.origin) : null,
        objet: espace.mail_objet,
        message: espace.mail_message,
      },
    },
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="bg-paper px-4 py-3">
        <div className="text-sm font-medium">{legende ?? "Aperçu du mail envoyé au client"}</div>
        <div className="truncate text-xs text-ink-soft">{sujet}</div>
      </div>
      <iframe title="Aperçu du mail" srcDoc={html} sandbox="" className="h-[560px] w-full bg-white" />
    </div>
  );
}
