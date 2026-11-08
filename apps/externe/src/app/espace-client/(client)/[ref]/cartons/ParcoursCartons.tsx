"use client";

import { useMemo, useState, type ReactNode } from "react";
import { pasBesoinDeCartons, planifierCartons } from "@/lib/actions/espace-client";
import { CAPACITE_SAMEDI, PLAGE_SAMEDI } from "@/lib/espace-client/cartons";
import { dateCourte, jourMois } from "@/lib/espace-client/format";
import { erreursDe, ficheCartonsChamps, ficheCartonsSchema, lireFicheCartons } from "@/lib/espace-client/schemas";
import { Champ, ResumeErreurs, useFormulaire } from "../../../_ui/formulaire";
import { Icone } from "../../../_ui/Icone";

export const DessinCarton = () => (
  <svg className="boxart box-drop" viewBox="0 0 140 140" fill="none" aria-hidden="true">
    <ellipse cx="70" cy="126" rx="46" ry="7" fill="rgba(17,24,32,.08)" />
    <path d="M20 46 70 26l50 20-50 20z" fill="#e2c496" />
    <path d="M20 46v52l50 22V66z" fill="#cfa66c" />
    <path d="M120 46v52l-50 22V66z" fill="#b98c52" />
    <path d="M45 36l50 20v18" stroke="#f5d033" strokeWidth="9" />
    <path d="M20 46 6 62l50 22 14-18z" fill="#dcb982" />
    <path d="M120 46l14 16-50 22-14-18z" fill="#c9a067" />
    <path d="M86 92l20-8M86 100l14-5.6" stroke="rgba(17,24,32,.35)" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

type Fiche = { adresse: string; complement: string; code_acces: string; contact_nom: string; contact_tel: string };

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Stepper({ etape }: { etape: number }) {
  return (
    <div className="stepper">
      {["Fiche", "Samedi", "Confirmation"].map((t, i) => (
        <div key={t} className={i < etape ? "on" : ""}>
          <i />
          <span>
            {i + 1} · {t}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Le parcours de la micro démo : la fiche de renseignements, puis le
 * calendrier des samedis, puis la confirmation. Une livraison déjà planifiée
 * s'affiche à la place, avec de quoi la modifier.
 */
export function ParcoursCartons({
  reference,
  planifiee,
  fiche,
  bornes,
  occupation,
  dejaChoisi,
  modifiable,
  sansCartons,
}: {
  reference: string;
  planifiee: ReactNode | null;
  fiche: Fiche;
  bornes: { min: string; max: string };
  occupation: Record<string, number>;
  dejaChoisi: string | null;
  modifiable: boolean;
  sansCartons: boolean;
}) {
  const [edition, setEdition] = useState(false);
  const [etape, setEtape] = useState(1);
  const [valeurs, setValeurs] = useState<Fiche>(fiche);
  const [choisi, setChoisi] = useState<string | null>(dejaChoisi);
  const [erreursFiche, setErreursFiche] = useState<Record<string, string>>({});
  const [essaiFiche, setEssaiFiche] = useState(0);
  const schema = useMemo(() => ficheCartonsSchema(bornes), [bornes]);
  const { etat, erreurs, enCours, envoyerDirect, essai } = useFormulaire(planifierCartons.bind(null, reference), () => ({}));

  const premierMois = new Date(`${bornes.min.slice(0, 7)}-01T12:00:00`);
  const dernierMois = new Date(`${bornes.max.slice(0, 7)}-01T12:00:00`);
  const [mois, setMois] = useState(() => (dejaChoisi && dejaChoisi >= bornes.min ? new Date(`${dejaChoisi.slice(0, 7)}-01T12:00:00`) : premierMois));

  if (planifiee && !edition) {
    return (
      <>
        {planifiee}
        {modifiable && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setEdition(true)}>
              Modifier ma livraison
            </button>
          </div>
        )}
      </>
    );
  }

  if (bornes.min > bornes.max) {
    return (
      <div className="empty-slot">
        <Icone nom="calendar" />
        <strong>Plus de samedi disponible</strong>
        Votre déménagement est trop proche pour une livraison de cartons en ligne : appelez votre conseiller.
      </div>
    );
  }

  // Étape 1 · la fiche.
  if (etape === 1) {
    const v = valeurs;
    return (
      <>
        <Stepper etape={1} />
        <form
          className="card"
          noValidate
          // La fiche ne part pas au serveur : elle mène au calendrier, que l'aperçu de l'équipe peut voir (GardeApercu).
          data-apercu-libre
          onSubmit={(ev) => {
            ev.preventDefault();
            const fd = new FormData(ev.currentTarget);
            const brut = { adresse: String(fd.get("adresse") ?? ""), complement: String(fd.get("complement") ?? ""), code_acces: String(fd.get("code_acces") ?? ""), contact_nom: String(fd.get("contact_nom") ?? ""), contact_tel: String(fd.get("contact_tel") ?? "") };
            const r = ficheCartonsChamps.safeParse(brut);
            setEssaiFiche((n) => n + 1);
            if (!r.success) {
              setErreursFiche(erreursDe(r.error));
              return;
            }
            setErreursFiche({});
            setValeurs(brut);
            setEtape(2);
          }}
        >
          <div className="rule-title">
            <span className="n">01</span>
            <h2>Où livrer vos cartons ?</h2>
          </div>
          <ResumeErreurs erreurs={erreursFiche} essai={essaiFiche} />
          <div className="form-grid">
            <Champ id="k-adr" label="Adresse de livraison" erreur={erreursFiche.adresse} className="full">
              <input id="k-adr" name="adresse" className="input" defaultValue={v.adresse} autoComplete="street-address" />
            </Champ>
            <Champ id="k-cpl" label="Complément d'adresse" aide="(facultatif)" erreur={erreursFiche.complement}>
              <input id="k-cpl" name="complement" className="input" defaultValue={v.complement} placeholder="Bâtiment, étage, porte" />
            </Champ>
            <Champ id="k-code" label="Code d'accès" aide="(facultatif)" erreur={erreursFiche.code_acces}>
              <input id="k-code" name="code_acces" className="input" defaultValue={v.code_acces} placeholder="Digicode, interphone" autoComplete="off" />
            </Champ>
            <Champ id="k-nom" label="Personne présente" erreur={erreursFiche.contact_nom}>
              <input id="k-nom" name="contact_nom" className="input" defaultValue={v.contact_nom} autoComplete="name" />
            </Champ>
            <Champ id="k-tel" label="Téléphone de la personne présente" erreur={erreursFiche.contact_tel}>
              <input id="k-tel" name="contact_tel" className="input" defaultValue={v.contact_tel} inputMode="tel" autoComplete="tel" />
            </Champ>
          </div>
          <div className="row-actions">
            {edition ? (
              <button type="button" className="btn btn-ghost" onClick={() => setEdition(false)}>
                Annuler
              </button>
            ) : sansCartons ? (
              <span className="note">Vous aviez indiqué ne pas avoir besoin de cartons.</span>
            ) : (
              <button type="button" className="link-arrow link-btn" data-apercu-bloque onClick={() => pasBesoinDeCartons(reference)}>
                Je n&apos;ai pas besoin de cartons
              </button>
            )}
            <button className="btn btn-primary">
              Choisir mon samedi <Icone nom="arrow" />
            </button>
          </div>
        </form>
      </>
    );
  }

  // Étape 2 · le samedi.
  const y = mois.getFullYear();
  const m = mois.getMonth();
  const decalage = (new Date(y, m, 1).getDay() + 6) % 7;
  const nbJours = new Date(y, m + 1, 0).getDate();
  const peutReculer = mois > premierMois;
  const peutAvancer = mois < dernierMois;
  const cases: ReactNode[] = [];
  for (let i = 0; i < decalage; i++) cases.push(<span key={`v${i}`} className="day past" />);
  for (let j = 1; j <= nbJours; j++) {
    const date = new Date(y, m, j, 12);
    const id = iso(date);
    const samedi = date.getDay() === 6;
    if (!samedi || id < bornes.min || id > bornes.max) {
      cases.push(
        <span key={id} className="day">
          {j}
        </span>,
      );
      continue;
    }
    const pris = occupation[id] ?? 0;
    const complet = pris >= CAPACITE_SAMEDI && id !== dejaChoisi;
    cases.push(
      <button
        key={id}
        type="button"
        className={`day sat${complet ? " full" : ""}${choisi === id ? " sel" : ""}`}
        aria-disabled={complet}
        aria-pressed={choisi === id}
        aria-label={`Samedi ${j}${complet ? ", complet" : ""}`}
        onClick={() => !complet && setChoisi(id)}
      >
        {j}
        <small>{complet ? "Complet" : `${CAPACITE_SAMEDI - pris} places`}</small>
      </button>,
    );
  }
  const erreurDate = erreurs.date_samedi;
  const confirmer = () => {
    if (!choisi) return;
    const fd = new FormData();
    Object.entries(valeurs).forEach(([k, v]) => fd.set(k, v));
    fd.set("date_samedi", choisi);
    const r = schema.safeParse(lireFicheCartons(fd));
    if (!r.success) return;
    envoyerDirect(fd);
  };

  return (
    <>
      <Stepper etape={enCours ? 3 : 2} />
      <div className="card">
        <div className="rule-title">
          <span className="n">02</span>
          <h2>Choisissez votre samedi</h2>
        </div>
        <ResumeErreurs erreurs={erreurs} message={etat.message} essai={essai} />
        <div className="cal-head">
          <h3>{mois.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h3>
          <div className="cal-nav">
            <button type="button" disabled={!peutReculer} aria-label="Mois précédent" onClick={() => setMois(new Date(y, m - 1, 1, 12))}>
              <Icone nom="chevL" />
            </button>
            <button type="button" disabled={!peutAvancer} aria-label="Mois suivant" onClick={() => setMois(new Date(y, m + 1, 1, 12))}>
              <Icone nom="chevR" />
            </button>
          </div>
        </div>
        <div className="cal">
          {JOURS.map((x, i) => (
            <div key={x} className={`dow${i === 5 ? " sat" : ""}`}>
              {x}
            </div>
          ))}
          {cases}
        </div>
        <div className="cal-legend">
          <span>
            <i /> Samedi disponible
          </span>
          <span>
            <i className="sel" /> Votre choix
          </span>
          <span>
            <i className="full" /> Complet
          </span>
          <span>
            Livraison {PLAGE_SAMEDI} · jusqu&apos;au {jourMois(bornes.max)}
          </span>
        </div>
        {erreurDate && <p className="err-inline">{erreurDate}</p>}
        <div className="row-actions" style={{ paddingTop: 22, borderTop: "1px solid var(--line)" }}>
          <button type="button" className="btn btn-ghost" onClick={() => setEtape(1)}>
            <Icone nom="back" /> Retour
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {choisi ? <span style={{ fontWeight: 600 }}>Samedi {jourMois(choisi)} · {dateCourte(choisi)}</span> : <span className="muted">Aucun samedi sélectionné</span>}
            <button type="button" className="btn btn-primary" data-apercu-bloque disabled={!choisi || enCours} onClick={confirmer}>
              {enCours ? "Confirmation…" : "Confirmer"} <Icone nom="arrow" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
