"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Bandeau from "@/ui/Bandeau";
import { Icone } from "@/ui/icones";
import { AvecMenu } from "@/ui/MenuVertical";
import TableauKanban from "@/crm/kanban/Tableau";
import type { Carte, Commercial } from "@/crm/kanban/donnees";
import { DossierTable, type LigneDossier } from "@/crm/components/DossierTable";
import { dateFr, photoPour, STATUTS, TYPES, TYPES_PLURIEL } from "@/crm/lib/format";
import { NOM_PARCOURS } from "@/lib/parcours";
import { libelleDemande, type CarteDemande } from "./demandes-commun";
import { adresse, avecDemandes, ETAPES_FILTRE, FILTRES_VIDES, garderDemande, garderDossier, RANG_ETAPE, statutsDe, type Filtres } from "./filtres";
import MenuParcours from "./MenuParcours";
import k from "@/crm/kanban/kanban.module.css";
import h from "./hub.module.css";

/*
 * Le Parcours : tous les dossiers, de la demande du site à la facture, sur
 * une page (simplification du 08/11/2026, choix de David). Il remplace le
 * Kanban, la liste « Clients et dossiers », les Commandes et le suivi des
 * dossiers qui menait au premier venu.
 *
 *  - Tableau : les étapes, de « Demandes » (les demandes du site qui
 *    attendent qu'on les accepte ou qu'on les refuse, depuis leur carte) à
 *    « Perdu » ; le glisser-déposer déclenche l'action du métier.
 *  - Liste : les mêmes, en tableau triable.
 *
 * Les vues sont dans le menu de gauche (choix de David, 08/11/2026), les
 * filtres (recherche, type de client, commercial, étape) dans la rangée du
 * bas de la bande : ils valent pour les deux vues et vivent dans l'adresse ;
 * passer d'une vue à l'autre ne recharge rien. L'analyse des demandes (même
 * menu, second groupe) a ses pages et ses filtres (src/crm/parcours/analyse).
 */

const prenom = (nom: string) => nom.split(/\s+/)[0] ?? nom;
const teinte = (id: number | null) => (id == null ? 0 : id % 5);
const jour = (d: string) => dateFr(`${d.slice(0, 10)}T12:00:00Z`, { day: "numeric", month: "short", year: "numeric" });

function ligneDossier(c: Carte): LigneDossier {
  return {
    cle: `d${c.id}`,
    href: `/dossiers/${c.id}`,
    client: c.client,
    sous: c.ref,
    photo: photoPour(c.arrivee, c.id),
    type: TYPES[c.segment] ?? c.segment,
    depart: c.depart,
    arrivee: c.arrivee,
    volume: c.volume,
    commercial: c.commercial,
    etape: { label: STATUTS[c.statut]?.label ?? c.statut, ton: STATUTS[c.statut]?.cls ?? "i", rang: RANG_ETAPE[c.statut] ?? 9 },
    montant: c.montant,
    date: c.dateChargement?.slice(0, 10) ?? null,
    dateTexte: c.dateChargement ? jour(c.dateChargement) : (c.periode ?? "—"),
  };
}

function ligneDemande(d: CarteDemande): LigneDossier {
  return {
    cle: `r${d.id}`,
    href: `/dashboard/${d.id}`,
    client: d.client,
    sous: `Demande du site · ${libelleDemande(d.statut)}`,
    photo: null,
    type: NOM_PARCOURS[d.parcours],
    depart: d.depart,
    arrivee: d.arrivee,
    volume: d.volume,
    commercial: null,
    etape: { label: "Demande", ton: "d", rang: RANG_ETAPE.demande },
    montant: d.estimation,
    estimation: true,
    date: d.dateSouhaitee,
    dateTexte: d.dateSouhaitee ? jour(d.dateSouhaitee) : "—",
  };
}

