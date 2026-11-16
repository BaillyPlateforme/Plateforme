"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { apercuRelance, enregistrerRegle, exclureDossier, retirerExclusion, simuler, type Simulation } from "./actions";
import type { Apercu } from "@/crm/messages/actions";
import { Colonnes } from "./Graphiques";
import { Toast, useGestes } from "./Kanban";
import { CANAUX, creneauOuvert, JOURS, repereDe, SEGMENTS, type Canal, type DefRelance, type ReglageRegle } from "./regles";
import { IconeCanal } from "./Section";
import s from "./relances.module.css";

/*
 * La configuration des relances : une grande carte par type — activation,
 * premier délai et son repère, intervalle et nombre, canaux et leurs cartes
 * dans « Courriers et SMS » (avec aperçu), jours et heures d'envoi,
 * exclusions — et, pour chacune, « Simuler » : les relances qu'engendrerait
 * la règle saisie, sans rien envoyer ni enregistrer.
 */

export type EtatCarte = { canal: Canal; cle: string; titre: string; etat: "pret" | "desactivee" | "a_valider" };
export type Exclu = { dossierId: number; ref: string; client: string; type: string };

export interface VueRegle {
  def: DefRelance;
  regle: ReglageRegle;
  majLe: string | null;
  majPar: string | null;
  cartes: EtatCarte[];
  compte: { avenir: number; aujourdhui: number; retard: number; envoyees: number; desactivees: number };
  exclus: Exclu[];
}

const ETAT_CARTE = {
  pret: { libelle: "Texte validé, carte active", ton: "ok" },
  desactivee: { libelle: "Carte désactivée", ton: "attention" },
  a_valider: { libelle: "Texte à rédiger et valider", ton: "attention" },
} as const;

const egal = (a: ReglageRegle, b: ReglageRegle) => JSON.stringify(a) === JSON.stringify(b);
/*
 * Rendu des deux côtés (serveur en temps universel sur Railway, navigateur à l'heure de Paris) : chaque date
 * se met en forme avec le fuseau de Paris explicite, sinon le texte diffère (erreur d'hydratation n° 418).
 * Un jour AAAA-MM-JJ se lit à midi UTC, que le fuseau de Paris laisse le même jour.
 */
const PARIS = "Europe/Paris";
const jourFr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: PARIS });

export default function Configuration({ vues, dossiers, heureVeille }: { vues: VueRegle[]; dossiers: { id: number; ref: string; client: string }[]; heureVeille: number }) {
  return (
    <>
      <datalist id="dossiers-relances">
        {dossiers.map((d) => (
          <option key={d.id} value={`${d.ref} · ${d.client}`} />
        ))}
      </datalist>
      {vues.map((v) => (
        <CarteRegle key={v.def.type} vue={v} dossiers={dossiers} heureVeille={heureVeille} />
      ))}
    </>
  );
}

