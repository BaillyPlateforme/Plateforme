"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icone } from "@/ui/icones";
import { Telephone } from "@/crm/messages/elements";
import { composerEmailCrm, remplir } from "@/crm/messages/rendu";
import { envoyerMaintenant, preparerEnvoi, type PreparationEnvoi, type Retour } from "./actions";
import type { CanalEnvoi } from "./envoi";
import { blocRelance, elementsChoisis, MARQUE_LISTE, texteAEnvoyer, texteLisible, varsRelance, versTexteCarte } from "./courrier";
import { canalEnClair, defCourrier, libelleCanal, type Canal } from "./regles";
import { IconeCanal } from "./Section";
import Piste from "@/crm/suivi/Piste";
import s from "./panneau.module.css";

/*
 * L'écran d'envoi d'une relance (David, 08/11/2026 : « on doit pouvoir voir un
 * mail ultra design qui s'affiche en dessous, et cocher les demandes que l'on
 * intègre dans la relance, ou si l'on met tout » ; puis « la possibilité de
 * personnaliser la relance »). Un volet à droite :
 *
 *   1. en haut, ce que la relance demande, élément par élément, à cocher —
 *      tout par défaut, comme la veille, sauf ce qui est facultatif ;
 *   2. dessous, le message tel que le client le recevra, recomposé dans le
 *      navigateur à chaque case et à chaque lettre (messages/rendu.ts et
 *      courrier.ts, le code même de l'envoi), en e-mail et en SMS ;
 *      « Personnaliser » rend l'objet et le texte modifiables pour CET envoi,
 *      tels que le client les lit ; la liste y garde sa place, marquée
 *      « [Ce que nous vous demandons] », et suit les cases ;
 *   3. en pied, ce que deviendra l'envoi (ENVOI_MODE) et « Envoyer ».
 *
 * Une carte sans texte ne bloque plus un envoi à la main : le volet s'ouvre
 * sur le texte proposé par la plateforme, « à relire avant l'envoi », et
 * n'envoie qu'une fois chaque texte proposé affiché. Ce qui bloque vraiment
 * (dossier « ne pas relancer », règle désactivée, carte désactivée par
 * Bailly, pas d'adresse ou de numéro) est dit, et rien ne part.
 *
 * En aperçu (l'œil d'une carte du Kanban), rien ne se coche ni ne part ;
 * « Préparer l'envoi » passe à l'écran d'envoi quand la relance peut partir.
 */

const jourLong = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
type Texte = { objet: string; corps: string };

