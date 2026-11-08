"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icone } from "@/ui/icones";
import { Telephone } from "@/crm/messages/elements";
import { composerEmailCrm, remplir } from "@/crm/messages/rendu";
import { envoyerMaintenant, preparerEnvoi, type PreparationEnvoi, type Retour } from "./actions";
import { blocRelance, elementsChoisis, varsRelance } from "./courrier";
import { defRelance, libelleCanal, type Canal } from "./regles";
import { IconeCanal } from "./Section";
import s from "./panneau.module.css";

/*
 * L'écran d'envoi d'une relance (David, 08/11/2026 : « on doit pouvoir voir un
 * mail ultra design qui s'affiche en dessous, et cocher les demandes que l'on
 * intègre dans la relance, ou si l'on met tout »). Un volet à droite :
 *
 *   1. en haut, ce que la relance demande, élément par élément, à cocher —
 *      « Tout inclure » par défaut, comme la veille ;
 *   2. dessous, le message tel que le client le recevra, recomposé dans le
 *      navigateur à chaque case (messages/rendu.ts et courrier.ts, le code
 *      même de l'envoi), en e-mail et, si la règle le prévoit, en SMS ;
 *   3. en pied, ce que deviendra l'envoi (ENVOI_MODE) et « Envoyer », qui
 *      n'envoie que les éléments cochés.
 *
 * En aperçu (« Aperçu » sur la carte), rien ne se coche ni ne part : on
 * regarde avant de décider ; « Préparer l'envoi » passe à l'écran d'envoi
 * quand la relance peut partir.
 */

