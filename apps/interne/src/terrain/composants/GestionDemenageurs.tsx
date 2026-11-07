"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { creerCompte, desactiverCompte, modifierEquipe, reactiverCompte, reinitialiserCompte } from "../actions-bureau";
import type { AgentListe } from "../lib/agents";
import { FORMAT_IDENTIFIANT, identifiantPropose, momentParis } from "../regles";
import d from "./demenageurs.module.css";

/*
 * La gestion des comptes des déménageurs, dans le CRM : la liste (actifs,
 * désactivés), la création, et pour chacun l'équipe, un nouveau mot de passe
 * provisoire, la désactivation ou la réactivation.
 *
 * Le mot de passe provisoire s'affiche une fois, dans une fenêtre à part, avec
 * l'adresse de l'outil : de quoi le dicter ou le recopier au déménageur. Il
 * n'est gardé nulle part ; perdu, on en tire un autre.
 */

type Acces = { identifiant: string; motDePasse: string; nom: string; nouveau: boolean };

const nomDe = (a: { prenom: string; nom: string | null }) => [a.prenom, a.nom].filter(Boolean).join(" ");
const initiales = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => m[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function ilYa(iso: string | null) {
  if (!iso) return null;
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
  return `il y a ${Math.round(m / 1440)} j`;
}

export default function GestionDemenageurs({ agents, equipes }: { agents: AgentListe[]; equipes: string[] }) {
  const router = useRouter();
  const [vue, setVue] = useState<"actifs" | "desactives">("actifs");
  const [acces, setAcces] = useState<Acces | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const [edition, setEdition] = useState<number | null>(null);

  const actifs = agents.filter((a) => a.actif);
  const desactives = agents.filter((a) => !a.actif);
  const liste = vue === "actifs" ? actifs : desactives;

  const agir = (f: () => Promise<{ ok?: boolean; erreur?: string } & Partial<{ identifiant: string; motDePasse: string }>>, apres?: (r: { identifiant?: string; motDePasse?: string }) => void) =>
    demarrer(async () => {
      setErreur(null);
      const r = await f();
      if (!r.ok) {
        setErreur(r.erreur ?? "Une erreur est survenue.");
        return;
      }
      apres?.(r);
      router.refresh();
    });

  return (
    <div className={d.mise}>
      <section className={`card ${d.liste}`}>
        <div className="card-h">
          <h3>Comptes</h3>
          <div className="seg" role="group" aria-label="Comptes affichés">
            <button type="button" className={vue === "actifs" ? "on" : ""} onClick={() => setVue("actifs")}>
              Actifs · {actifs.length}
            </button>
            <button type="button" className={vue === "desactives" ? "on" : ""} onClick={() => setVue("desactives")}>
              Désactivés · {desactives.length}
            </button>
          </div>
        </div>
        {erreur && (
          <div className="alert" role="alert">
            {erreur}
          </div>
        )}
        {liste.length === 0 ? (
          <div className="empty">
            {vue === "actifs" ? "Aucun compte actif. Créez le premier à droite : il sert dès aujourd'hui." : "Aucun compte désactivé."}
          </div>
        ) : (
          <div className={d.defile}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Déménageur</th>
                  <th>Équipe</th>
                  <th>Photos</th>
                  <th>Connexion</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {liste.map((a) => (
                  <Ligne
                    key={a.id}
                    a={a}
                    equipes={equipes}
                    enCours={enCours}
                    edition={edition === a.id}
                    ouvrirEdition={() => setEdition(a.id)}
                    fermerEdition={() => setEdition(null)}
                    enregistrer={(equipe, interimaire) => agir(() => modifierEquipe(a.id, equipe, interimaire), () => setEdition(null))}
                    reinitialiser={() => {
                      if (!window.confirm(`Tirer un nouveau mot de passe provisoire pour ${nomDe(a)} ? L'ancien ne marchera plus.`)) return;
                      agir(
                        () => reinitialiserCompte(a.id),
                        (r) => setAcces({ identifiant: r.identifiant!, motDePasse: r.motDePasse!, nom: nomDe(a), nouveau: false }),
                      );
                    }}
                    desactiver={() => {
                      if (!window.confirm(`Désactiver le compte de ${nomDe(a)} ? Il ne pourra plus se connecter ; ses photos restent aux dossiers.`)) return;
                      agir(() => desactiverCompte(a.id));
                    }}
                    reactiver={() => agir(() => reactiverCompte(a.id))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Creation
        equipes={equipes}
        enCours={enCours}
        creer={(saisie, vider) =>
          agir(
            () => creerCompte(saisie),
            (r) => {
              vider();
              setVue("actifs");
              setAcces({ identifiant: r.identifiant!, motDePasse: r.motDePasse!, nom: [saisie.prenom, saisie.nom].filter(Boolean).join(" "), nouveau: true });
            },
          )
        }
      />

      <datalist id="equipes-planning">
        {equipes.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>

      {acces && <FenetreAcces acces={acces} fermer={() => setAcces(null)} />}
    </div>
  );
}

function Ligne({
  a,
  enCours,
  edition,
  ouvrirEdition,
  fermerEdition,
  enregistrer,
  reinitialiser,
  desactiver,
  reactiver,
}: {
  a: AgentListe;
  equipes: string[];
  enCours: boolean;
  edition: boolean;
  ouvrirEdition: () => void;
  fermerEdition: () => void;
  enregistrer: (equipe: string, interimaire: boolean) => void;
  reinitialiser: () => void;
  desactiver: () => void;
  reactiver: () => void;
}) {
  const [equipe, setEquipe] = useState(a.equipe ?? "");
  const [interimaire, setInterimaire] = useState(a.interimaire);
  const nom = nomDe(a);
  return (
    <tr>
      <td>
        <i className="av">{initiales(nom)}</i>
        <span>
          <b>
            {nom}
            {a.demo && <em className={d.demo}>démo</em>}
          </b>
          <small>{a.identifiant}</small>
        </span>
      </td>
      <td>
        {edition ? (
          <form
            className={d.edition}
            onSubmit={(e) => {
              e.preventDefault();
              enregistrer(equipe, interimaire);
            }}
          >
            <input type="text" list="equipes-planning" value={equipe} onChange={(e) => setEquipe(e.target.value)} placeholder="Équipe 1" aria-label="Équipe" autoFocus />
            <label className="chk">
              <input type="checkbox" checked={interimaire} onChange={(e) => setInterimaire(e.target.checked)} />
              Intérimaire
            </label>
            <button className="btn primary sm" disabled={enCours}>
              Enregistrer
            </button>
            <button type="button" className="btn ghost sm" onClick={fermerEdition}>
              Annuler
            </button>
          </form>
        ) : (
          <span className={d.equipe}>
            <span>{a.equipe ?? <span className="sub">Sans équipe</span>}</span>
            {a.interimaire && <i className="st w">Intérimaire</i>}
            {a.actif && (
              <button type="button" className={d.lien} onClick={ouvrirEdition}>
                Modifier
              </button>
            )}
          </span>
        )}
      </td>
      <td>
        <span>
          <b>{a.photos7j}</b> <span className="sub">sur 7 j</span>
          <small>{a.dernierePhoto ? `${a.photosTotal} en tout · dernière ${ilYa(a.dernierePhoto)}` : "Aucune encore"}</small>
        </span>
      </td>
      <td>
        {!a.actif ? (
          <span>
            <i className="st r">Désactivé</i>
            {a.desactiveLe && <small style={{ display: "block", marginTop: 4 }}>le {momentParis(a.desactiveLe)}</small>}
          </span>
        ) : a.derniereConnexion ? (
          <span>
            {ilYa(a.derniereConnexion)}
            {a.mdpProvisoire && <small style={{ display: "block" }}>Mot de passe provisoire</small>}
          </span>
        ) : (
          <i className="st i">Jamais connecté</i>
        )}
      </td>
      <td className="num">
        <span className={d.actions}>
          {a.actif ? (
            <>
              <button type="button" className="btn ghost sm" onClick={reinitialiser} disabled={enCours} title="Tirer un nouveau mot de passe provisoire">
                Mot de passe
              </button>
              <button type="button" className="btn danger sm" onClick={desactiver} disabled={enCours}>
                Désactiver
              </button>
            </>
          ) : (
            <button type="button" className="btn ghost sm" onClick={reactiver} disabled={enCours}>
              Réactiver
            </button>
          )}
        </span>
      </td>
    </tr>
  );
}

type Saisie = { prenom: string; nom: string; equipe: string; interimaire: boolean; identifiant: string };

function Creation({ enCours, creer }: { equipes: string[]; enCours: boolean; creer: (s: Saisie, vider: () => void) => void }) {
  const vierge: Saisie = { prenom: "", nom: "", equipe: "", interimaire: false, identifiant: "" };
  const [s, setS] = useState<Saisie>(vierge);
  // L'identifiant se propose de lui-même, tant qu'on ne l'a pas retouché.
  const [identifiantTouche, setIdentifiantTouche] = useState(false);
  const identifiant = identifiantTouche ? s.identifiant : identifiantPropose(s.prenom, s.nom);
  const valide = s.prenom.trim().length > 0 && FORMAT_IDENTIFIANT.test(identifiant);
  const vider = () => {
    setS(vierge);
    setIdentifiantTouche(false);
  };
  return (
    <section className={`card ${d.creation}`}>
      <h3>Créer un compte</h3>
      <form
        className={d.formulaire}
        onSubmit={(e) => {
          e.preventDefault();
          if (valide) creer({ ...s, identifiant }, vider);
        }}
      >
        <div className="fld">
          <label htmlFor="dm-prenom">Prénom</label>
          <input id="dm-prenom" type="text" value={s.prenom} onChange={(e) => setS({ ...s, prenom: e.target.value })} required autoComplete="off" />
        </div>
        <div className="fld">
          <label htmlFor="dm-nom">Nom</label>
          <input id="dm-nom" type="text" value={s.nom} onChange={(e) => setS({ ...s, nom: e.target.value })} autoComplete="off" />
        </div>
        <div className="fld">
          <label htmlFor="dm-equipe">Équipe</label>
          <input id="dm-equipe" type="text" list="equipes-planning" value={s.equipe} onChange={(e) => setS({ ...s, equipe: e.target.value })} placeholder="Comme au planning : Équipe 1…" />
        </div>
        <label className="chk">
          <input type="checkbox" checked={s.interimaire} onChange={(e) => setS({ ...s, interimaire: e.target.checked })} />
          Intérimaire
        </label>
        <div className="fld">
          <label htmlFor="dm-identifiant">Identifiant de connexion</label>
          <input
            id="dm-identifiant"
            type="text"
            value={identifiant}
            onChange={(e) => {
              setIdentifiantTouche(true);
              setS({ ...s, identifiant: e.target.value.toLowerCase() });
            }}
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
            placeholder="prenom.n"
          />
          {identifiant && !FORMAT_IDENTIFIANT.test(identifiant) && (
            <span className={d.erreurChamp}>3 à 40 caractères : une lettre d&apos;abord, puis lettres sans accent, chiffres, points ou tirets.</span>
          )}
        </div>
        <button className="btn primary" disabled={enCours || !valide}>
          {enCours ? "Création…" : "Créer le compte"}
        </button>
        <p className="sub">
          Le mot de passe provisoire est tiré au hasard et ne s&apos;affiche qu&apos;une fois, pour le transmettre au déménageur. Il pourra ensuite choisir le sien
          depuis son téléphone.
        </p>
      </form>
    </section>
  );
}

function FenetreAcces({ acces, fermer }: { acces: Acces; fermer: () => void }) {
  const [copie, setCopie] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  // La fenêtre ne s'ouvre qu'après une action, dans le navigateur : l'adresse de la page est connue.
  const [adresse] = useState(() => (typeof window === "undefined" ? "/terrain" : `${window.location.origin}/terrain`));
  useEffect(() => {
    bouton.current?.focus();
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [fermer]);
  const texte = `Bailly Terrain\nAdresse : ${adresse}\nIdentifiant : ${acces.identifiant}\nMot de passe provisoire : ${acces.motDePasse}`;
  return (
    <div className={d.voile} role="dialog" aria-modal="true" aria-labelledby="acces-titre">
      <div className={d.fenetre}>
        <p className={d.surtitre}>{acces.nouveau ? "Compte créé" : "Nouveau mot de passe"}</p>
        <h3 id="acces-titre">L&apos;accès de {acces.nom}</h3>
        <dl className={d.acces}>
          <div>
            <dt>Adresse de l&apos;outil</dt>
            <dd>{adresse}</dd>
          </div>
          <div>
            <dt>Identifiant</dt>
            <dd className={d.code}>{acces.identifiant}</dd>
          </div>
          <div>
            <dt>Mot de passe provisoire</dt>
            <dd className={`${d.code} ${d.grand}`}>{acces.motDePasse}</dd>
          </div>
        </dl>
        <p className={d.avertissement}>Ce mot de passe ne s&apos;affichera plus. S&apos;il se perd, tirez-en un nouveau depuis la liste.</p>
        <div className={d.boutons}>
          <button
            type="button"
            className="btn ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(texte);
                setCopie(true);
              } catch {
                setCopie(false);
              }
            }}
          >
            {copie ? "Copié" : "Copier l'accès"}
          </button>
          <button ref={bouton} type="button" className="btn primary" onClick={fermer}>
            C&apos;est noté
          </button>
        </div>
      </div>
    </div>
  );
}