export default function PanneauEnvoi({
  cle,
  mode: modeInitial,
  fermer,
  envoye,
}: {
  cle: string;
  mode: "envoi" | "apercu";
  fermer: () => void;
  /** Après un envoi réussi : le compte rendu, que l'appelant affiche (le volet se ferme). */
  envoye?: (r: Retour) => void;
}) {
  const [prep, setPrep] = useState<PreparationEnvoi | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [mode, setMode] = useState(modeInitial);
  const [choix, setChoix] = useState<string[]>([]);
  const [onglet, setOnglet] = useState<Canal>("email");
  const [vus, setVus] = useState<Canal[]>([]);
  const [optionnels, setOptionnels] = useState<Canal[]>([]);
  /** Le texte de cet envoi, par canal, tel que le client le lit ; absent : celui de la carte. */
  const [textes, setTextes] = useState<Partial<Record<Canal, Texte>>>({});
  const [enregistrer, setEnregistrer] = useState<Partial<Record<Canal, boolean>>>({});
  const [retour, setRetour] = useState<Retour | null>(null);
  const [enCours, demarrer] = useTransition();
  const fermerRef = useRef<HTMLButtonElement>(null);
  const zone = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let vivant = true;
    preparerEnvoi(cle)
      .then((r) => {
        if (!vivant) return;
        if (!r.ok) return setErreur(r.erreur);
        const p = r.preparation;
        setPrep(p);
        const choisis = p.relance.demande.elements.filter((e) => !e.facultatif);
        setChoix(choisis.map((e) => e.id));
        const premier = p.canaux.find((c) => !c.optionnel)?.canal ?? p.canaux[0]?.canal ?? "email";
        setOnglet(premier);
        setVus([premier]);
        // Une carte sans texte : le volet s'ouvre sur le texte proposé, déjà en « Personnaliser ».
        const vars = choisis.length ? varsRelance(p.relance.type, p.vars, choisis) : p.vars;
        setTextes(Object.fromEntries(p.canaux.filter((c) => c.etat === "vide").map((c) => [c.canal, lisible(c, vars)])));
      })
      .catch(() => vivant && setErreur("La relance ne se lit pas. Réessayez dans un instant."));
    return () => {
      vivant = false;
    };
  }, [cle]);

  useEffect(() => {
    fermerRef.current?.focus();
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("keydown", echap);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", echap);
      document.body.style.overflow = avant;
    };
  }, [fermer]);

  const r = prep?.relance;
  const def = r ? defCourrier(r.type) : null;
  const elements = useMemo(() => r?.demande.elements ?? [], [r]);
  const requis = elements.filter((e) => !e.facultatif);
  // En aperçu, ce que la veille enverrait : tout, sauf le facultatif.
  const choisis = useMemo(() => (!r ? [] : mode === "apercu" ? elements.filter((e) => !e.facultatif) : elementsChoisis(r.demande, choix)), [mode, r, elements, choix]);
  const toutRequis = requis.every((e) => choisis.some((x) => x.id === e.id));
  const rienCoche = mode === "envoi" && elements.length > 0 && choisis.length === 0;
  const vars = useMemo(() => (prep && r && choisis.length ? varsRelance(r.type, prep.vars, choisis) : (prep?.vars ?? {})), [prep, r, choisis]);

  // Ce qui dépend des cases ({montant}, {pieces}) suit aussi dans un texte personnalisé : l'ancienne valeur y est remplacée.
  const precedentes = useRef<Record<string, string>>({});
  useEffect(() => {
    const avant = precedentes.current;
    precedentes.current = { montant: vars.montant ?? "", pieces: vars.pieces ?? "" };
    const changees = (["montant", "pieces"] as const).filter((k) => avant[k] && vars[k] && avant[k] !== vars[k]);
    if (!changees.length) return;
    setTextes((t) =>
      Object.fromEntries(
        Object.entries(t).map(([k, x]) => [k, changees.reduce((y, v) => ({ objet: y.objet.split(avant[v]).join(vars[v]), corps: y.corps.split(avant[v]).join(vars[v]) }), x as Texte)]),
      ),
    );
  }, [vars]);

  const canal = prep?.canaux.find((c) => c.canal === onglet) ?? prep?.canaux[0] ?? null;
  const texteDe = useCallback(
    (c: CanalEnvoi) => {
      const t = textes[c.canal];
      return t ? { objet: t.objet, corps: texteAEnvoyer(t.corps) } : { objet: c.objet, corps: c.corps };
    },
    [textes],
  );
  const initial = (c: CanalEnvoi) => lisible(c, vars);
  const modifie = (c: CanalEnvoi) => {
    const t = textes[c.canal];
    if (!t) return false;
    const i = initial(c);
    return t.corps.trim() !== i.corps.trim() || t.objet.trim() !== i.objet.trim();
  };

  // Le message de l'onglet, recomposé à chaque case et à chaque lettre : le même code que l'envoi.
  const textesDiffere = useDeferredValue(textes);
  const message = useMemo(() => {
    if (!prep || !r || !canal) return null;
    const t = textesDiffere[canal.canal];
    const m = t ? { objet: t.objet, corps: texteAEnvoyer(t.corps) } : { objet: canal.objet, corps: canal.corps };
    if (canal.canal === "sms") return { sujet: null, html: null, texte: remplir(m.corps, vars) };
    const bloc = choisis.length ? blocRelance(r.type, r.demande, choisis, prep.liens) : undefined;
    return composerEmailCrm(m, vars, prep.contexte, { bloc, surtitre: prep.surtitre });
  }, [prep, r, canal, textesDiffere, vars, choisis]);

  const choisir = (k: Canal) => {
    setOnglet(k);
    setVus((v) => (v.includes(k) ? v : [...v, k]));
  };
  const basculer = (id: string) => setChoix((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const toutInclure = () => setChoix(toutRequis ? [] : [...new Set([...choix, ...requis.map((e) => e.id)])]);
  const personnaliser = (c: CanalEnvoi) => setTextes((t) => ({ ...t, [c.canal]: initial(c) }));
  const revenir = (c: CanalEnvoi) => {
    setEnregistrer((x) => ({ ...x, [c.canal]: false }));
    setTextes((t) => {
      // Une carte vide revient au texte proposé ; une carte prête, à son propre texte.
      if (c.etat === "vide") return { ...t, [c.canal]: initial(c) };
      const { [c.canal]: _retire, ...reste } = t;
      void _retire;
      return reste;
    });
  };
  const modifier = (k: Canal, champ: keyof Texte, v: string) => setTextes((t) => ({ ...t, [k]: { ...(t[k] as Texte), [champ]: v } }));
  const insererListe = (k: Canal) => {
    const t = textes[k];
    const z = zone.current;
    if (!t) return;
    const pos = z?.selectionStart ?? t.corps.length;
    const morceau = k === "email" ? `\n\n${MARQUE_LISTE}\n\n` : ` ${MARQUE_LISTE} `;
    modifier(k, "corps", `${t.corps.slice(0, pos)}${morceau}${t.corps.slice(pos)}`.replace(/\n{3,}/g, "\n\n"));
  };

  // Les canaux de cet envoi : prêts, ou vides avec leur texte relu ; le SMS de « Ce qui manque » s'il est coché.
  const canauxEnvoi = (prep?.canaux ?? []).filter((c) => (!c.optionnel || optionnels.includes(c.canal)) && (c.etat === "pret" || (c.etat === "vide" && !!textes[c.canal])));
  const aRelire = canauxEnvoi.filter((c) => c.etat === "vide" && !vus.includes(c.canal));
  const personnalisee = canauxEnvoi.some(modifie);
  const analyses = Object.fromEntries(
    (prep?.canaux ?? []).filter((c) => textes[c.canal]).map((c) => [c.canal, versTexteCarte({ objet: textes[c.canal]!.objet, corps: textes[c.canal]!.corps }, { objet: c.objet, corps: c.corps }, vars, c.carte.variables, c.canal)]),
  ) as Partial<Record<Canal, ReturnType<typeof versTexteCarte>>>;
  const peutEnvoyer = !!prep?.envoyable && !rienCoche && canauxEnvoi.length > 0 && !enCours;

  const envoyer = () => {
    if (aRelire.length) return choisir(aRelire[0].canal);
    demarrer(async () => {
      const aGarder = canauxEnvoi.filter((c) => textes[c.canal]);
      const x = await envoyerMaintenant(cle, elements.length ? choix : null, {
        textes: Object.fromEntries(aGarder.map((c) => [c.canal, texteDe(c)])),
        optionnels,
        personnalisee,
        enregistrer: Object.fromEntries(
          aGarder.flatMap((c) => {
            const a = analyses[c.canal];
            return enregistrer[c.canal] && a?.ok ? [[c.canal, { objet: a.objet, corps: a.corps }]] : [];
          }),
        ),
      });
      if (x.ok) {
        envoye?.(x);
        fermer();
      } else setRetour(x);
    });
  };

  const libelleEnvoyer = enCours
    ? "Envoi…"
    : aRelire.length
      ? `Relire ${aRelire[0].canal === "sms" ? "le SMS" : "l’e-mail"} avant l’envoi`
      : toutRequis && choisis.length >= requis.length
        ? canauxEnvoi.length > 1
          ? "Envoyer e-mail et SMS"
          : "Envoyer la relance"
        : `Envoyer ${choisis.length} élément${choisis.length > 1 ? "s" : ""} sur ${elements.length}`;

  return (
    <div className={s.voile} onClick={fermer} role="presentation">
      <aside
        className={s.volet}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "apercu" ? "Aperçu de la relance" : "Envoyer la relance"}
        onClick={(e) => e.stopPropagation()}
        style={def ? { ["--c" as string]: def.couleur } : undefined}
      >
        {/* ── L'en-tête : la relance, le client ── */}
        <header className={s.tete}>
          <div className={s.teteTexte}>
            <p className={s.surtitre}>
              <i />
              {mode === "apercu" ? "Aperçu · " : ""}
              {r ? `${r.libelle} · ${r.type === "espace" ? `relance n° ${r.rang}` : `relance ${r.rang} sur ${r.sur}`}` : "Relance"}
            </p>
            <h2>{r ? r.client || r.ref : "Préparation…"}</h2>
            {r && prep && (
              <div className={s.meta}>
                <Link href={`/dossiers/${r.dossierId}`} className={s.puce} onClick={fermer}>
                  {r.ref}
                  <Icone nom="externe" taille={12} />
                </Link>
                {prep.destinataire.email && (
                  <span className={s.puce} title="Adresse e-mail du client">
                    <IconeCanal canal="email" taille={12} />
                    {prep.destinataire.email}
                  </span>
                )}
                {prep.canaux.some((c) => c.canal === "sms") && prep.destinataire.telephone && (
                  <span className={s.puce} title="Téléphone du client">
                    <IconeCanal canal="sms" taille={12} />
                    {prep.destinataire.telephone}
                  </span>
                )}
                {r.type === "espace" || r.horsSuite ? (
                  <span className={s.puce} data-ton="main" title={r.horsSuite ?? "La veille ne l’envoie jamais : elle part à la main, depuis la fiche de l’espace client."}>
                    <Icone nom="envoyer" taille={12} />
                    {r.horsSuite ? "Hors calendrier de la veille" : "À la main"}
                  </span>
                ) : (
                  <span className={s.puce} data-ton={r.colonne}>
                    <Icone nom="horloge" taille={12} />
                    {r.colonne === "desactivee" ? (r.aRediger ? "Carte sans texte : à relire ici" : "Désactivée") : r.reportee ? `Repoussée au ${jourLong(r.prevue)}` : `Prévue le ${jourLong(r.prevue)}`}
                  </span>
                )}
              </div>
            )}
          </div>
          <button ref={fermerRef} type="button" className={s.fermer} onClick={fermer} aria-label="Fermer">
            <Icone nom="fermer" taille={18} />
          </button>
        </header>

        <div className={s.defile}>
          {erreur ? (
            <p className={s.erreur}>{erreur}</p>
          ) : !prep || !r || !canal || !message ? (
            <div className={s.chargement} aria-busy="true">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <>
              {r.bloquee && (
                <p className={s.bandeau} data-ton="retenu">
                  <Icone nom="alerte" taille={15} />
                  <span>
                    <b>Cette relance ne peut pas partir.</b> {r.bloquee}
                  </span>
                </p>
              )}

              {/* ── 1 · Ce que la relance demande ── */}
              <section className={s.section} aria-labelledby="relance-demande">
                <div className={s.sectionTete}>
                  <div>
                    <h3 id="relance-demande">Ce que la relance demande</h3>
                    <p>
                      {mode === "apercu"
                        ? `${choisis.length} élément${choisis.length > 1 ? "s" : ""}, ce que la relance demanderait`
                        : `${choisis.length} sur ${elements.length} retenu${choisis.length > 1 ? "s" : ""}`}
                    </p>
                  </div>
                  {mode === "envoi" && elements.length > 0 && (
                    <button type="button" role="switch" aria-checked={toutRequis && choisis.length > 0} className={s.interrupteur} onClick={toutInclure} title={requis.length < elements.length ? "Tout ce qui est demandé ; le facultatif se coche à part" : undefined}>
                      Tout inclure
                      <span />
                    </button>
                  )}
                </div>
                {elements.length === 0 ? (
                  <p className={s.vide}>Rien à demander pour ce dossier : la relance partirait avec le seul texte de sa carte.</p>
                ) : (
                  <ul className={s.liste} data-mode={mode}>
                    {elements.map((e) => {
                      const coche = choisis.some((x) => x.id === e.id);
                      const contenu = (
                        <>
                          <span className={s.case} aria-hidden>
                            {mode === "envoi" && coche && <Icone nom="coche" taille={13} />}
                          </span>
                          <span className={s.elementTexte}>
                            <b>
                              {e.titre}
                              {e.facultatif && <em className={s.facultatif}>Facultatif</em>}
                            </b>
                            {e.detail && <small>{e.detail}</small>}
                          </span>
                          {e.valeur && <span className={s.valeur}>{e.valeur}</span>}
                        </>
                      );
                      return (
                        <li key={e.id} data-coche={mode === "envoi" ? coche : undefined}>
                          {mode === "envoi" ? (
                            <label>
                              <input type="checkbox" checked={coche} onChange={() => basculer(e.id)} />
                              {contenu}
                            </label>
                          ) : (
                            <div data-pale={!coche || undefined}>{contenu}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* ── 2 · Le message, tel que le client le recevra ── */}
              <section className={s.section} aria-labelledby="relance-message">
                <div className={s.sectionTete}>
                  <div>
                    <h3 id="relance-message">Le message, tel que le client le recevra</h3>
                    <p>
                      {canauxEnvoi.length
                        ? `Partira par ${canauxEnvoi.map((c) => canalEnClair(c.canal)).join(" et ")}`
                        : "Aucun canal ne peut partir"}
                    </p>
                  </div>
                  {prep.canaux.length > 1 && (
                    <div className={s.onglets} role="tablist" aria-label="Canal">
                      {prep.canaux.map((c) => (
                        <button key={c.canal} type="button" role="tab" aria-selected={c.canal === canal.canal} onClick={() => choisir(c.canal)}>
                          <IconeCanal canal={c.canal} taille={13} />
                          {libelleCanal(c.canal)}
                          <i data-etat={c.optionnel && !optionnels.includes(c.canal) ? "non" : c.etat === "pret" || (c.etat === "vide" && vus.includes(c.canal)) ? "pret" : c.etat === "vide" ? "relire" : "non"} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Un canal en plus, que l'équipe coche : le SMS de « Ce qui manque ». Cocher l'ouvre, pour le relire. */}
                {mode === "envoi" &&
                  prep.canaux
                    .filter((c) => c.optionnel)
                    .map((c) => (
                      <label key={c.canal} className={s.option} data-actif={optionnels.includes(c.canal) || undefined}>
                        <input
                          type="checkbox"
                          checked={optionnels.includes(c.canal)}
                          disabled={c.etat === "sans_contact" || c.etat === "desactivee"}
                          onChange={(e) => {
                            setOptionnels((l) => (e.target.checked ? [...l, c.canal] : l.filter((x) => x !== c.canal)));
                            if (e.target.checked) choisir(c.canal);
                          }}
                        />
                        <span>
                          <b>Envoyer aussi par {canalEnClair(c.canal)}</b>
                          <small>{c.raison ?? (prep.destinataire.telephone ? `Au ${prep.destinataire.telephone}, en plus de l’e-mail.` : "")}</small>
                        </span>
                      </label>
                    ))}

                {(canal.etat === "desactivee" || canal.etat === "sans_contact") && !canal.optionnel && (
                  <p className={s.bandeau} data-ton="retenu">
                    <Icone nom="alerte" taille={15} />
                    <span>
                      <b>Ce canal ne partira pas.</b> {canal.raison}
                    </span>
                  </p>
                )}
                {canal.etat === "vide" && mode === "apercu" && (
                  <p className={s.bandeau} data-ton="propose">
                    <Icone nom="alerte" taille={15} />
                    <span>
                      <b>Texte proposé par la plateforme, à valider.</b> La carte « {canal.carte.titre} » n&apos;a pas encore de texte dans{" "}
                      <Link href="/modeles" onClick={fermer}>Courriers et SMS</Link>. Il peut partir d&apos;ici, une fois relu.
                    </span>
                  </p>
                )}
                {rienCoche && (
                  <p className={s.bandeau} data-ton="retenu">
                    <Icone nom="alerte" taille={15} />
                    <span>Rien n&apos;est coché : cochez au moins un élément pour envoyer la relance.</span>
                  </p>
                )}

                {/* « Personnaliser » : le texte de cet envoi, tel que le client le lit. */}
                {mode === "envoi" && prep.envoyable && (canal.etat === "pret" || canal.etat === "vide") && (
                  textes[canal.canal] ? (
                    <Editeur
                      c={canal}
                      t={textes[canal.canal]!}
                      modifie={modifie(canal)}
                      zone={zone}
                      analyse={analyses[canal.canal] ?? null}
                      enregistrer={!!enregistrer[canal.canal]}
                      setEnregistrer={(v) => setEnregistrer((x) => ({ ...x, [canal.canal]: v }))}
                      modifier={(champ, v) => modifier(canal.canal, champ, v)}
                      revenir={() => revenir(canal)}
                      insererListe={() => insererListe(canal.canal)}
                    />
                  ) : (
                    <div className={s.personnaliser}>
                      <button type="button" onClick={() => personnaliser(canal)}>
                        <Icone nom="crayon" taille={15} />
                        Personnaliser {canal.canal === "sms" ? "ce SMS" : "cet e-mail"}
                      </button>
                      <small>Pour cet envoi seulement : la carte de « Courriers et SMS » ne change pas.</small>
                    </div>
                  )
                )}

                {canal.canal === "email" ? (
                  <div className={s.enveloppe} data-vide={rienCoche}>
                    <dl>
                      <div>
                        <dt>À</dt>
                        <dd>{prep.destinataire.email || "pas d’adresse e-mail sur la fiche client"}</dd>
                      </div>
                      <div>
                        <dt>Objet</dt>
                        <dd>
                          <b>{message.sujet}</b>
                        </dd>
                      </div>
                    </dl>
                    <CadreEmail html={message.html ?? ""} />
                  </div>
                ) : (
                  <div className={s.sms}>
                    <p className={s.smsA}>À {prep.destinataire.telephone || "pas de numéro sur la fiche client"}</p>
                    <Telephone texte={message.texte} />
                  </div>
                )}
              </section>

              {/* ── 3 · Les e-mails déjà partis pour cette relance, et leur suivi (src/crm/suivi) ── */}
              {prep.historique.length > 0 && (
                <section className={s.section} aria-labelledby="relance-historique">
                  <div className={s.sectionTete}>
                    <div>
                      <h3 id="relance-historique">Déjà envoyé pour cette relance</h3>
                      <p>Ce que le suivi a relevé : ouvert, cliqué, venu sur le portail.</p>
                    </div>
                  </div>
                  <ul className={s.historique}>
                    {prep.historique.map((h) => (
                      <li key={h.suivi.envoiId}>
                        <b>Relance {h.rang}</b>
                        <Piste suivi={h.suivi} compacte />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        {/* ── Le pied : ce que deviendra l'envoi, et le geste ── */}
        <footer className={s.pied}>
          {mode === "envoi" ? (
            <p className={s.mode} data-mode={prep?.destinataire.fictif ? "fictif" : prep?.envoi.mode}>
              <i />
              {retour && !retour.ok ? retour.erreur : prep ? (prep.envoyable ? prep.envoi.phrase : prep.motif) : "…"}
            </p>
          ) : (
            <p className={s.mode} data-mode="apercu">
              <i />
              Aperçu : rien ne part d’ici.{prep && !prep.envoyable && prep.motif ? ` ${prep.motif}` : ""}
            </p>
          )}
          <div className={s.gestes}>
            <button type="button" className={s.secondaire} onClick={fermer}>
              Fermer
            </button>
            {mode === "envoi" ? (
              <button
                type="button"
                className={s.principal}
                data-relire={aRelire.length ? "" : undefined}
                disabled={!peutEnvoyer}
                onClick={envoyer}
                title={rienCoche ? "Cochez au moins un élément" : (prep?.motif ?? undefined)}
              >
                <Icone nom={aRelire.length ? "oeil" : "envoyer"} taille={16} />
                {libelleEnvoyer}
              </button>
            ) : (
              prep?.envoyable && (
                <button type="button" className={s.principal} onClick={() => setMode("envoi")}>
                  Préparer l’envoi
                  <Icone nom="droite" taille={16} />
                </button>
              )
            )}
          </div>
        </footer>
      </aside>
    </div>
  );
}

/** Le texte d'une carte (ou proposé), tel que le client le lit pour ces variables. */
function lisible(c: CanalEnvoi, vars: Record<string, string>): Texte {
  const { elements: _liste, ...autres } = vars;
  void _liste;
  return { objet: c.objet ? remplir(c.objet, autres) : "", corps: texteLisible(c.corps, vars, c.canal) };
}

/** L'éditeur du texte de cet envoi : objet, message, la marque de la liste, et l'enregistrement facultatif dans la carte. */
function Editeur({
  c,
  t,
  modifie,
  zone,
  analyse,
  enregistrer,
  setEnregistrer,
  modifier,
  revenir,
  insererListe,
}: {
  c: CanalEnvoi;
  t: Texte;
  modifie: boolean;
  zone: React.RefObject<HTMLTextAreaElement | null>;
  analyse: ReturnType<typeof versTexteCarte> | null;
  enregistrer: boolean;
  setEnregistrer: (v: boolean) => void;
  modifier: (champ: keyof Texte, v: string) => void;
  revenir: () => void;
  insererListe: () => void;
}) {
  const marque = t.corps.includes(MARQUE_LISTE);
  return (
    <div className={s.editeur} data-propose={c.etat === "vide" || undefined}>
      <div className={s.editeurTete}>
        <span className={s.etiquette} data-ton={c.etat === "vide" && !modifie ? "propose" : "perso"}>
          <Icone nom={c.etat === "vide" && !modifie ? "alerte" : "crayon"} taille={13} />
          {c.etat === "vide" ? (modifie ? "Texte proposé, modifié pour cet envoi" : "Texte proposé, à relire avant l’envoi") : modifie ? "Personnalisé pour cet envoi" : "Personnaliser : le texte de cet envoi"}
        </span>
        {modifie && (
          <button type="button" className={s.lien} onClick={revenir}>
            <Icone nom="restaurer" taille={13} />
            {c.etat === "vide" ? "Revenir au texte proposé" : "Revenir au texte de la carte"}
          </button>
        )}
      </div>
      {c.etat === "vide" && (
        <p className={s.editeurNote}>
          La carte « {c.carte.titre} » n&apos;a pas encore de texte validé dans Courriers et SMS : la plateforme propose celui-ci. Relisez-le, modifiez-le si besoin ; il ne part que de cet écran.
        </p>
      )}
      {c.canal === "email" && (
        <label className={s.champ}>
          <span>Objet</span>
          <input value={t.objet} onChange={(e) => modifier("objet", e.target.value)} />
        </label>
      )}
      <label className={s.champ}>
        <span>Message</span>
        <textarea ref={zone} value={t.corps} rows={c.canal === "sms" ? 4 : 11} onChange={(e) => modifier("corps", e.target.value)} />
      </label>
      <p className={s.aideListe}>
        <span className={s.marque}>{MARQUE_LISTE}</span>
        {c.canal === "email"
          ? marque
            ? "pose ici la liste cochée ci-dessus, mise en page. Déplacez la ligne pour la déplacer."
            : "est retiré : la liste se pose avant la signature."
          : marque
            ? "devient la liste cochée, en quelques mots."
            : "est retiré : le SMS ne cite pas la liste."}
        {!marque && (
          <button type="button" className={s.lien} onClick={insererListe}>
            Remettre la liste à l’endroit du curseur
          </button>
        )}
      </p>
      {modifie && (
        <label className={s.enregistrer} data-indisponible={!analyse?.ok || undefined}>
          <input type="checkbox" checked={enregistrer && !!analyse?.ok} disabled={!analyse?.ok} onChange={(e) => setEnregistrer(e.target.checked)} />
          <span>
            <b>Enregistrer aussi comme texte de la carte « {c.carte.titre} »</b>
            <small>
              {analyse?.ok
                ? `Avec ses variables ({client}, {ref}…) à la place de ce client.${c.carte.active ? " Les prochaines relances de ce type, veille comprise, partiront avec ce texte." : " La carte reste désactivée : rien ne part de lui-même tant qu’elle n’est pas activée dans Courriers et SMS."}`
                : `Impossible ici : ${analyse?.raison ?? "texte illisible."}`}
            </small>
          </span>
        </label>
      )}
    </div>
  );
}

/** L'e-mail dans un cadre à sa hauteur : sans script, isolé de la page. */
function CadreEmail({ html }: { html: string }) {
  const cadre = useRef<HTMLIFrameElement>(null);
  const [hauteur, setHauteur] = useState(900);
  const mesurer = useCallback(() => {
    const doc = cadre.current?.contentDocument;
    if (doc?.body) setHauteur(Math.max(400, doc.documentElement.scrollHeight));
  }, []);
  useEffect(() => {
    // Les images (logo, photo) arrivent après : on remesure un peu plus tard.
    const t = setTimeout(mesurer, 400);
    return () => clearTimeout(t);
  }, [html, mesurer]);
  return <iframe ref={cadre} className={s.cadre} title="L’e-mail, tel que le client le recevra" sandbox="allow-same-origin" srcDoc={html} onLoad={mesurer} style={{ height: hauteur }} />;
}
