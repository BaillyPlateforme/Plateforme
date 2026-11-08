"use client";
import { useRef, useState } from "react";
import { TAUX_TVA, nouvelId, type Chiffrage, type Groupe, type LigneDevis } from "../modele";
import { r2, type Calcul } from "../calcul";
import { Champ, Interrupteur, Nombre, PICTOS, Pic, Section, Segment, euros, pct } from "./champs";
import s from "../editeur.module.css";

/*
 * L'onglet Chiffrage : le mode (forfait ou 5 postes), les lignes de base et
 * les lignes « Divers » à libellé libre — quantité, prix unitaire, TVA par
 * ligne —, la remise, l'assurance contractuelle et dommage. Saisie en ligne :
 * Entrée ajoute une ligne, la poignée glisse pour réordonner (ou ↑ ↓ au
 * clavier), la corbeille supprime (annulable).
 */

type Props = {
  chiffrage: Chiffrage;
  calcul: Calcul;
  onChange: (c: Chiffrage) => void;
  tvaDefaut: number;
  tvaAssurance: number;
  postesTarif: string[];
};

export default function OngletChiffrage({ chiffrage, calcul, onChange, tvaDefaut, tvaAssurance, postesTarif }: Props) {
  const ht = chiffrage.saisie === "ht";
  const maj = (p: Partial<Chiffrage>) => onChange({ ...chiffrage, ...p });
  const majLigne = (id: string, p: Partial<LigneDevis>) => maj({ lignes: chiffrage.lignes.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const [retiree, setRetiree] = useState<{ ligne: LigneDevis; index: number } | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  function ajouter(groupe: Groupe, apres?: string) {
    const l: LigneDevis = { id: nouvelId(), groupe, libelle: "", detail: "", qte: 1, unite: "", pu: 0, tva: tvaDefaut, charge: "bailly" };
    const lignes = [...chiffrage.lignes];
    const i = apres ? lignes.findIndex((x) => x.id === apres) : -1;
    if (i >= 0) lignes.splice(i + 1, 0, l);
    else {
      // À la fin de son groupe : les lignes de base avant les divers.
      const dernier = lignes.map((x) => x.groupe).lastIndexOf(groupe);
      lignes.splice(dernier >= 0 ? dernier + 1 : groupe === "base" ? 0 : lignes.length, 0, l);
    }
    maj({ lignes });
    setFocusId(l.id);
  }
  function supprimer(id: string) {
    const index = chiffrage.lignes.findIndex((l) => l.id === id);
    if (index < 0) return;
    setRetiree({ ligne: chiffrage.lignes[index], index });
    maj({ lignes: chiffrage.lignes.filter((l) => l.id !== id) });
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setRetiree(null), 7000);
  }
  function restaurer() {
    if (!retiree) return;
    const lignes = [...chiffrage.lignes];
    lignes.splice(Math.min(retiree.index, lignes.length), 0, retiree.ligne);
    maj({ lignes });
    setRetiree(null);
  }
  /** Déplace une ligne à la place `cible` de son groupe. */
  function deplacer(id: string, cible: number) {
    const l = chiffrage.lignes.find((x) => x.id === id);
    if (!l) return;
    const groupe = chiffrage.lignes.filter((x) => x.groupe === l.groupe && x.id !== id);
    groupe.splice(Math.max(0, Math.min(cible, groupe.length)), 0, l);
    const autres = chiffrage.lignes.filter((x) => x.groupe !== l.groupe);
    maj({ lignes: l.groupe === "base" ? [...groupe, ...autres] : [...autres, ...groupe] });
  }
  function changerSaisie(v: "ht" | "ttc") {
    if (v === chiffrage.saisie) return;
    // Les prix sont convertis : le montant du devis ne bouge pas (au centime près).
    const lignes = chiffrage.lignes.map((l) => ({ ...l, pu: v === "ht" ? r2(l.pu / (1 + l.tva / 100)) : r2(l.pu * (1 + l.tva / 100)) }));
    maj({ saisie: v, lignes });
  }
  /** Les cinq postes du tarif du CRM, libellés seuls (prix à saisir) ; un « Prix de base » encore vierge leur cède la place. */
  function postesTypes() {
    const vierge = (l: LigneDevis) => l.pu === 0 && (!l.libelle.trim() || l.libelle === "Prix de base");
    const gardees = chiffrage.lignes.filter((l) => l.groupe === "base" && !vierge(l));
    const nouvelles = postesTarif
      .filter((libelle) => !gardees.some((g) => g.libelle === libelle))
      .map((libelle): LigneDevis => ({ id: nouvelId(), groupe: "base", libelle, detail: "", qte: 1, unite: "", pu: 0, tva: tvaDefaut, charge: "bailly" }));
    maj({ mode: "postes", lignes: [...gardees, ...nouvelles, ...chiffrage.lignes.filter((l) => l.groupe === "divers")] });
  }

  const base = chiffrage.lignes.filter((l) => l.groupe === "base");
  const divers = chiffrage.lignes.filter((l) => l.groupe === "divers");
  const a = chiffrage.assurance;
  const majAssurance = (p: Partial<typeof a>) => maj({ assurance: { ...a, ...p } });

  return (
    <>
      <div className={s.zoneLignes}>
        <Section
          surtitre="Prestations et matériels"
          titre="Chiffrage"
          texte={chiffrage.mode === "forfait" ? "Forfait : le devis imprimé annonce un prix global ; les lignes Divers restent détaillées." : "5 postes : chaque ligne figure sur le devis imprimé, avec sa quantité et son prix."}
          actions={
            <div className={s.reglagesChiffrage}>
              <Segment label="Type de chiffrage" valeur={chiffrage.mode} options={[["forfait", "Forfait"], ["postes", "5 postes"]]} onChange={(v) => maj({ mode: v })} />
              <Segment label="Prix saisis" petit valeur={chiffrage.saisie} options={[["ht", "Prix HT"], ["ttc", "Prix TTC"]]} onChange={changerSaisie} />
            </div>
          }
        >
          <TableauLignes
            titre={chiffrage.mode === "forfait" ? "Prix de base" : "Les postes"}
            note={chiffrage.mode === "forfait" ? "imprimé en un seul prix" : "imprimé ligne à ligne"}
            lignes={base}
            ht={ht}
            calcul={calcul}
            focusId={focusId}
            onFocusFait={() => setFocusId(null)}
            majLigne={majLigne}
            ajouter={(apres) => ajouter("base", apres)}
            supprimer={supprimer}
            deplacer={deplacer}
            vide={
              <>
                Aucune ligne de base.{" "}
                <button type="button" className={s.lienBouton} onClick={() => ajouter("base")}>Ajouter un prix de base</button>
              </>
            }
            pied={chiffrage.mode === "postes" && base.length <= 1 && (
              <button type="button" className={s.lienBouton} onClick={postesTypes}>Insérer les 5 postes du tarif ({postesTarif.join(", ").toLowerCase()})</button>
            )}
          />
          <TableauLignes
            titre="Divers"
            note="libellés libres"
            lignes={divers}
            ht={ht}
            calcul={calcul}
            focusId={focusId}
            onFocusFait={() => setFocusId(null)}
            majLigne={majLigne}
            ajouter={(apres) => ajouter("divers", apres)}
            supprimer={supprimer}
            deplacer={deplacer}
            vide={<>Une ligne Divers ajoute un supplément, un service ou une mention chiffrée, au libellé de votre choix.</>}
          />
          {retiree && (
            <div className={s.annulation} role="status">
              <span>Ligne « {retiree.ligne.libelle || "sans libellé"} » supprimée.</span>
              <button type="button" onClick={restaurer}>Annuler</button>
            </div>
          )}
          <div className={s.remise}>
            <Champ label="Remise">
              <Nombre valeur={chiffrage.remisePct || null} onChange={(v) => maj({ remisePct: v ?? 0 })} suffixe="%" min={0} max={100} placeholder="0" label="Remise en pourcentage" />
            </Champ>
            <dl className={s.totauxLigne}>
              <div><dt>Brut {ht ? "HT" : "TTC"}</dt><dd>{euros(calcul.brut)}</dd></div>
              <div><dt>Remise</dt><dd>{calcul.remise ? `− ${euros(calcul.remise)}` : euros(0)}</dd></div>
              <div><dt>Net {ht ? "HT" : "TTC"}</dt><dd><b>{euros(calcul.net)}</b></dd></div>
            </dl>
          </div>
        </Section>
      </div>
      <div className={s.zoneAssurance}>
        <Section
          surtitre="Assurance"
          titre="Assurance contractuelle et dommage"
          texte="Prime = valeur déclarée × taux. Rien n'est imprimé tant qu'aucune prime n'est calculée. Taux à fournir par Bailly : aucun n'est prérempli."
          actions={
            <Champ label="TVA de l'assurance" className={s.champEtroit}>
              <select value={a.tva ?? ""} onChange={(e) => majAssurance({ tva: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">{String(tvaAssurance).replace(".", ",")} % (par défaut)</option>
                {TAUX_TVA.map((t) => <option key={t} value={t}>{String(t).replace(".", ",")} %</option>)}
              </select>
            </Champ>
          }
        >
          <div className={s.assurances}>
            <div className={s.assurance}>
              <b>Contractuelle</b>
              <Champ label="Valeur déclarée"><Nombre valeur={a.contractuelle.valeur} onChange={(v) => majAssurance({ contractuelle: { ...a.contractuelle, valeur: v } })} suffixe="€" placeholder="0" /></Champ>
              <Champ label="Taux"><Nombre valeur={a.contractuelle.taux} onChange={(v) => majAssurance({ contractuelle: { ...a.contractuelle, taux: v } })} suffixe="%" placeholder="—" min={0} max={100} /></Champ>
              <span className={s.primeVide} />
              <span className={s.prime}><small>Prime HT</small>{euros(calcul.primeContractuelle)}</span>
            </div>
            <div className={s.assurance}>
              <b>Dommage</b>
              <Champ label="Valeur déclarée"><Nombre valeur={a.dommage.valeur} onChange={(v) => majAssurance({ dommage: { ...a.dommage, valeur: v } })} suffixe="€" placeholder="0" /></Champ>
              <Champ label="Taux"><Nombre valeur={a.dommage.taux} onChange={(v) => majAssurance({ dommage: { ...a.dommage, taux: v } })} suffixe="%" placeholder="—" min={0} max={100} /></Champ>
              <div className={s.franchise}>
                <Champ label="Franchise"><Nombre valeur={a.dommage.franchise} disabled={a.dommage.sansFranchise} onChange={(v) => majAssurance({ dommage: { ...a.dommage, franchise: v } })} suffixe="€" placeholder="—" /></Champ>
                <Interrupteur actif={a.dommage.sansFranchise} onChange={(v) => majAssurance({ dommage: { ...a.dommage, sansFranchise: v, franchise: v ? null : a.dommage.franchise } })} label="Sans franchise" />
              </div>
              <span className={s.prime}><small>Prime HT</small>{euros(calcul.primeDommage)}</span>
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}

function TableauLignes({
  titre, note, lignes, ht, calcul, majLigne, ajouter, supprimer, deplacer, vide, pied, focusId, onFocusFait,
}: {
  titre: string;
  note: string;
  lignes: LigneDevis[];
  ht: boolean;
  calcul: Calcul;
  majLigne: (id: string, p: Partial<LigneDevis>) => void;
  ajouter: (apres?: string) => void;
  supprimer: (id: string) => void;
  deplacer: (id: string, cible: number) => void;
  vide: React.ReactNode;
  pied?: React.ReactNode;
  focusId: string | null;
  onFocusFait: () => void;
}) {
  const [glisse, setGlisse] = useState<string | null>(null);
  const [precisions, setPrecisions] = useState<Set<string>>(() => new Set(lignes.filter((l) => l.detail).map((l) => l.id)));
  const rangs = useRef(new Map<string, HTMLDivElement>());

  function bouger(e: React.PointerEvent) {
    if (!glisse) return;
    const ids = lignes.map((l) => l.id);
    let cible = ids.length - 1;
    for (let i = 0; i < ids.length; i++) {
      const r = rangs.current.get(ids[i])?.getBoundingClientRect();
      if (r && e.clientY < r.top + r.height / 2) { cible = i; break; }
    }
    if (ids.indexOf(glisse) !== cible) deplacer(glisse, cible);
  }

  return (
    <div className={s.groupeLignes}>
      <div className={s.groupeTete}>
        <h3>{titre} <small>{note}</small></h3>
        <button type="button" className={s.ajout} onClick={() => ajouter()}>
          <Pic d={PICTOS.plus} taille={15} /> Ajouter une ligne
        </button>
      </div>
      <div className={s.lignes} role="table" aria-label={titre}>
        <div className={s.ligneTete} role="row">
          <span role="columnheader" aria-label="Ordre" />
          <span role="columnheader">Désignation</span>
          <span role="columnheader" className={s.droite}>Qté</span>
          <span role="columnheader" className={s.droite}>PU {ht ? "HT" : "TTC"}</span>
          <span role="columnheader">TVA</span>
          <span role="columnheader" className={s.droite}>Montant {ht ? "HT" : "TTC"}</span>
          <span role="columnheader">Facturé</span>
          <span role="columnheader" aria-label="Actions" />
        </div>
        {lignes.length === 0 && <div className={s.lignesVide}>{vide}</div>}
        {lignes.map((l, i) => {
          const client = l.charge === "client";
          const ouvert = precisions.has(l.id) || !!l.detail;
          return (
            <div
              key={l.id}
              role="row"
              data-ligne={l.id}
              ref={(el) => { if (el) rangs.current.set(l.id, el); else rangs.current.delete(l.id); }}
              className={s.ligne}
              data-glisse={glisse === l.id ? "" : undefined}
              data-client={client ? "" : undefined}
            >
              <button
                type="button"
                className={s.poignee}
                aria-label={`Déplacer la ligne ${i + 1} (flèches haut et bas)`}
                onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setGlisse(l.id); }}
                onPointerMove={bouger}
                onPointerUp={() => setGlisse(null)}
                onPointerCancel={() => setGlisse(null)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); deplacer(l.id, i - 1); }
                  if (e.key === "ArrowDown" && i < lignes.length - 1) { e.preventDefault(); deplacer(l.id, i + 1); }
                }}
              >
                <Pic d={PICTOS.poignee} taille={16} />
              </button>
              <div className={s.designation}>
                <input
                  type="text"
                  value={l.libelle}
                  placeholder={titre === "Divers" ? "Libellé libre" : "Désignation"}
                  aria-label="Désignation"
                  ref={(el) => { if (el && focusId === l.id) { el.focus(); onFocusFait(); } }}
                  onChange={(e) => majLigne(l.id, { libelle: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouter(l.id); } }}
                />
                {ouvert && (
                  <input type="text" className={s.precision} value={l.detail} placeholder="Précision imprimée sous la ligne (facultatif)" aria-label="Précision" onChange={(e) => majLigne(l.id, { detail: e.target.value })} />
                )}
              </div>
              <Nombre className={s.droite} valeur={l.qte} onChange={(v) => majLigne(l.id, { qte: v ?? 0 })} label="Quantité" onEnter={() => ajouter(l.id)} />
              <Nombre className={s.droite} valeur={l.pu} onChange={(v) => majLigne(l.id, { pu: v ?? 0 })} suffixe="€" label="Prix unitaire" onEnter={() => ajouter(l.id)} />
              <select className={s.tva} value={l.tva} aria-label="Taux de TVA" onChange={(e) => majLigne(l.id, { tva: Number(e.target.value) })}>
                {[...new Set([...TAUX_TVA, l.tva])].map((t) => <option key={t} value={t}>{String(t).replace(".", ",")} %</option>)}
              </select>
              <span className={s.montant}>{client ? <s>{euros(calcul.montants[l.id] ?? 0)}</s> : euros(calcul.montants[l.id] ?? 0)}</span>
              <button type="button" className={s.charge} aria-pressed={!client} onClick={() => majLigne(l.id, { charge: client ? "bailly" : "client" })} title={client ? "À la charge du client : non facturé" : "Facturé au client"}>
                {client ? "Client" : "Bailly"}
              </button>
              <span className={s.actionsLigne}>
                <button type="button" aria-label="Précision" title="Ajouter une précision" aria-pressed={ouvert} onClick={() => setPrecisions((p) => { const n = new Set(p); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })}>
                  <Pic d={PICTOS.note} taille={15} />
                </button>
                <button type="button" aria-label="Supprimer la ligne" title="Supprimer" className={s.supprimer} onClick={() => supprimer(l.id)}>
                  <Pic d={PICTOS.corbeille} taille={15} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      {pied && <div className={s.groupePied}>{pied}</div>}
    </div>
  );
}

/** Le récapitulatif du devis, à droite de la saisie : du brut au TTC, les arrhes et la marge. */
export function Recapitulatif({
  calcul, saisie, remisePct, arrhesPct, tvaAssurance, marge,
}: {
  calcul: Calcul;
  saisie: "ht" | "ttc";
  remisePct: number;
  arrhesPct: number | null;
  tvaAssurance: number;
  marge?: { montant: number; pct: number | null; libelle: string } | null;
}) {
  const ht = saisie === "ht";
  return (
    <aside className={s.zoneRecap} aria-label="Récapitulatif du devis"><div className={s.recap}>
      <p className={s.recapTitre}>Récapitulatif</p>
      <dl>
        <div><dt>Brut {ht ? "HT" : "TTC"}</dt><dd>{euros(calcul.brut)}</dd></div>
        <div><dt>Remise{remisePct ? ` ${pct(remisePct)}` : ""}</dt><dd>{calcul.remise ? `− ${euros(calcul.remise)}` : "—"}</dd></div>
        <div className={s.recapFort}><dt>Net {ht ? "HT" : "TTC"}</dt><dd>{euros(calcul.net)}</dd></div>
        {calcul.parTaux.map((t) => (
          <div key={t.taux}><dt>TVA {pct(t.taux)}{calcul.parTaux.length > 1 ? <small> sur {euros(t.ht)}</small> : null}</dt><dd>{euros(t.tva)}</dd></div>
        ))}
        {calcul.assuranceHt > 0 && (
          <>
            <div><dt>Assurance HT</dt><dd>{euros(calcul.assuranceHt)}</dd></div>
            <div><dt>TVA assurance {pct(tvaAssurance)}</dt><dd>{euros(calcul.assuranceTva)}</dd></div>
          </>
        )}
        <div className={s.recapSepare}><dt>Total HT</dt><dd>{euros(calcul.ht)}</dd></div>
        <div><dt>Total TVA</dt><dd>{euros(calcul.tva)}</dd></div>
      </dl>
      <div className={s.recapTtc}>
        <small>Total TTC</small>
        <b>{euros(calcul.ttc)}</b>
      </div>
      {arrhesPct != null && (
        <p className={s.recapArrhes}>
          Arrhes {pct(arrhesPct)} <b>{euros(r2((calcul.ttc * arrhesPct) / 100))}</b>
        </p>
      )}
      {marge && (
        <p className={s.recapMarge} data-negatif={marge.montant < 0 ? "" : undefined}>
          {marge.libelle} <b>{euros(marge.montant)}{marge.pct != null ? ` · ${pct(marge.pct)}` : ""}</b>
        </p>
      )}
    </div></aside>
  );
}
