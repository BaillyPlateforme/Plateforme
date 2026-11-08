"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  apercuCarte, basculerCarte, basculerModele, basculerQuestionnaire, enregistrerCarte, supprimerModele, supprimerRegle,
  type Apercu, type Retour,
} from "./actions";
import type { CarteVue, GabaritVue } from "./donnees";
import EditeurModele from "./EditeurModele";
import { Canal, Fenetre, PanneauApercu } from "./elements";
import TestEnvoi, { type DepartTest } from "./TestEnvoi";
import s from "./messages.module.css";

/*
 * La marketplace des messages : une carte par type d'action, activable d'un
 * geste, qui s'ouvre pour modifier son texte (variables insérables, aperçu
 * rendu comme à l'envoi). Chaque carte se teste (« Tester l'envoi ») ; celles
 * des questionnaires se suppriment, et s'ouvrent sur leur modèle et leur règle
 * (événement, conditions, destinataire). « Nouveau modèle » et « Tester un
 * envoi », dans le bandeau, ouvrent la création et le test libre
 * (?nouveau=1, ?tester=1) — ce que faisait l'ancienne messagerie.
 */

const Corbeille = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

export default function Marketplace({
  cartes,
  etapes,
  modeles,
  partages,
  creer = false,
  testLibre = false,
  lienSansFenetre,
}: {
  cartes: CarteVue[];
  etapes: { cle: string; libelle: string }[];
  /** Tous les modèles des questionnaires : la règle qui en change, et le test d'envoi. */
  modeles: GabaritVue[];
  /** Pour chaque modèle, les règles qui l'envoient. */
  partages: Record<string, string[]>;
  creer?: boolean;
  testLibre?: boolean;
  /** L'adresse de la page sans ?nouveau ni ?tester, pour refermer ces fenêtres. */
  lienSansFenetre: string;
}) {
  const [ouverte, setOuverte] = useState<CarteVue | "nouveau" | null>(creer ? "nouveau" : null);
  // Une règle de plus pour le modèle d'une carte (ouverte depuis l'éditeur de cette carte).
  const [nouvelleRegle, setNouvelleRegle] = useState<CarteVue | null>(null);
  const autreRegle = (g: GabaritVue) => {
    if (ouverte && ouverte !== "nouveau") setNouvelleRegle({ ...ouverte, gabarit: g, modeleId: g.id });
    setOuverte(null);
  };
  const [test, setTest] = useState<DepartTest | null>(testLibre ? { canal: "email", sujet: "", corps: "" } : null);
  const [erreur, setErreur] = useState<{ id: string; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  // Les fenêtres ouvertes par le bandeau tiennent dans l'adresse : en les fermant, on la rend propre.
  const fermerEditeur = () => {
    setOuverte(null);
    if (creer) router.replace(lienSansFenetre, { scroll: false });
  };
  const fermerTest = () => {
    setTest(null);
    if (testLibre) router.replace(lienSansFenetre, { scroll: false });
  };

  const basculer = (c: CarteVue) =>
    demarrer(async () => {
      const r: Retour =
        c.source === "crm" ? await basculerCarte(c.cle!, !c.actif) : c.alerteId ? await basculerQuestionnaire(c.alerteId, !c.actif) : await basculerModele(c.modeleId!, !c.actif);
      setErreur(r.ok ? null : { id: c.id, texte: r.erreur });
      router.refresh();
    });

  const supprimer = (c: CarteVue) => {
    const question = c.regle ? `Supprimer la règle « ${c.regle.name} » ? Le modèle « ${c.modele} » reste dans Courriers et SMS, sans règle.` : `Supprimer le modèle « ${c.modele} » ?`;
    if (!confirm(question)) return;
    demarrer(async () => {
      const r = c.regle ? await supprimerRegle(c.regle.id) : await supprimerModele(c.modeleId!);
      setErreur(r.ok ? null : { id: c.id, texte: r.erreur });
      router.refresh();
    });
  };

  /** Le test d'une carte : son texte, rempli de valeurs d'exemple pour les cartes du CRM (leurs variables {…} ne sont pas celles du test). */
  const tester = (c: CarteVue) =>
    demarrer(async () => {
      if (c.source === "crm") {
        const a = await apercuCarte(c.cle!, c.objet, c.corps);
        setTest({ titre: c.titre, canal: c.canal, sujet: a?.sujet ?? c.objet ?? "", corps: a?.texte ?? c.corps });
      } else setTest({ titre: c.titre, modeleId: c.modeleId, canal: c.canal, sujet: c.objet ?? "", corps: c.corps });
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
                aria-label={`${c.titre} : modifier`}
                onClick={() => setOuverte(c)}
                onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && ev.target === ev.currentTarget && setOuverte(c)}
              >
                <div className={s.haut}>
                  <Canal canal={c.canal} />
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
                  <button
                    type="button"
                    className={s.geste}
                    disabled={enCours}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      tester(c);
                    }}
                  >
                    Tester l&apos;envoi
                  </button>
                  {c.source === "questionnaires" && (c.regle || c.modeleId) && (
                    <button
                      type="button"
                      className={s.geste}
                      data-danger=""
                      disabled={enCours}
                      title={c.regle ? "Supprimer la règle" : "Supprimer le modèle"}
                      aria-label={c.regle ? `Supprimer la règle « ${c.titre} »` : `Supprimer le modèle « ${c.titre} »`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        supprimer(c);
                      }}
                    >
                      <Corbeille />
                    </button>
                  )}
                  <span className={s.modifier}>{c.texteCode ? "Voir" : "Modifier"} →</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {ouverte === "nouveau" ? (
        <EditeurModele carte={null} modeles={modeles} autresRegles={[]} tester={setTest} bloquee={!!test} fermer={fermerEditeur} />
      ) : ouverte?.source === "questionnaires" ? (
        <EditeurModele
          key={ouverte.id}
          carte={ouverte}
          modeles={modeles}
          autresRegles={ouverte.modeleId ? (partages[ouverte.modeleId] ?? []).filter((n) => n !== ouverte.regle?.name) : []}
          tester={setTest}
          autreRegle={autreRegle}
          bloquee={!!test}
          fermer={fermerEditeur}
        />
      ) : ouverte ? (
        <Editeur key={ouverte.id} carte={ouverte} tester={setTest} bloquee={!!test} fermer={fermerEditeur} />
      ) : null}
      {nouvelleRegle && (
        <EditeurModele
          key={`nouvelle-regle:${nouvelleRegle.modeleId}`}
          carte={nouvelleRegle}
          regleNeuve
          modeles={modeles}
          autresRegles={partages[nouvelleRegle.modeleId!] ?? []}
          tester={setTest}
          bloquee={!!test}
          fermer={() => setNouvelleRegle(null)}
        />
      )}
      {test && <TestEnvoi modeles={modeles} depart={test} fermer={fermerTest} />}
    </>
  );
}