export default function Hub({
  cartes,
  commerciaux,
  demandes,
  vueInitiale,
  initiaux,
  archives,
  rappels,
}: {
  cartes: Carte[];
  commerciaux: Commercial[];
  demandes: CarteDemande[];
  vueInitiale: "colonnes" | "liste";
  initiaux: Filtres;
  /** Les dossiers archivés qui répondent à la recherche de l'adresse. */
  archives: number;
  /** Les rappels ouverts : la pastille de « À rappeler », au menu. */
  rappels?: number;
}) {
  const [vue, setVue] = useState(vueInitiale);
  const [filtres, setFiltres] = useState<Filtres>(initiaux);
  const poser = (f: Partial<Filtres>) => setFiltres((x) => ({ ...x, ...f }));

  // La vue et les filtres vivent dans l'adresse : un rechargement ou un lien partagé les garde.
  useEffect(() => {
    const cible = adresse(vue, filtres);
    if (cible !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", cible);
  }, [vue, filtres]);

  const statuts = useMemo(() => statutsDe(filtres.etape), [filtres.etape]);
  const garder = useCallback((c: Carte) => garderDossier(c, filtres, statuts), [filtres, statuts]);
  const demandesVisibles = useMemo(() => demandes.filter((d) => garderDemande(d, filtres)), [demandes, filtres]);
  const filtresActifs = !!(filtres.q.trim() || filtres.type || filtres.commercial || filtres.etape);

  // La liste : demandes et dossiers mêlés, la dernière activité d'abord (l'ordre d'origine, avant tout tri).
  const lignes = useMemo(() => {
    if (vue !== "liste") return [];
    const l = [
      ...demandesVisibles.map((d) => ({ quand: d.recueLe, ligne: ligneDemande(d) })),
      ...cartes.filter(garder).map((c) => ({ quand: c.majLe, ligne: ligneDossier(c) })),
    ];
    return l.sort((a, b) => b.quand.localeCompare(a.quand)).map((x) => x.ligne);
  }, [vue, demandesVisibles, cartes, garder]);

  return (
    <div className="view">
      <Bandeau
        surtitre="Dossiers"
        titre="Parcours des dossiers"
        texte="De la demande du site à la facture : chaque dossier, à son étape."
        action={{ label: "Nouveau dossier", href: "/dossiers/nouveau", icone: "plus" }}
        bas={
          <div className={k.filtres}>
            <label className={k.recherche}>
              <Icone nom="recherche" taille={16} />
              <input type="search" value={filtres.q} onChange={(e) => poser({ q: e.target.value })} placeholder="Client, référence, ville…" aria-label="Rechercher un dossier ou une demande" />
            </label>
            <div className={k.groupe} role="group" aria-label="Commercial">
              <button type="button" aria-pressed={!filtres.commercial} onClick={() => poser({ commercial: null })}>
                Tous
              </button>
              {/* Les initiales seules, le nom au survol : la rangée tient avec la recherche et les choix. */}
              {commerciaux.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={h.avatar}
                  aria-pressed={filtres.commercial === c.id}
                  onClick={() => poser({ commercial: filtres.commercial === c.id ? null : c.id })}
                  title={c.nom}
                  aria-label={`Commercial : ${c.nom}`}
                >
                  <span className={k.mini} data-teinte={teinte(c.id)}>
                    {c.initiales}
                  </span>
                  {filtres.commercial === c.id && prenom(c.nom)}
                </button>
              ))}
            </div>
            <select className={h.choix} value={filtres.type ?? ""} data-actif={filtres.type ? "" : undefined} onChange={(e) => poser({ type: e.target.value || null })} aria-label="Type de client">
              <option value="">Tous les clients</option>
              {Object.entries(TYPES_PLURIEL).map(([cle, label]) => (
                <option key={cle} value={cle}>
                  {label}
                </option>
              ))}
            </select>
            <select className={h.choix} value={filtres.etape ?? ""} data-actif={filtres.etape ? "" : undefined} onChange={(e) => poser({ etape: e.target.value || null })} aria-label="Étape">
              <option value="">Toutes les étapes</option>
              {ETAPES_FILTRE.map((e) => (
                <option key={e.cle} value={e.cle}>
                  {e.label}
                </option>
              ))}
            </select>
            {filtresActifs && (
              <button type="button" className={k.effacer} onClick={() => setFiltres(FILTRES_VIDES)}>
                Effacer
              </button>
            )}
          </div>
        }
      />

      <AvecMenu menu={<MenuParcours vue={vue} filtres={filtres} choisir={setVue} nombres={{ rappels }} />}>
        {archives > 0 && filtres.q.trim() === initiaux.q.trim() && (
          <p className={h.archives}>
            <Icone nom="archive" taille={16} />
            <span>
              {archives} dossier{archives > 1 ? "s" : ""} archivé{archives > 1 ? "s" : ""} répond{archives > 1 ? "ent" : ""} aussi à « {initiaux.q.trim()} ».
            </span>
            <Link href={`/archives?${new URLSearchParams({ vue: "archives", q: initiaux.q.trim() })}`}>
              Voir dans l&apos;archivage
              <Icone nom="fleche" taille={14} />
            </Link>
          </p>
        )}

        {vue === "colonnes" ? (
          <TableauKanban cartes={cartes} commerciaux={commerciaux} garder={garder} statuts={statuts} demandes={avecDemandes(filtres.etape) ? demandesVisibles : null} filtresActifs={filtresActifs} />
        ) : (
          <DossierTable lignes={lignes} vide={filtresActifs ? "Aucun dossier ni demande pour ces filtres." : "Aucun dossier."} />
        )}
      </AvecMenu>
    </div>
  );
}
