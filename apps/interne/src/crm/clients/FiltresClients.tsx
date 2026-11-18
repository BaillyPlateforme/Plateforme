"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Avatar } from "@/crm/kanban/Carte";
import type { Commercial } from "@/crm/kanban/donnees";
import { TYPES_PLURIEL } from "@/crm/lib/format";
import { Icone } from "@/ui/icones";
import { TRIS } from "./commun";
import k from "@/crm/kanban/kanban.module.css";
import h from "@/crm/parcours/hub.module.css";
import s from "./clients.module.css";

/*
 * Les filtres de la liste des clients, dans la rangée du bas de la bande —
 * la même forme que ceux du Parcours (recherche, commerciaux en avatars, type
 * de client), l'entreprise (espace pro) et le tri. Tout vit dans l'adresse
 * (?q=, ?commercial=, ?type=, ?entreprise=, ?tri=) : un lien partagé ou un rechargement les garde. La recherche part
 * d'elle-même après une courte pause de frappe ; changer un filtre revient à
 * la première page et garde la vue.
 */

const prenom = (nom: string) => nom.split(/\s+/)[0];

export default function FiltresClients({
  commerciaux,
  entreprises = [],
  departements = [],
}: {
  commerciaux: Commercial[];
  entreprises?: { id: string; nom: string; n: number }[];
  /** CIMOB/DICOM : les départements d'outre-mer, avec le nombre de clients CIMOB/DICOM qui ont une adresse dans chacun. */
  departements?: { code: string; nom: string; n: number }[];
}) {
  const router = useRouter();
  const chemin = usePathname();
  const sp = useSearchParams();
  const [, demarrer] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  // Une frappe en cours, pas encore partie dans l'adresse.
  const [frappe, setFrappe] = useState(false);

  const aller = (o: Record<string, string | null>) => {
    const u = new URLSearchParams(sp.toString());
    for (const [cle, v] of Object.entries(o)) {
      if (v) u.set(cle, v);
      else u.delete(cle);
    }
    u.delete("page");
    const x = u.toString();
    demarrer(() => router.replace(`${chemin}${x ? `?${x}` : ""}`, { scroll: false }));
  };

  // La recherche suit la frappe, après une pause : la liste se resserre sans bouton.
  useEffect(() => {
    if (!frappe) return;
    const t = setTimeout(() => {
      setFrappe(false);
      if ((sp.get("q") ?? "") !== q.trim()) aller({ q: q.trim() || null });
    }, 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seule la frappe relance la minuterie
  }, [q, frappe]);

  // Une adresse changée d'ailleurs (Effacer, retour arrière) : le champ suit, sauf pendant la frappe.
  const qAdresse = sp.get("q") ?? "";
  const [vuQ, setVuQ] = useState(qAdresse);
  if (vuQ !== qAdresse) {
    setVuQ(qAdresse);
    if (!frappe) setQ(qAdresse);
  }

  const commercial = sp.get("commercial");
  const type = sp.get("type") ?? "";
  const tri = sp.get("tri") ?? "recents";
  const entreprise = sp.get("entreprise") ?? "";
  const departement = sp.get("departement") ?? "";
  const actifs = !!(qAdresse || commercial || type || entreprise || departement);

  return (
    <div className={`${k.filtres} ${s.filtres}`}>
      <label className={`${k.recherche} ${s.recherche}`}>
        <Icone nom="recherche" taille={16} />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setFrappe(true);
            setQ(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            setFrappe(false);
            aller({ q: q.trim() || null });
          }}
          placeholder="Nom, e-mail, téléphone, ville, dossier, matricule…"
          aria-label="Rechercher un client"
        />
      </label>
      {commerciaux.length > 0 && (
        <div className={k.groupe} role="group" aria-label="Commercial de son dernier dossier">
          <button type="button" aria-pressed={!commercial} onClick={() => aller({ commercial: null })}>
            Tous
          </button>
          {/* Les initiales seules, le nom au survol, comme dans le Parcours. */}
          {commerciaux.map((c) => {
            const choisi = commercial === String(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={h.avatar}
                aria-pressed={choisi}
                onClick={() => aller({ commercial: choisi ? null : String(c.id) })}
                title={`${c.nom} · commercial du dernier dossier`}
                aria-label={`Commercial : ${c.nom}`}
              >
                <Avatar r={c} mini />
                {choisi && prenom(c.nom)}
              </button>
            );
          })}
        </div>
      )}
      <select className={h.choix} value={type} data-actif={type ? "" : undefined} onChange={(e) => aller({ type: e.target.value || null })} aria-label="Type de client">
        <option value="">Tous les types</option>
        {Object.entries(TYPES_PLURIEL).map(([cle, label]) => (
          <option key={cle} value={cle}>
            {label}
          </option>
        ))}
      </select>
      {/* L'entreprise (espace pro) à laquelle le client est rattaché, avec le nombre de ses clients. */}
      {entreprises.length > 0 && (
        <select
          className={h.choix}
          value={entreprise}
          data-actif={entreprise ? "" : undefined}
          onChange={(e) => aller({ entreprise: e.target.value || null })}
          aria-label="Entreprise"
        >
          <option value="">Toutes les entreprises</option>
          {entreprises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nom} ({e.n})
            </option>
          ))}
        </select>
      )}
      {/* Les CIMOB/DICOM par département d'outre-mer (Céline, 17/11/2026 : « trier les clients CIMOB/DICOM par département »). */}
      {departements.length > 0 && (
        <select
          className={h.choix}
          value={departement}
          data-actif={departement ? "" : undefined}
          onChange={(e) => aller({ departement: e.target.value || null })}
          aria-label="Département d'outre-mer (CIMOB/DICOM)"
          title="Les clients CIMOB/DICOM dont une adresse est dans ce département"
        >
          <option value="">Département d’outre-mer</option>
          {departements.map((d) => (
            <option key={d.code} value={d.code}>
              {d.code} · {d.nom} ({d.n})
            </option>
          ))}
        </select>
      )}
      <select className={`${h.choix} ${s.tri}`} value={tri} onChange={(e) => aller({ tri: e.target.value === "recents" ? null : e.target.value })} aria-label="Trier les clients">
        {TRIS.map((t) => (
          <option key={t.cle} value={t.cle}>
            {t.label}
          </option>
        ))}
      </select>
      {actifs && (
        <button
          type="button"
          className={k.effacer}
          onClick={() => {
            setFrappe(false);
            setQ("");
            aller({ q: null, commercial: null, type: null, entreprise: null, departement: null });
          }}
        >
          Effacer
        </button>
      )}
    </div>
  );
}
