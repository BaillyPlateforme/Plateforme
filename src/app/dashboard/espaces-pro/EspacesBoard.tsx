"use client";

import Image from "next/image";
import { useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
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
} from "@/lib/espaces";
import { effacerEspace, enleverLogo, sauverEspace, televerserLogo } from "@/lib/actions/espaces";
import { rendreEmail } from "@/lib/email-render";

type Entreprise = { nom: string | null; email: string | null; tel: string | null };

const ONGLETS = [
  { cle: "identite", label: "Identité" },
  { cle: "parcours", label: "Parcours" },
  { cle: "prix", label: "Volume et prix" },
  { cle: "mail", label: "Mail et devis" },
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
  demandes,
  base,
  entreprise,
}: {
  espaces: EspacePro[];
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

  const origine = typeof window !== "undefined" ? window.location.origin : "";
  const racine = base || origine;
  const nouveau = !liste.some((e) => e.id === brouillon.id);
  const enregistre = liste.find((e) => e.id === brouillon.id);
  const modifie = nouveau || JSON.stringify(enregistre) !== JSON.stringify(brouillon);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? liste.filter((e) => e.nom.toLowerCase().includes(q) || e.slug.includes(q)) : liste;
  }, [liste, recherche]);

  const patch = (p: Partial<EspacePro>) => {
    setBrouillon((b) => ({ ...b, ...p }));
    setEtat(null);
  };

  function ouvrir(e: EspacePro) {
    setBrouillon(e);
    setEtat(null);
  }

  function creer() {
    setBrouillon({ ...espaceVide("Nouvel espace"), id: `nouveau-${Date.now()}`, slug: "nouvel-espace" });
    setOnglet("identite");
    setEtat(null);
  }

  function enregistrer() {
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

  const lien = `${racine}/pro/${brouillon.slug}`;

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

        <div className="space-y-1.5">
          {nouveau && <LigneEspace espace={brouillon} actif n={0} brouillon onClick={() => {}} />}
          {visibles.map((e) => (
            <LigneEspace
              key={e.id}
              espace={e.id === brouillon.id ? brouillon : e}
              actif={e.id === brouillon.id}
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
        <header className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 md:px-6">
          <Vignette espace={brouillon} taille={46} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-semibold">{brouillon.nom || "Espace sans nom"}</div>
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
              {!nouveau && (
                <a href={`/pro/${brouillon.slug}`} target="_blank" rel="noreferrer" className="font-medium text-brand-ink transition hover:text-ink">
                  Ouvrir ↗
                </a>
              )}
            </div>
          </div>
          <Bascule
            actif={brouillon.actif}
            onChange={(actif) => patch({ actif })}
            label={brouillon.actif ? "Actif" : "Inactif"}
          />
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-line px-4 md:px-5">
          {ONGLETS.map((o) => (
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
            {onglet === "identite" && (
              <>
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
                  <Champ label="Lien" aide="Ce qui suit /pro/ dans l'adresse. Le changer casse l'ancien lien.">
                    <div className="flex items-center rounded-xl border border-line bg-paper focus-within:border-accent">
                      <span className="shrink-0 pl-3 text-sm text-ink-soft">/pro/</span>
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

            {onglet === "parcours" && (
              <>
                <Champ label="Formulaire proposé">
                  <Segments
                    valeur={brouillon.parcours}
                    options={[
                      ["complet", "Devis complet", "Sept étapes : accès, prestations, inventaire."],
                      ["express", "Devis express", "Une page : contact, trajet, date, volume."],
                    ]}
                    onChange={(v) => patch({ parcours: v as EspacePro["parcours"] })}
                  />
                </Champ>

                <Champ label="Formule" aide="Quand l'entreprise prend en charge une formule précise, elle s'applique sans que le salarié ait à choisir.">
                  <select
                    value={brouillon.formule_imposee}
                    onChange={(e) => patch({ formule_imposee: e.target.value as EspacePro["formule_imposee"] })}
                    className={`${SAISIE} sm:w-80`}
                  >
                    <option value="">Le client choisit sa formule</option>
                    <option value="eco">Économique, imposée</option>
                    <option value="standard">Standard, imposée</option>
                    <option value="luxe">Premium, imposée</option>
                  </select>
                </Champ>

                <div>
                  <div className="mb-1 text-sm font-medium">Questions posées</div>
                  <p className="mb-3 text-xs text-ink-soft">
                    Décochez ce que cet espace ne demande pas. Une question retirée prend sa valeur par défaut.
                  </p>
                  <div className="space-y-4">
                    {[...new Set(QUESTIONS.map((q) => q.groupe))].map((groupe) => (
                      <div key={groupe}>
                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{groupe}</div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {QUESTIONS.filter((q) => q.groupe === groupe).map((q) => {
                            const posee = !brouillon.questions_masquees.includes(q.cle);
                            // L'étape Prestations disparaît d'office quand la formule est imposée.
                            const force = q.cle === "formules" && !!brouillon.formule_imposee;
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
                                  onChange={(e) => patch({ questions_masquees: basculer(brouillon.questions_masquees, q.cle, !e.target.checked) })}
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
                    actif={brouillon.afficher_estimation}
                    onChange={(v) => patch({ afficher_estimation: v })}
                  />
                  <Reglage
                    titre="Envoyer l'estimation au client par e-mail"
                    aide="Décoché, il reçoit un accusé de réception sans prix ni pièce jointe. Un devis envoyé à la main par l'équipe part toujours."
                    actif={brouillon.envoyer_devis}
                    onChange={(v) => patch({ envoyer_devis: v })}
                  />
                  <Reglage
                    titre="Afficher le volume calculé"
                    aide="Décoché, le client liste ses meubles ou envoie ses photos sans voir le total en mètres cubes."
                    actif={brouillon.afficher_volume}
                    onChange={(v) => patch({ afficher_volume: v })}
                  />
                </div>

                {!brouillon.afficher_estimation && (
                  <Champ label="Mot de la fin" aide="Ce que le client lit à la place du prix.">
                    <textarea
                      value={brouillon.message_fin}
                      onChange={(e) => patch({ message_fin: e.target.value })}
                      placeholder={messageFinDe({ ...brouillon, message_fin: "" })}
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
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => patch({ ajustement_volume: borner(brouillon.ajustement_volume - 5) })} className={PAS} aria-label="Moins 5 %">−</button>
                      <div className="flex items-center rounded-xl border border-line bg-card px-2.5">
                        <input
                          type="number"
                          value={brouillon.ajustement_volume}
                          min={AJUSTEMENT_MIN}
                          max={AJUSTEMENT_MAX}
                          onChange={(e) => patch({ ajustement_volume: borner(Number(e.target.value) || 0) })}
                          className="w-14 bg-transparent py-2 text-right text-sm font-semibold tabular-nums outline-none"
                          aria-label="Cote sur le volume, en pour cent"
                        />
                        <span className="pl-1 text-sm text-ink-soft">%</span>
                      </div>
                      <button onClick={() => patch({ ajustement_volume: borner(brouillon.ajustement_volume + 5) })} className={PAS} aria-label="Plus 5 %">+</button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={AJUSTEMENT_MIN}
                    max={AJUSTEMENT_MAX}
                    step={1}
                    value={brouillon.ajustement_volume}
                    onChange={(e) => patch({ ajustement_volume: Number(e.target.value) })}
                    className="mt-4 w-full accent-[var(--color-ink)]"
                    aria-label="Cote sur le volume"
                  />
                  <p className="mt-3 text-[13px]">
                    {brouillon.ajustement_volume === 0 ? (
                      "Aucune correction : le chiffrage se fait sur le volume déclaré."
                    ) : (
                      <>
                        Un volume déclaré de <strong>30 m³</strong> est chiffré sur{" "}
                        <strong>{volumeChiffre(30, brouillon.ajustement_volume).toLocaleString("fr-FR")} m³</strong>
                        {brouillon.ajustement_volume > 0 ? " — une cote" : " — une décote"} de{" "}
                        {Math.abs(brouillon.ajustement_volume)} %. Le client continue de lire 30 m³.
                      </>
                    )}
                  </p>
                </div>
              </>
            )}

            {onglet === "mail" && (
              <>
                <Champ label="Objet du mail" aide="Laissé vide, l'objet du modèle s'applique. Les variables fonctionnent : {{client_nom}}, {{reference}}…">
                  <input
                    value={brouillon.mail_objet}
                    onChange={(e) => patch({ mail_objet: e.target.value })}
                    placeholder="{{titre_demande}} — {{entreprise_nom}}"
                    className={SAISIE}
                  />
                </Champ>
                <Champ label="Mot d'accueil du mail" aide="Ajouté juste après « Bonjour », avant le texte du modèle.">
                  <textarea
                    value={brouillon.mail_message}
                    onChange={(e) => patch({ mail_message: e.target.value })}
                    placeholder={`Vous déménagez dans le cadre de votre mobilité chez ${brouillon.slug === "standard" ? "votre employeur" : brouillon.nom || "votre employeur"} : Bailly Déménagement s'occupe de tout.`}
                    rows={3}
                    className={`${SAISIE} resize-y leading-relaxed`}
                  />
                </Champ>
                <Champ label="Mention sur le devis" aide="Une ligne ajoutée à l'encadré « Ce qu'il faut savoir » du PDF.">
                  <textarea
                    value={brouillon.devis_mention}
                    onChange={(e) => patch({ devis_mention: e.target.value })}
                    placeholder="Prestation prise en charge dans le cadre de l'accord de mobilité."
                    rows={2}
                    className={`${SAISIE} resize-y leading-relaxed`}
                  />
                </Champ>
                <ApercuMail espace={brouillon} base={racine} entreprise={entreprise} />
              </>
            )}
          </div>

          {/* ── Ce que voit le client ── */}
          <div className="xl:sticky xl:top-4 xl:self-start">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Ce que voit le client</div>
            <ApercuAccueil espace={brouillon} />
            <ul className="mt-3 space-y-1.5 text-[12.5px] text-ink-soft">
              <li>{brouillon.parcours === "express" ? "Devis express, sur une page." : "Devis complet, en étapes."}</li>
              <li>{brouillon.afficher_estimation ? "Le prix s'affiche à la fin." : "Le prix n'est pas affiché."}</li>
              <li>{brouillon.envoyer_devis ? "L'estimation part par e-mail." : "L'estimation n'est pas envoyée."}</li>
              {brouillon.ajustement_volume !== 0 && (
                <li className="font-medium text-ink">
                  Volume chiffré à {brouillon.ajustement_volume > 0 ? "+" : ""}
                  {brouillon.ajustement_volume} % (invisible côté client).
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
            {enCours ? "…" : nouveau ? "Créer l'espace" : "Enregistrer"}
          </button>
          {modifie && !enCours && !etat && <span className="text-sm text-ink-soft">Modifications non enregistrées</span>}
          {etat && (
            <span className={`text-sm font-medium ${etat.ton === "ok" ? "text-good" : "text-danger"}`} role={etat.ton === "erreur" ? "alert" : "status"}>
              {etat.ton === "ok" ? "✓ " : ""}
              {etat.texte}
            </span>
          )}
          <button onClick={supprimer} disabled={enCours} className="ml-auto rounded-xl px-3 py-2 text-sm text-ink-soft transition hover:bg-danger-soft hover:text-danger">
            {nouveau ? "Annuler" : "Supprimer"}
          </button>
        </footer>
      </section>
    </div>
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

function Champ({ label, aide, children }: { label: string; aide?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
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

function Reglage({ titre, aide, actif, onChange }: { titre: string; aide: string; actif: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-paper px-4 py-3.5">
      <div>
        <div className="text-sm font-semibold">{titre}</div>
        <p className="mt-0.5 text-xs leading-snug text-ink-soft">{aide}</p>
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
  actif,
  n,
  brouillon = false,
  onClick,
}: {
  espace: EspacePro;
  actif: boolean;
  n: number;
  brouillon?: boolean;
  onClick: () => void;
}) {
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
          {espace.afficher_estimation ? "prix affiché" : "prix masqué"}
          {espace.ajustement_volume !== 0 ? ` · volume ${espace.ajustement_volume > 0 ? "+" : ""}${espace.ajustement_volume} %` : ""}
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
function ApercuMail({ espace, base, entreprise }: { espace: EspacePro; base: string; entreprise: Entreprise }) {
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
        <div className="text-sm font-medium">Aperçu du mail envoyé au client</div>
        <div className="truncate text-xs text-ink-soft">{sujet}</div>
      </div>
      <iframe title="Aperçu du mail" srcDoc={html} sandbox="" className="h-[560px] w-full bg-white" />
    </div>
  );
}
