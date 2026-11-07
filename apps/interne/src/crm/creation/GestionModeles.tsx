"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { m3 } from "@/crm/lib/format";
import { supprimerModele } from "./actions";
import { depuis, libelleSegment, libelleType, type SourceModele } from "./commun";
import EditeurModele, { type Brouillon } from "./EditeurModele";
import { Picto } from "./Picto";
import s from "./modeles.module.css";

/*
 * La gestion des modèles de dossier : chaque modèle en carte, les plus
 * utilisés en tête, avec ce qu'il préremplit ; on l'utilise, le modifie (nom
 * compris) ou le supprime. La création et la modification passent par
 * l'éditeur (EditeurModele).
 */

const VIERGE: Brouillon = { id: null, nom: "", description: null, champs: {} };

export default function GestionModeles({ modeles, maintenant, nouveau }: { modeles: SourceModele[]; maintenant: number; nouveau: boolean }) {
  const router = useRouter();
  const [edition, setEdition] = useState<Brouillon | null>(nouveau ? VIERGE : null);
  const [aConfirmer, setAConfirmer] = useState<number | null>(null);
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const fermer = () => {
    setEdition(null);
    if (nouveau) router.replace("/dossiers/modeles", { scroll: false });
  };
  const supprimer = (m: SourceModele) => {
    if (aConfirmer !== m.id) return setAConfirmer(m.id);
    demarrer(async () => {
      const r = await supprimerModele(m.id);
      setAConfirmer(null);
      setMessage(r.ok ? `Modèle « ${r.nom} » supprimé.` : r.erreur);
    });
  };

  return (
    <div className={s.page}>
      {message && (
        <p className={s.message} role="status">
          <Picto nom="coche" />
          {message}
          <button type="button" onClick={() => setMessage(null)} aria-label="Fermer le message"><Picto nom="fermer" taille={15} /></button>
        </p>
      )}

      {modeles.length === 0 ? (
        <section className={s.videCarte}>
          <span className={s.videOrbe}><Picto nom="modele" taille={30} /></span>
          <h2>Aucun modèle pour l&apos;instant</h2>
          <p>Un modèle préremplit un nouveau dossier : segment, type de déménagement, volume indicatif, options, observations types.</p>
          <button type="button" className={s.principal} onClick={() => setEdition(VIERGE)}>Créer un modèle</button>
        </section>
      ) : (
        <ul className={s.cartes}>
          {modeles.map((m) => {
            const c = m.champs;
            const puces = [
              libelleSegment(c.type), libelleType(c.type_demenagement), c.volume ? m3(c.volume) : null,
              c.garde_meuble ? "Garde-meuble" : null, c.vehicule ? "Véhicule" : null,
            ].filter(Boolean) as string[];
            return (
              <li key={m.id} className={s.carte}>
                <div className={s.carteTete}>
                  <span className={s.carteIcone}><Picto nom="modele" /></span>
                  {m.demo && <span className={s.demo}>Démonstration</span>}
                </div>
                <h3>{m.nom}</h3>
                <p className={s.description}>{m.description || "Sans description."}</p>
                <div className={s.prerempli}>
                  <span>Préremplit</span>
                  {puces.length ? puces.map((p) => <b key={p}>{p}</b>) : <em>rien pour l&apos;instant</em>}
                </div>
                {c.observations && <p className={s.observations}>« {c.observations} »</p>}
                <footer className={s.cartePied}>
                  <span className={s.usage}>
                    {m.utilisations > 0
                      ? `Utilisé ${m.utilisations} fois${m.dernierUsage ? `, ${depuis(m.dernierUsage, maintenant)}` : ""}`
                      : "Pas encore utilisé"}
                    {m.auteur ? ` · par ${m.auteur}` : ""}
                  </span>
                  <span className={s.carteActions}>
                    <Link href={`/dossiers/nouveau?modele=${m.id}`} className={s.utiliser}>
                      Utiliser <Picto nom="fleche" taille={16} />
                    </Link>
                    <button type="button" className={s.icone} onClick={() => setEdition({ id: m.id, nom: m.nom, description: m.description, champs: m.champs })} aria-label={`Modifier ou renommer « ${m.nom} »`} title="Modifier ou renommer">
                      <Picto nom="crayon" taille={17} />
                    </button>
                    <button
                      type="button"
                      className={`${s.icone} ${aConfirmer === m.id ? s.confirmer : ""}`}
                      onClick={() => supprimer(m)}
                      onBlur={() => setAConfirmer((x) => (x === m.id ? null : x))}
                      disabled={enCours}
                      aria-label={aConfirmer === m.id ? `Confirmer la suppression de « ${m.nom} »` : `Supprimer « ${m.nom} »`}
                      title="Supprimer"
                    >
                      <Picto nom="corbeille" taille={17} />
                      {aConfirmer === m.id && <span>Supprimer ?</span>}
                    </button>
                  </span>
                </footer>
              </li>
            );
          })}
          <li>
            <button type="button" className={s.ajouter} onClick={() => setEdition(VIERGE)}>
              <span><Picto nom="plus" taille={22} /></span>
              Nouveau modèle
              <small>{"Ou, depuis une fiche dossier\u00a0: «\u00a0Enregistrer comme modèle\u00a0»."}</small>
            </button>
          </li>
        </ul>
      )}

      {edition && (
        <EditeurModele
          key={edition.id ?? "nouveau"}
          ouvert
          brouillon={edition}
          onFermer={fermer}
          onEnregistre={(r) => setMessage(`Modèle « ${r.nom} » enregistré.`)}
        />
      )}
    </div>
  );
}