function CarteRegle({ vue, dossiers, heureVeille }: { vue: VueRegle; dossiers: { id: number; ref: string; client: string }[]; heureVeille: number }) {
  const { def } = vue;
  const [v, setV] = useState<ReglageRegle>(vue.regle);
  const [sim, setSim] = useState<Simulation | null>(null);
  const [apercu, setApercu] = useState<{ titre: string; apercu: Apercu } | null>(null);
  const { retour, setRetour, enCours, agir } = useGestes();
  const [simEnCours, demarrerSim] = useTransition();
  const modifie = !egal(v, vue.regle);
  const maj = (p: Partial<ReglageRegle>) => setV((x) => ({ ...x, ...p }));
  const repere = repereDe(def, v.repere);

  const lancerSimulation = () =>
    demarrerSim(async () => {
      const r = await simuler(def.type, v);
      if (r.ok) setSim(r.simulation);
      else setRetour(r);
    });
  const voir = (canal: Canal) =>
    demarrerSim(async () => {
      const r = await apercuRelance(def.type, canal);
      if (r.ok) setApercu({ titre: r.titre, apercu: r.apercu });
      else setRetour(r);
    });

  // La frise : le repère, puis chaque relance, en jours depuis le repère.
  const frise = useMemo(() => {
    const signe = repere.sens === "apres" ? 1 : -1;
    return Array.from({ length: v.nombre_max }, (_, i) => {
      const j = signe * v.premier_delai_jours + i * v.intervalle_jours;
      return { rang: i + 1, j, horsBorne: repere.sens === "avant" && j >= 0 };
    });
  }, [repere.sens, v.nombre_max, v.premier_delai_jours, v.intervalle_jours]);

  const plage = v.heure_debut != null || v.heure_fin != null || !!v.jours_envoi;
  const veilleHors = (v.heure_debut != null || v.heure_fin != null) && !creneauOuvert({ jours_envoi: null, heure_debut: v.heure_debut, heure_fin: v.heure_fin }, "2026-01-05", heureVeille);
  const joursActifs = v.jours_envoi ?? JOURS.map((j) => j.n);
  const exclusType = vue.exclus.filter((e) => e.type === def.type);
  const exclusTous = vue.exclus.filter((e) => e.type === "*");

  return (
    <section id={def.type} className={s.regle} data-actif={v.actif} style={{ ["--c" as string]: def.couleur }}>
      <Toast retour={retour} fermer={() => setRetour(null)} />
      <header className={s.regleTete}>
        <span className={s.regleEmbleme} aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <div>
          <h2>{def.libelle}</h2>
          <p>{def.objet}</p>
          <div className={s.regleChiffres}>
            <span className={s.puce} data-ton="info">{vue.compte.avenir} à venir</span>
            <span className={s.puce} data-ton={vue.compte.aujourdhui ? "info" : "neutre"}>{vue.compte.aujourdhui} aujourd’hui</span>
            <span className={s.puce} data-ton={vue.compte.retard ? "danger" : "neutre"}>{vue.compte.retard} en retard</span>
            <span className={s.puce} data-ton="ok">{vue.compte.envoyees} envoyée{vue.compte.envoyees > 1 ? "s" : ""}</span>
            <span className={s.puce} data-ton="neutre">{vue.compte.desactivees} désactivée{vue.compte.desactivees > 1 ? "s" : ""}</span>
          </div>
        </div>
        <button type="button" role="switch" aria-checked={v.actif} className={s.interrupteur} onClick={() => maj({ actif: !v.actif })}>
          {v.actif ? "Active" : "Désactivée"}
          <span />
        </button>
      </header>

      <div className={s.regleCorps}>
        {/* 1 · Quand */}
        <div className={s.bloc}>
          <h3 className={s.blocTitre}>
            <em>1</em>Quand relancer
          </h3>
          <div className={s.phrase}>
            Première relance
            <Nombre valeur={v.premier_delai_jours} min={0} max={120} unite="jours" onChange={(n) => maj({ premier_delai_jours: n })} libelle="Premier délai" />
            <select className={s.choix} value={v.repere} onChange={(e) => maj({ repere: e.target.value })} aria-label="Repère du premier délai">
              {def.reperes.map((r) => (
                <option key={r.cle} value={r.cle}>
                  {r.libelle}
                </option>
              ))}
            </select>
          </div>
          <div className={s.phrase}>
            Puis tous les
            <Nombre valeur={v.intervalle_jours} min={1} max={60} unite="jours" onChange={(n) => maj({ intervalle_jours: n })} libelle="Intervalle" />
            jusqu’à
            <Nombre valeur={v.nombre_max} min={1} max={6} unite={v.nombre_max > 1 ? "relances" : "relance"} onChange={(n) => maj({ nombre_max: n })} libelle="Nombre au plus" />
          </div>
          <p className={s.aide}>
            <b>Repère :</b> {repere.detail} <b>Arrêt :</b> {def.arret}
          </p>
          <div className={s.frise} aria-label="Frise de la règle">
            <div className={s.friseEtape} data-repere>
              <i>●</i>
              <b>Repère</b>
              <small>{repere.libelle.replace(/^(après|avant) (l'|le |la )?/, "")}</small>
            </div>
            {frise.map((f) => (
              <div key={f.rang} className={s.friseEtape} style={f.horsBorne ? { opacity: 0.4 } : undefined}>
                <i>{f.rang}</i>
                <b>{f.j === 0 ? "le jour même" : `${f.j > 0 ? "+" : "−"}${Math.abs(f.j)} j`}</b>
                <small>{f.horsBorne ? "après la date : ne part pas" : `relance ${f.rang}`}</small>
              </div>
            ))}
          </div>
        </div>

        {/* 2 · Par où */}
        <div className={s.bloc}>
          <h3 className={s.blocTitre}>
            <em>2</em>Par où, avec quel message
            <small>textes dans « Courriers et SMS »</small>
          </h3>
          <div className={s.canauxRegle}>
            {CANAUX.map((c) => {
              const carte = vue.cartes.find((x) => x.canal === c.cle)!;
              const choisi = v.canaux.includes(c.cle);
              return (
                <div key={c.cle} className={s.canalRegle} data-choisi={choisi}>
                  <button
                    type="button"
                    className={s.coche}
                    aria-pressed={choisi}
                    aria-label={`${c.libelle} : ${choisi ? "retirer ce canal" : "ajouter ce canal"}`}
                    onClick={() => maj({ canaux: choisi ? v.canaux.filter((k) => k !== c.cle) : [...v.canaux, c.cle] })}
                  >
                    <IconeCanal canal={c.cle} taille={17} />
                  </button>
                  <div>
                    <b>
                      {c.libelle} · « {carte.titre} »
                    </b>
                    <small>
                      <span className={s.puce} data-ton={ETAT_CARTE[carte.etat].ton} style={{ height: 20, marginTop: 4 }}>
                        <i />
                        {ETAT_CARTE[carte.etat].libelle}
                      </span>
                      {choisi && carte.etat !== "pret" && " — ce canal ne partira pas tant que la carte n’est pas prête."}
                    </small>
                  </div>
                  <div className={s.canalGestes}>
                    {carte.etat !== "a_valider" && (
                      <button type="button" className={s.bouton} disabled={simEnCours} onClick={() => voir(c.cle)}>
                        Aperçu
                      </button>
                    )}
                    <Link className={s.bouton} href={`/modeles#${carte.cle}`}>
                      {carte.etat === "a_valider" ? "Rédiger" : "Modifier"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          {!v.canaux.length && <p className={s.alerte}>Choisissez au moins un canal.</p>}
        </div>

        {/* 3 · Créneau */}
        <div className={s.bloc}>
          <h3 className={s.blocTitre}>
            <em>3</em>Jours et heures d’envoi
            <small>{plage ? "restreints" : "sans restriction"}</small>
          </h3>
          <div>
            <p className={s.aide} style={{ marginBottom: 8 }}>Jours où la veille peut envoyer :</p>
            <div className={s.bascules}>
              {JOURS.map((j) => {
                const on = joursActifs.includes(j.n);
                return (
                  <button
                    key={j.n}
                    type="button"
                    className={s.bascule}
                    aria-pressed={on}
                    title={j.libelle}
                    onClick={() => {
                      const l = on ? joursActifs.filter((n) => n !== j.n) : [...joursActifs, j.n].sort();
                      maj({ jours_envoi: l.length === 7 ? null : l });
                    }}
                  >
                    {j.court}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={s.phrase}>
            Heures :
            <select className={s.choix} value={v.heure_debut ?? ""} onChange={(e) => maj({ heure_debut: e.target.value === "" ? null : Number(e.target.value) })} aria-label="Heure de début">
              <option value="">sans début</option>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  dès {h} h
                </option>
              ))}
            </select>
            <select className={s.choix} value={v.heure_fin ?? ""} onChange={(e) => maj({ heure_fin: e.target.value === "" ? null : Number(e.target.value) })} aria-label="Heure de fin">
              <option value="">sans fin</option>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h + 1} value={h + 1}>
                  avant {h + 1} h
                </option>
              ))}
            </select>
          </div>
          {v.jours_envoi && !v.jours_envoi.length && <p className={s.alerte}>Choisissez au moins un jour.</p>}
          {veilleHors && <p className={s.alerte}>La veille passe vers {heureVeille} h (heure de Paris) : avec cette plage, aucune relance de ce type ne partira automatiquement.</p>}
          <p className={s.aide}>
            Aucune valeur n’est imposée. Une relance qui tombe un jour exclu part au jour permis suivant. Ces réglages ne valent que pour l’envoi automatique de la veille ; « Envoyer » dans le Kanban part tout de suite.
          </p>
        </div>

        {/* 4 · Exclusions */}
        <div className={s.bloc}>
          <h3 className={s.blocTitre}>
            <em>4</em>Exclusions
          </h3>
          <div>
            <p className={s.aide} style={{ marginBottom: 8 }}>Segments de client à ne pas relancer :</p>
            <div className={s.bascules}>
              {SEGMENTS.map((g) => {
                const on = v.segments_exclus.includes(g.cle);
                return (
                  <button
                    key={g.cle}
                    type="button"
                    className={s.bascule}
                    data-exclu
                    aria-pressed={on}
                    onClick={() => maj({ segments_exclus: on ? v.segments_exclus.filter((x) => x !== g.cle) : [...v.segments_exclus, g.cle] })}
                  >
                    {g.libelle}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className={s.aide} style={{ marginBottom: 8 }}>
              Dossiers exclus de cette relance{exclusTous.length ? ` (et ${exclusTous.length} marqué${exclusTous.length > 1 ? "s" : ""} « ne pas relancer » pour tous les types)` : ""} :
            </p>
            {exclusType.length > 0 && (
              <ul className={s.exclus}>
                {exclusType.map((e) => (
                  <li key={e.dossierId}>
                    <span>
                      <Link href={`/dossiers/${e.dossierId}`}>{e.ref}</Link>
                      <small>{e.client}</small>
                    </span>
                    <button type="button" className={s.bouton} disabled={enCours} onClick={() => agir(() => retirerExclusion(e.dossierId, def.type))}>
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <AjoutExclusion type={def.type} dossiers={dossiers} agir={agir} enCours={enCours} />
          </div>
        </div>
      </div>

      <footer className={s.regleBas}>
        <span data-modifie={modifie || undefined}>
          {modifie ? "Modifications non enregistrées" : vue.majLe ? `Enregistrée le ${new Date(vue.majLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: PARIS })}${vue.majPar ? ` par ${vue.majPar}` : ""}` : "Réglages par défaut (provisoires)"}
        </span>
        <button type="button" className={s.bouton} data-taille="grand" disabled={simEnCours} onClick={lancerSimulation}>
          {simEnCours ? "Calcul…" : "Simuler"}
        </button>
        {modifie && (
          <button type="button" className={s.bouton} data-taille="grand" onClick={() => setV(vue.regle)}>
            Rétablir
          </button>
        )}
        <button
          type="button"
          className={s.bouton}
          data-taille="grand"
          data-ton="principal"
          disabled={!modifie || enCours}
          onClick={() => agir(async () => {
            const r = await enregistrerRegle(def.type, v);
            if (r.ok) setSim(null);
            return r;
          })}
        >
          Enregistrer
        </button>
      </footer>

      {sim && <PanneauSimulation sim={sim} fermer={() => setSim(null)} modifie={modifie} />}
      {apercu && <FenetreApercu titre={apercu.titre} apercu={apercu.apercu} fermer={() => setApercu(null)} />}
    </section>
  );
}

function Nombre({ valeur, min, max, unite, onChange, libelle }: { valeur: number; min: number; max: number; unite: string; onChange: (n: number) => void; libelle: string }) {
  return (
    <label className={s.nombre}>
      <input type="number" min={min} max={max} value={Number.isFinite(valeur) ? valeur : ""} aria-label={libelle} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
      <span>{unite}</span>
    </label>
  );
}

function AjoutExclusion({ type, dossiers, agir, enCours }: { type: string; dossiers: { id: number; ref: string; client: string }[]; agir: ReturnType<typeof useGestes>["agir"]; enCours: boolean }) {
  const [saisie, setSaisie] = useState("");
  const choisi = dossiers.find((d) => `${d.ref} · ${d.client}` === saisie || d.ref === saisie.trim());
  return (
    <div className={s.ajout} style={{ marginTop: 8 }}>
      <input list="dossiers-relances" placeholder="Référence ou client du dossier" value={saisie} onChange={(e) => setSaisie(e.target.value)} aria-label="Dossier à exclure" />
      <button
        type="button"
        className={s.bouton}
        style={{ height: 36 }}
        disabled={!choisi || enCours}
        onClick={() =>
          choisi &&
          agir(async () => {
            const r = await exclureDossier(choisi.id, type);
            if (r.ok) setSaisie("");
            return r;
          })
        }
      >
        Exclure
      </button>
    </div>
  );
}

/** Les exclusions « tous types » : les dossiers marqués « ne pas relancer ». */
export function ExclusionsGlobales({ exclus, dossiers }: { exclus: Exclu[]; dossiers: { id: number; ref: string; client: string }[] }) {
  const { retour, setRetour, enCours, agir } = useGestes();
  return (
    <>
      <Toast retour={retour} fermer={() => setRetour(null)} />
      {exclus.length === 0 ? (
        <p className={s.aide}>Aucun dossier marqué « ne pas relancer ».</p>
      ) : (
        <ul className={s.exclus}>
          {exclus.map((e) => (
            <li key={e.dossierId}>
              <span>
                <Link href={`/dossiers/${e.dossierId}`}>{e.ref}</Link>
                <small>{e.client}</small>
              </span>
              <button type="button" className={s.bouton} disabled={enCours} onClick={() => agir(() => retirerExclusion(e.dossierId, "*"))}>
                Relancer de nouveau
              </button>
            </li>
          ))}
        </ul>
      )}
      <AjoutExclusion type="*" dossiers={dossiers} agir={agir} enCours={enCours} />
    </>
  );
}

function PanneauSimulation({ sim, fermer, modifie }: { sim: Simulation; fermer: () => void; modifie: boolean }) {
  const lignes: { libelle: string; cle: "aujourdhui" | "retard" | "j7" | "j30" | "desactivees" | "envoyees"; sous?: string }[] = [
    { libelle: "Aujourd’hui", cle: "aujourdhui" },
    { libelle: "En retard", cle: "retard" },
    { libelle: "Sous 7 jours", cle: "j7", sous: "hors aujourd’hui" },
    { libelle: "Sous 30 jours", cle: "j30" },
    { libelle: "Désactivées", cle: "desactivees" },
    { libelle: "Déjà envoyées", cle: "envoyees" },
  ];
  const b = sim.brouillon;
  return (
    <div className={s.simulation} aria-live="polite">
      <div className={s.simTete}>
        <h3>Simulation{modifie ? " avec les réglages saisis" : " de la règle enregistrée"}</h3>
        <span className={s.puce} data-ton="info">
          <i />
          Rien n’est envoyé ni enregistré
        </span>
        <button type="button" className={s.bouton} style={{ marginLeft: "auto" }} onClick={fermer}>
          Fermer
        </button>
      </div>
      <div className={s.compare}>
        {lignes.map((l) => {
          const a = sim.enregistree[l.cle];
          const n = b[l.cle];
          const d = n - a;
          return (
            <div key={l.cle}>
              <small>{l.libelle}</small>
              <b>
                {n}
                {modifie && d !== 0 && (
                  <span className={s.delta} data-sens={d > 0 ? "plus" : "moins"}>
                    {d > 0 ? "+" : "−"}
                    {Math.abs(d)}
                  </span>
                )}
              </b>
              <span>{modifie ? `règle enregistrée : ${a}` : (l.sous ?? " ")}</span>
            </div>
          );
        })}
      </div>
      <p className={s.aide}>
        <b>À la veille de ce soir :</b> {b.veille.relances} relance{b.veille.relances > 1 ? "s" : ""} partirai{b.veille.relances > 1 ? "ent" : "t"}
        {b.veille.relances ? ` (${b.veille.email} par e-mail, ${b.veille.sms} par SMS)` : ""}
        {b.veille.horsCreneau ? `, ${b.veille.horsCreneau} retenue${b.veille.horsCreneau > 1 ? "s" : ""} par les jours ou heures d’envoi` : ""}. Créneau : {sim.creneau.toLowerCase()}.
        {b.sansDate ? ` ${b.sansDate} dossier${b.sansDate > 1 ? "s" : ""} sans date pour ce repère, ignoré${b.sansDate > 1 ? "s" : ""}.` : ""}
      </p>
      <Colonnes
        petit
        series={[
          ...(modifie ? [{ cle: "enregistree", libelle: "Règle enregistrée", couleur: "#c9c4dc" }] : []),
          { cle: "brouillon", libelle: modifie ? "Avec ces réglages" : "Relances prévues", couleur: "#4b2fe0" },
        ]}
        points={sim.jours.map((j, i) => ({
          cle: j.jour, etiquette: String(Number(j.jour.slice(8))), detail: new Date(`${j.jour}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: PARIS }),
          valeurs: (modifie ? { enregistree: j.enregistree, brouillon: j.brouillon } : { brouillon: j.brouillon }) as Record<string, number>, aujourdhui: i === 0,
        }))}
        vide="Aucune relance prévue dans les 30 prochains jours avec ces réglages."
      />
      {sim.prochaines.length > 0 && (
        <div>
          <p className={s.surtitre}>Les prochaines relances</p>
          <ul className={s.simListe}>
            {sim.prochaines.map((r) => (
              <li key={r.cle} data-col={r.colonne}>
                <time>{jourFr(r.prevue)}</time>
                <span style={{ minWidth: 0, overflow: "hidden" }}>
                  <Link href={`/dossiers/${r.dossierId}`}>{r.client || r.ref}</Link> <small>· {r.ref} · {r.objet}</small>
                </span>
                <small>
                  {r.rang}/{r.sur}
                </small>
                <span className={s.icCanaux}>
                  {r.canaux.map((c) => (
                    <IconeCanal key={c} canal={c} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sim.motifs.length > 0 && (
        <div>
          <p className={s.surtitre}>Désactivées, et pourquoi</p>
          <div className={s.bascules}>
            {sim.motifs.map((m) => (
              <span key={m.motif} className={s.puce} data-ton="neutre">
                {m.n} · {m.motif}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FenetreApercu({ titre, apercu, fermer }: { titre: string; apercu: Apercu; fermer: () => void }) {
  return (
    <div className={s.fond} role="dialog" aria-modal="true" aria-label={`Aperçu : ${titre}`} onClick={fermer}>
      <div className={s.fenetre} onClick={(e) => e.stopPropagation()}>
        <header>
          <div style={{ flex: 1 }}>
            <h3>{titre}</h3>
            <p>{apercu.canal === "sms" ? "SMS, avec des valeurs d’exemple" : `Objet : ${apercu.sujet ?? "—"} · valeurs d’exemple`}</p>
          </div>
          <button type="button" className={s.bouton} onClick={fermer}>
            Fermer
          </button>
        </header>
        {apercu.canal === "sms" ? <div className={s.bulleSms}>{apercu.texte}</div> : <iframe className={s.cadre} title="Aperçu de l’e-mail" sandbox="" srcDoc={apercu.html ?? ""} />}
      </div>
    </div>
  );
}