/** L'éditeur d'une carte du CRM ou de l'espace client : son objet et son texte (les messages eux-mêmes sont ceux du catalogue). */
function Editeur({ carte, tester, bloquee, fermer }: { carte: CarteVue; tester: (d: DepartTest) => void; bloquee: boolean; fermer: () => void }) {
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
    const t = setTimeout(async () => setApercu(await apercuCarte(carte.cle!, objet || null, corps)), 350);
    return () => clearTimeout(t);
  }, [carte, objet, corps]);

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
      const r = await enregistrerCarte(carte.cle!, objet || null, corps);
      setRetour(r);
      if (r.ok) router.refresh();
    });

  // Le test reprend le texte en cours, rempli des valeurs d'exemple de l'aperçu.
  const testerTexte = () => tester({ titre: carte.titre, canal: carte.canal, sujet: apercu?.sujet ?? objet, corps: apercu?.texte ?? corps });

  return (
    <Fenetre
      canal={carte.canal}
      titre={carte.titre}
      phrase={`${carte.declencheur}${carte.delai ? ` · ${carte.delai}` : ""} · ${carte.destinataire}`}
      fermer={fermer}
      bloquee={bloquee}
    >
      <div className={s.corps}>
        <div className={s.edition}>
          {lectureSeule ? (
            <>
              <p className={s.aide}>Ce message est composé par la plateforme (lien de connexion, identifiant, durée de validité) : il ne se modifie pas ici. L&apos;aperçu montre ce que reçoit le client.</p>
              <div className={s.actions}>
                <button type="button" className="btn ghost" disabled={!apercu} onClick={testerTexte}>
                  Tester l&apos;envoi
                </button>
              </div>
            </>
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
              <p className={s.aide}>Une ligne vide sépare deux paragraphes. La mise en page, le logo et le bouton éventuel sont ajoutés à l&apos;envoi.</p>
              <div className={s.actions}>
                <button type="button" className="btn primary" disabled={enCours} onClick={enregistrer}>
                  {enCours ? "Enregistrement…" : "Enregistrer le texte"}
                </button>
                <button type="button" className="btn ghost" disabled={!apercu} onClick={testerTexte}>
                  Tester l&apos;envoi
                </button>
                <button type="button" className="btn ghost" onClick={fermer}>
                  Fermer
                </button>
                {retour && <span className={s.retour} data-ok={retour.ok}>{retour.ok ? retour.message : retour.erreur}</span>}
              </div>
            </>
          )}
        </div>
        <PanneauApercu apercu={apercu} />
      </div>
    </Fenetre>
  );
}
