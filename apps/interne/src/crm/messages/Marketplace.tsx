"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  apercuCarte, apercuQuestionnaire, basculerCarte, basculerQuestionnaire, enregistrerCarte, enregistrerQuestionnaire,
  type Apercu, type Retour,
} from "./actions";
import type { CarteVue } from "./donnees";
import s from "./messages.module.css";

/*
 * La marketplace des messages : une carte par type d'action, activable d'un
 * geste, qui s'ouvre pour modifier son texte (variables insérables, aperçu
 * rendu comme à l'envoi).
 */

const Enveloppe = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);
const Bulle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
  </svg>
);

/**
 * Le nombre de SMS facturés : 160 caractères (153 par morceau au-delà) dans
 * l'alphabet SMS (GSM 03.38), 70 (67) dès qu'un caractère en sort.
 */
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_ETENDU = "^{}\\[~]|€";
function compterSms(texte: string) {
  const chars = [...texte];
  const unicode = chars.some((c) => !GSM.includes(c) && !GSM_ETENDU.includes(c));
  const longueur = unicode ? chars.length : chars.reduce((n, c) => n + (GSM_ETENDU.includes(c) ? 2 : 1), 0);
  const segments = unicode ? (longueur <= 70 ? 1 : Math.ceil(longueur / 67)) : longueur <= 160 ? 1 : Math.ceil(longueur / 153);
  return { segments: Math.max(1, segments), unicode };
}

