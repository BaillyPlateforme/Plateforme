"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { abonner, activerAlerte, ajouterDestinataire, apercuAlerte, enregistrerTexte, mettreEnPause, retirerDestinataire, toutOuRien, type Retour } from "./actions";
import { Toast } from "@/crm/relances/Kanban";
import r from "@/crm/relances/relances.module.css";
import s from "./alertes.module.css";

/*
 * « Alertes de l'équipe » : les destinataires, le catalogue des alertes
 * (activation, texte, aperçu) et la matrice des abonnements — un geste par
 * case, « tout » et « rien » par adresse.
 */

export type DestVue = {
  cle: string;
  email: string | null;
  nom: string;
  source: "equipe" | "manuel" | "variable" | "conseiller";
  enPause: boolean;
  /** Par alerte : abonné, et si c'est l'abonnement d'office (aucun réglage). */
  abonnements: Record<string, { abonne: boolean; office: boolean }>;
};

export type AlerteVue = {
  cle: string;
  titre: string;
  groupe: string;
  quand: string;
  branchee: boolean;
  ou: string;
  texte: "code" | "neutre" | "valide";
  actif: boolean;
  abonnes: number;
  variables: string[];
  objet: string;
  corps: string;
};

const SOURCES = { equipe: "Équipe", manuel: "Ajoutée à la main", variable: "Variable d'environnement", conseiller: "Selon le dossier" } as const;
const initiales = (n: string) => n.replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]!.toUpperCase()).join("") || "@";

function useAgir() {
  const [retour, setRetour] = useState<Retour | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const agir = (f: () => Promise<Retour>, question?: string) => {
    if (question && !confirm(question)) return;
    demarrer(async () => {
      const x = await f();
      if (!x.ok || x.message) setRetour(x);
      router.refresh();
    });
  };
  return { retour, setRetour, enCours, agir };
}