const jourLong = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

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
  const [retour, setRetour] = useState<Retour | null>(null);
  const [enCours, demarrer] = useTransition();
  const fermerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let vivant = true;
    preparerEnvoi(cle)
      .then((r) => {
        if (!vivant) return;
        if (!r.ok) return setErreur(r.erreur);
        setPrep(r.preparation);
        setChoix(r.preparation.relance.demande.elements.map((e) => e.id));
        setOnglet(r.preparation.canaux[0]?.canal ?? "email");
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
  const def = r ? defRelance(r.type) : null;
  const elements = useMemo(() => r?.demande.elements ?? [], [r]);
  // En aperçu, tout ce que la relance demande : c'est ce que la veille enverrait.
  const choisis = useMemo(() => (mode === "apercu" || !r ? elements : elementsChoisis(r.demande, choix)), [mode, r, elements, choix]);
  const tout = choisis.length === elements.length;
  // Des éléments à demander, et aucun de coché : la relance ne peut pas partir.
  const rienCoche = mode === "envoi" && elements.length > 0 && choisis.length === 0;

  // Le message, recomposé à chaque case : le même code que l'envoi.
  const messages = useMemo(() => {
    if (!prep || !r) return null;
    const vars = choisis.length ? varsRelance(r.type, prep.vars, choisis) : prep.vars;
    const bloc = choisis.length ? blocRelance(r.type, r.demande, choisis, prep.liens) : undefined;
    return prep.canaux.map((c) =>
      c.canal === "email"
        ? { ...c, ...composerEmailCrm({ objet: c.objet, corps: c.corps }, vars, prep.contexte, { bloc, surtitre: prep.surtitre }) }
        : { ...c, sujet: null, html: null, texte: remplir(c.corps, vars) },
    );
  }, [prep, r, choisis]);
  const message = messages?.find((m) => m.canal === onglet) ?? messages?.[0] ?? null;

  const basculer = (id: string) => setChoix((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const toutInclure = () => setChoix(tout ? [] : elements.map((e) => e.id));

  const prets = prep?.canaux.filter((c) => c.pret) ?? [];
  const peutEnvoyer = !!prep?.envoyable && !rienCoche && !enCours;
  const envoyer = () =>
    demarrer(async () => {
      const x = await envoyerMaintenant(cle, elements.length ? choix : null);
      if (x.ok) {
        envoye?.(x);
        fermer();
      } else setRetour(x);
    });

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
              {r ? `${r.libelle} · relance ${r.rang} sur ${r.sur}` : "Relance"}
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
                <span className={s.puce} data-ton={r.colonne}>
                  <Icone nom="horloge" taille={12} />
                  {r.colonne === "desactivee" ? "Désactivée" : r.reportee ? `Repoussée au ${jourLong(r.prevue)}` : `Prévue le ${jourLong(r.prevue)}`}
                </span>
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
          ) : !prep || !r || !messages ? (
            <div className={s.chargement} aria-busy="true">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <>
              {/* ── 1 · Ce que la relance demande ── */}
              <section className={s.section} aria-labelledby="relance-demande">
                <div className={s.sectionTete}>
                  <div>
                    <h3 id="relance-demande">Ce que la relance demande</h3>
                    <p>
                      {mode === "apercu"
                        ? `${elements.length} élément${elements.length > 1 ? "s" : ""}, tout ce que la veille enverrait`
                        : `${choisis.length} sur ${elements.length} retenu${choisis.length > 1 ? "s" : ""}`}
                    </p>
                  </div>
                  {mode === "envoi" && elements.length > 0 && (
                    <button type="button" role="switch" aria-checked={tout} className={s.interrupteur} onClick={toutInclure}>
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
                            <b>{e.titre}</b>
                            {e.detail && <small>{e.detail}</small>}
                          </span>
                          {e.valeur && <span className={s.valeur}>{e.valeur}</span>}
                        </>
                      );
                      return (
                        <li key={e.id} data-coche={coche}>
                          {mode === "envoi" ? (
                            <label>
                              <input type="checkbox" checked={coche} onChange={() => basculer(e.id)} />
                              {contenu}
                            </label>
                          ) : (
                            <div>{contenu}</div>
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
                      {prets.length
                        ? `Partira par ${prets.map((c) => libelleCanal(c.canal).toLowerCase()).join(" et ")}`
                        : "Aucun canal prêt dans « Courriers et SMS »"}
                    </p>
                  </div>
                  {messages.length > 1 && (
                    <div className={s.onglets} role="tablist" aria-label="Canal">
                      {messages.map((m) => (
                        <button key={m.canal} type="button" role="tab" aria-selected={m.canal === message?.canal} onClick={() => setOnglet(m.canal)}>
                          <IconeCanal canal={m.canal} taille={13} />
                          {libelleCanal(m.canal)}
                          <i data-pret={m.pret} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {message && (
                  <>
                    {!message.pret && (
                      <p className={s.bandeau} data-ton={message.propose ? "propose" : "retenu"}>
                        <Icone nom="alerte" taille={15} />
                        <span>
                          {message.propose ? (
                            <>
                              <b>Texte proposé par la plateforme, à valider.</b> La carte « {def?.libelle} » ({libelleCanal(message.canal).toLowerCase()}) n&apos;a pas encore de texte dans{" "}
                              <Link href="/modeles" onClick={fermer}>Courriers et SMS</Link> : ce canal ne part pas tant qu&apos;il n&apos;est pas validé.
                            </>
                          ) : (
                            <>
                              <b>Ce canal ne partira pas.</b> {message.raison}
                            </>
                          )}
                        </span>
                      </p>
                    )}
                    {rienCoche && (
                      <p className={s.bandeau} data-ton="retenu">
                        <Icone nom="alerte" taille={15} />
                        <span>Rien n&apos;est coché : cochez au moins un élément pour envoyer la relance.</span>
                      </p>
                    )}
                    {message.canal === "email" ? (
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
                  </>
                )}
              </section>
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
              <button type="button" className={s.principal} disabled={!peutEnvoyer} onClick={envoyer} title={choisis.length === 0 ? "Cochez au moins un élément" : prep?.motif ?? undefined}>
                <Icone nom="envoyer" taille={16} />
                {enCours ? "Envoi…" : tout ? "Envoyer la relance" : `Envoyer ${choisis.length} élément${choisis.length > 1 ? "s" : ""} sur ${elements.length}`}
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