export default function Marketplace({ cartes, etapes }: { cartes: CarteVue[]; etapes: { cle: string; libelle: string }[] }) {
  const [ouverte, setOuverte] = useState<CarteVue | null>(null);
  const [erreur, setErreur] = useState<{ id: string; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const basculer = (c: CarteVue) =>
    demarrer(async () => {
      const r: Retour = c.source === "crm" ? await basculerCarte(c.cle!, !c.actif) : await basculerQuestionnaire(c.alerteId!, !c.actif);
      setErreur(r.ok ? null : { id: c.id, texte: r.erreur });
      router.refresh();
    });

  const parEtape = etapes.map((e) => ({ ...e, cartes: cartes.filter((c) => c.etape === e.cle) })).filter((e) => e.cartes.length);
  return (
    <>
      {parEtape.length === 0 && <p className="empty">Aucun message pour ces filtres.</p>}
      {parEtape.map((e) => (
        <section key={e.cle} className={s.section}>
          <h3 className={s.titreSection}>{e.libelle}</h3>
          <div className={s.grille}>
            {e.cartes.map((c) => (
              <article
                key={c.id}
                id={c.cle ?? c.id}
                className={s.carte}
                data-actif={c.actif}
                role="button"
                tabIndex={0}
                aria-label={`${c.titre} : modifier le texte`}
                onClick={() => setOuverte(c)}
                onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && ev.target === ev.currentTarget && setOuverte(c)}
              >
                <div className={s.haut}>
                  <span className={s.canal} data-canal={c.canal}>
                    {c.canal === "sms" ? <Bulle /> : <Enveloppe />}
                    {c.canal === "sms" ? "SMS" : "E-mail"}
                  </span>
                  <span className={s.etape}>{c.destinataire}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={c.actif}
                    aria-label={c.actif ? `Désactiver « ${c.titre} »` : `Activer « ${c.titre} »`}
                    title={c.verrouillee ?? (c.actif ? "Actif : cliquer pour désactiver" : "Désactivé : cliquer pour activer")}
                    className={s.interrupteur}
                    disabled={enCours || !!c.verrouillee}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      basculer(c);
                    }}
                  />
                </div>
                <h3 className={s.titreCarte}>{c.titre}</h3>
                <p className={s.modele}>« {c.modele} »</p>
                <p className={s.declencheur}>{c.declencheur}</p>
                <div className={s.badges}>
                  {c.aValider && <span className={s.badge} data-ton="attention">Texte à valider</span>}
                  {c.aBrancher && <span className={s.badge} data-ton="neutre">Déclencheur à brancher</span>}
                  {c.verrouillee && <span className={s.badge} data-ton="neutre">Toujours actif</span>}
                  {c.source === "questionnaires" && <span className={s.badge}>Questionnaires</span>}
                  {c.texteCode && <span className={s.badge} data-ton="neutre">Texte de la plateforme</span>}
                </div>
                {c.delai && <p className={s.delai}>⏱ {c.delai}</p>}
                {erreur?.id === c.id && <p className={s.retour} data-ok="false">{erreur.texte}</p>}
                <div className={s.bas}>
                  <span title={c.retenus ? `${c.retenus} autre(s) au journal sans être partis` : undefined}>
                    <b>{c.envois}</b> envoi{c.envois > 1 ? "s" : ""}
                  </span>
                  <span className={s.modifier}>{c.texteCode ? "Voir" : "Modifier"} →</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {ouverte && <Editeur carte={ouverte} fermer={() => setOuverte(null)} />}
    </>
  );
}

function Editeur({ carte, fermer }: { carte: CarteVue; fermer: () => void }) {
  const [objet, setObjet] = useState(carte.objet ?? "");
  const [corps, setCorps] = useState(carte.corps);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [retour, setRetour] = useState<Retour | null>(null);
  const [enCours, demarrer] = useTransition();
  const zone = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const lectureSeule = carte.texteCode;

  // L'aperçu suit la saisie, rendu par le serveur comme à l'envoi.
  useEffect(() => {
    const t = setTimeout(async () => {
      const a = carte.source === "crm" ? await apercuCarte(carte.cle!, objet || null, corps) : carte.modeleId ? await apercuQuestionnaire(carte.modeleId, objet || null, corps) : null;
      setApercu(a);
    }, 350);
    return () => clearTimeout(t);
  }, [carte, objet, corps]);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [fermer]);

  const inserer = (jeton: string) => {
    const z = zone.current;
    if (!z) return setCorps((c) => c + jeton);
    const debut = z.selectionStart ?? corps.length;
    const fin = z.selectionEnd ?? corps.length;
    const suivant = corps.slice(0, debut) + jeton + corps.slice(fin);
    setCorps(suivant);
    requestAnimationFrame(() => {
      z.focus();
      z.setSelectionRange(debut + jeton.length, debut + jeton.length);
    });
  };

  const enregistrer = () =>
    demarrer(async () => {
      const r = carte.source === "crm" ? await enregistrerCarte(carte.cle!, objet || null, corps) : await enregistrerQuestionnaire(carte.modeleId!, objet || null, corps);
      setRetour(r);
      if (r.ok) router.refresh();
    });

  const { segments, unicode } = compterSms(apercu?.texte ?? corps);
  return (
    <div className={s.voile} onClick={fermer} role="presentation">
      <div className={s.fenetre} role="dialog" aria-modal="true" aria-label={`Modifier « ${carte.titre} »`} onClick={(e) => e.stopPropagation()}>
        <div className={s.enTete}>
          <div>
            <span className={s.canal} data-canal={carte.canal}>
              {carte.canal === "sms" ? <Bulle /> : <Enveloppe />}
              {carte.canal === "sms" ? "SMS" : "E-mail"}
            </span>
            <h2>{carte.titre}</h2>
            <p>
              {carte.declencheur}
              {carte.delai ? ` · ${carte.delai}` : ""} · {carte.destinataire}
            </p>
          </div>
          <button className={s.fermer} onClick={fermer} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className={s.corps}>
          <div className={s.edition}>
            {lectureSeule ? (
              <p className={s.aide}>Ce message est composé par la plateforme (lien de connexion, identifiant, durée de validité) : il ne se modifie pas ici. L&apos;aperçu montre ce que reçoit le client.</p>
            ) : (
              <>
                {carte.aValider && <p className={s.aide}><b>Texte à valider.</b> Ce type de message n&apos;a pas encore de texte validé par Bailly : rédigez-le, enregistrez-le, puis activez la carte.</p>}
                {carte.canal === "email" && (
                  <div>
                    <label htmlFor="objet">Objet</label>
                    <input id="objet" value={objet} onChange={(e) => setObjet(e.target.value)} />
                  </div>
                )}
                <div>
                  <label htmlFor="texte">Texte</label>
                  <textarea id="texte" ref={zone} value={corps} onChange={(e) => setCorps(e.target.value)} placeholder="Bonjour {client}, …" />
                </div>
                <div>
                  <label>Insérer une variable</label>
                  <div className={s.jetons}>
                    {carte.variables.map((v) => (
                      <button key={v.jeton} type="button" className={s.jeton} title={v.libelle} onClick={() => inserer(v.jeton)}>
                        {v.jeton}
                      </button>
                    ))}
                  </div>
                </div>
                <p className={s.aide}>
                  {carte.source === "questionnaires"
                    ? "Une ligne qui ne contient qu'un bloc devient ce bloc (carte de l'estimation, bouton…). Le texte est celui des questionnaires : il vaut pour toutes les règles qui l'emploient."
                    : "Une ligne vide sépare deux paragraphes. La mise en page, le logo et le bouton éventuel sont ajoutés à l'envoi."}
                </p>
                <div className={s.actions}>
                  <button className="btn primary" disabled={enCours} onClick={enregistrer}>
                    {enCours ? "Enregistrement…" : "Enregistrer le texte"}
                  </button>
                  <button className="btn ghost" onClick={fermer}>
                    Fermer
                  </button>
                  {retour && <span className={s.retour} data-ok={retour.ok}>{retour.ok ? retour.message : retour.erreur}</span>}
                </div>
              </>
            )}
          </div>
          <div className={s.apercu}>
            <small>Aperçu, avec des valeurs d&apos;exemple</small>
            {!apercu ? (
              <p className={s.aide}>Préparation de l&apos;aperçu…</p>
            ) : apercu.canal === "sms" ? (
              <div className={s.telephone}>
                <div className={s.bulle}>{apercu.texte || "…"}</div>
                <p className={s.compte}>
                  {apercu.texte.length} caractères · {segments} SMS{unicode ? " (caractères accentués hors alphabet SMS : 70 par SMS)" : ""}
                </p>
              </div>
            ) : (
              <>
                <p className={s.sujet}>{apercu.sujet}</p>
                <iframe className={s.cadre} title="Aperçu de l'e-mail" sandbox="" srcDoc={apercu.html ?? ""} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