export function Destinataires({ dests }: { dests: DestVue[] }) {
  const { retour, setRetour, enCours, agir } = useAgir();
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  return (
    <>
      <Toast retour={retour} fermer={() => setRetour(null)} />
      <ul className={s.personnes}>
        {dests.map((d) => (
          <li key={d.cle} className={s.personne} data-pause={d.enPause}>
            <span className={s.avatar} data-source={d.source} aria-hidden>
              {d.source === "conseiller" ? "C" : initiales(d.nom)}
            </span>
            <div style={{ minWidth: 0 }}>
              <b>{d.nom}</b>
              <small>
                <span>{d.email ?? "Le commercial ou conseiller de chaque dossier"}</span>
                <span className={r.puce} data-ton={d.source === "manuel" ? "ok" : d.source === "variable" ? "attention" : "info"} style={{ height: 20 }}>
                  {SOURCES[d.source]}
                </span>
                {d.enPause && (
                  <span className={r.puce} data-ton="neutre" style={{ height: 20 }}>
                    En pause
                  </span>
                )}
              </small>
            </div>
            <div className={s.personneGestes}>
              <button type="button" className={r.bouton} disabled={enCours} onClick={() => agir(() => mettreEnPause(d.cle, !d.enPause))}>
                {d.enPause ? "Reprendre" : "Pause"}
              </button>
              {d.source === "manuel" && (
                <button type="button" className={r.bouton} data-ton="danger" disabled={enCours} onClick={() => agir(() => retirerDestinataire(d.cle), `Retirer ${d.email} de la liste ?`)}>
                  Retirer
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <form
        className={s.ajout}
        onSubmit={(e) => {
          e.preventDefault();
          agir(async () => {
            const x = await ajouterDestinataire(email, nom);
            if (x.ok) {
              setEmail("");
              setNom("");
            }
            return x;
          });
        }}
      >
        <input type="email" required placeholder="adresse@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Adresse à ajouter" />
        <input placeholder="Nom (boîte commune…)" value={nom} onChange={(e) => setNom(e.target.value)} aria-label="Nom de l'adresse" />
        <button type="submit" className={r.bouton} data-ton="principal" data-taille="grand" disabled={enCours || !email.trim()}>
          Ajouter
        </button>
      </form>
    </>
  );
}

const TEXTE = {
  code: { libelle: "Texte du code, repris tel quel", ton: "info" },
  neutre: { libelle: "Texte neutre, à valider", ton: "attention" },
  valide: { libelle: "Texte validé par l'équipe", ton: "ok" },
} as const;

export function Catalogue({ alertes, groupes }: { alertes: AlerteVue[]; groupes: string[] }) {
  const { retour, setRetour, enCours, agir } = useAgir();
  const [ouverte, setOuverte] = useState<AlerteVue | null>(null);
  const [apercu, setApercu] = useState<{ titre: string; sujet: string; html: string } | null>(null);
  const [, demarrer] = useTransition();
  const voir = (a: AlerteVue) =>
    demarrer(async () => {
      const x = await apercuAlerte(a.cle);
      if (x.ok) setApercu({ titre: a.titre, sujet: x.sujet, html: x.html });
      else setRetour(x);
    });
  return (
    <>
      <Toast retour={retour} fermer={() => setRetour(null)} />
      {groupes.map((g) => (
        <div key={g} className={s.groupe}>
          <p className={s.groupeTitre}>{g}</p>
          <ul className={s.alertes}>
            {alertes
              .filter((a) => a.groupe === g)
              .map((a) => (
                <li key={a.cle} id={`alerte-${a.cle}`} className={s.alerte} data-actif={a.actif}>
                  <div>
                    <h3>{a.titre}</h3>
                    <p>{a.quand}</p>
                  </div>
                  <button type="button" role="switch" aria-checked={a.actif} className={s.mini} disabled={enCours} onClick={() => agir(() => activerAlerte(a.cle, !a.actif))}>
                    {a.actif ? "Active" : "Désactivée"}
                    <span />
                  </button>
                  <div className={s.alertePuces}>
                    <span className={r.puce} data-ton={a.branchee ? "ok" : "danger"} title={a.ou}>
                      <i />
                      {a.branchee ? "Branchée" : "Non branchée"}
                    </span>
                    <span className={r.puce} data-ton={TEXTE[a.texte].ton}>
                      {TEXTE[a.texte].libelle}
                    </span>
                    <span className={r.puce} data-ton={a.abonnes ? "info" : "neutre"}>
                      {a.abonnes} abonné{a.abonnes > 1 ? "s" : ""}
                    </span>
                    <span className={s.espace} />
                    <button type="button" className={r.bouton} onClick={() => voir(a)}>
                      Aperçu
                    </button>
                    {a.texte !== "code" && (
                      <button type="button" className={r.bouton} onClick={() => setOuverte(a)}>
                        Modifier le texte
                      </button>
                    )}
                  </div>
                  {!a.branchee && <p style={{ gridColumn: "1 / -1", margin: 0 }}>{a.ou}</p>}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {ouverte && <Editeur alerte={ouverte} fermer={() => setOuverte(null)} agir={agir} enCours={enCours} />}
      {apercu && (
        <div className={r.fond} role="dialog" aria-modal="true" aria-label={`Aperçu : ${apercu.titre}`} onClick={() => setApercu(null)}>
          <div className={r.fenetre} onClick={(e) => e.stopPropagation()}>
            <header>
              <div style={{ flex: 1 }}>
                <h3>{apercu.titre}</h3>
                <p>Objet : {apercu.sujet} · valeurs d’exemple</p>
              </div>
              <button type="button" className={r.bouton} onClick={() => setApercu(null)}>
                Fermer
              </button>
            </header>
            <iframe className={r.cadre} title="Aperçu de l’alerte" sandbox="" srcDoc={apercu.html} />
          </div>
        </div>
      )}
    </>
  );
}

function Editeur({ alerte, fermer, agir, enCours }: { alerte: AlerteVue; fermer: () => void; agir: ReturnType<typeof useAgir>["agir"]; enCours: boolean }) {
  const [objet, setObjet] = useState(alerte.objet);
  const [corps, setCorps] = useState(alerte.corps);
  const [apercu, setApercu] = useState<{ sujet: string; html: string } | null>(null);
  const [, demarrer] = useTransition();
  const zone = useRef<HTMLTextAreaElement>(null);
  const rafraichir = () =>
    demarrer(async () => {
      const x = await apercuAlerte(alerte.cle, { objet, corps });
      if (x.ok) setApercu({ sujet: x.sujet, html: x.html });
    });
  const inserer = (v: string) => {
    const t = zone.current;
    if (!t) return setCorps((c) => `${c}{${v}}`);
    const a = t.selectionStart;
    setCorps(`${corps.slice(0, a)}{${v}}${corps.slice(t.selectionEnd)}`);
  };
  return (
    <div className={r.fond} role="dialog" aria-modal="true" aria-label={`Texte : ${alerte.titre}`} onClick={fermer}>
      <div className={r.fenetre} style={{ width: "min(1080px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <header>
          <div style={{ flex: 1 }}>
            <h3>{alerte.titre}</h3>
            <p>Un texte neutre, qui dit les faits de l’événement. Enregistré, il est validé ; vidé, le texte de départ revient.</p>
          </div>
          <button type="button" className={r.bouton} onClick={fermer}>
            Fermer
          </button>
        </header>
        <div className={s.editeur}>
          <div className={s.editeurForm}>
            <label htmlFor="objet-alerte">Objet</label>
            <input id="objet-alerte" value={objet} onChange={(e) => setObjet(e.target.value)} />
            <label htmlFor="corps-alerte">Texte</label>
            <textarea id="corps-alerte" ref={zone} value={corps} onChange={(e) => setCorps(e.target.value)} />
            <div className={s.jetons}>
              {alerte.variables.map((v) => (
                <button key={v} type="button" onClick={() => inserer(v)}>
                  {`{${v}}`}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button type="button" className={r.bouton} data-taille="grand" onClick={rafraichir}>
                Aperçu
              </button>
              <button
                type="button"
                className={r.bouton}
                data-taille="grand"
                data-ton="principal"
                disabled={enCours}
                onClick={() =>
                  agir(async () => {
                    const x = await enregistrerTexte(alerte.cle, objet, corps);
                    if (x.ok) fermer();
                    return x;
                  })
                }
              >
                Enregistrer et valider
              </button>
            </div>
          </div>
          <div className={s.editeurApercu}>
            <p>{apercu ? `Objet : ${apercu.sujet}` : "Cliquez sur « Aperçu » pour voir l’e-mail, avec des valeurs d’exemple."}</p>
            {apercu ? <iframe title="Aperçu" sandbox="" srcDoc={apercu.html} /> : <div />}
          </div>
        </div>
      </div>
    </div>
  );
}

const Coche = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export function Matrice({ dests, alertes }: { dests: DestVue[]; alertes: AlerteVue[] }) {
  const { retour, setRetour, agir } = useAgir();
  // Le geste se voit tout de suite ; la page se recharge derrière.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const etat = (d: DestVue, a: string) => local[`${d.cle}|${a}`] ?? d.abonnements[a]?.abonne ?? false;
  const basculer = (d: DestVue, a: AlerteVue) => {
    const v = !etat(d, a.cle);
    setLocal((l) => ({ ...l, [`${d.cle}|${a.cle}`]: v }));
    agir(() => abonner(d.cle, a.cle, v));
  };
  const tout = (d: DestVue, v: boolean) => {
    setLocal((l) => ({ ...l, ...Object.fromEntries(alertes.map((a) => [`${d.cle}|${a.cle}`, v])) }));
    agir(() => toutOuRien(d.cle, v));
  };
  return (
    <>
      <Toast retour={retour} fermer={() => setRetour(null)} />
      <div className={s.matriceCadre}>
        <table className={s.matrice}>
          <thead>
            <tr>
              <th scope="col">Destinataire</th>
              {alertes.map((a) => (
                <th key={a.cle} scope="col" title={a.quand}>
                  <div className={s.entete} data-actif={a.actif}>
                    <span>{a.titre}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dests.map((d) => (
              <tr key={d.cle}>
                <td>
                  <div className={s.ligneNom}>
                    <span className={s.avatar} data-source={d.source} aria-hidden style={{ width: 30, height: 30, borderRadius: 10, fontSize: 11 }}>
                      {d.source === "conseiller" ? "C" : initiales(d.nom)}
                    </span>
                    <div>
                      <b>{d.nom}</b>
                      <small>{d.enPause ? "En pause : ne reçoit rien" : (d.email ?? "Selon le dossier")}</small>
                    </div>
                    <div className={s.toutRien}>
                      <button type="button" onClick={() => tout(d, true)} aria-label={`${d.nom} : toutes les alertes`}>
                        Tout
                      </button>
                      <button type="button" onClick={() => tout(d, false)} aria-label={`${d.nom} : aucune alerte`}>
                        Rien
                      </button>
                    </div>
                  </div>
                </td>
                {alertes.map((a) => {
                  const on = etat(d, a.cle);
                  return (
                    <td key={a.cle} className={s.case}>
                      <button
                        type="button"
                        className={s.coche}
                        aria-pressed={on}
                        data-attenue={d.enPause || !a.actif}
                        title={`${d.nom} — ${a.titre} : ${on ? "abonné" : "non abonné"}${d.abonnements[a.cle]?.office && local[`${d.cle}|${a.cle}`] === undefined ? " (d'office)" : ""}`}
                        aria-label={`${d.nom}, ${a.titre}`}
                        onClick={() => basculer(d, a)}
                      >
                        <Coche />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.legendeMatrice}>
        <span>Une case : un geste, enregistré aussitôt.</span>
        <span>Atténuée : adresse en pause ou alerte désactivée (rien ne part).</span>
        <span>« Le conseiller du dossier » : le commercial du dossier concerné, quand il y en a un.</span>
      </p>
    </>
  );
}
