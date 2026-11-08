"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { heureParis, jourVisite } from "@/lib/visite/regles";
import { proposerOuReserver } from "../actions";
import s from "./visites.module.css";

/*
 * Proposer des créneaux au client, en un geste : les prochains créneaux
 * libres du commercial sont déjà là, les trois premiers cochés. On en coche
 * de 2 à 5, on en ajoute un à la main au besoin, et on propose. Sans espace
 * client, ou au téléphone avec le client, on réserve directement celui qui
 * lui convient.
 *
 * Changer de commercial ou de durée recalcule les créneaux libres : la page
 * se recharge avec ses paramètres (vc, vd), sans quitter la fiche.
 */

export type Creneau = { debut: string; jour: string; heure: string };

export default function PanneauCreneaux({
  dossierId,
  commerciaux,
  commercialId,
  duree,
  suggestions,
  espace,
  replie = false,
  type = "phys",
}: {
  dossierId: number;
  commerciaux: { id: number; nom: string }[];
  commercialId: number | null;
  duree: number;
  suggestions: Creneau[];
  espace: boolean;
  /** Une visite est déjà réservée : le panneau se replie, rien n'est coché d'office (replanifier reste possible). */
  replie?: boolean;
  /** Le type proposé d'office (le planificateur de visite y mène avec le sien : &vt=visio). */
  type?: "phys" | "visio";
}) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const [coches, setCoches] = useState<Set<string>>(() => new Set(replie ? [] : suggestions.slice(0, 3).map((c) => c.debut)));
  const [ouvert, setOuvert] = useState(!replie);
  const [autreJour, setAutreJour] = useState("");
  const [autreHeure, setAutreHeure] = useState("");
  const nb = coches.size + (autreJour && autreHeure ? 1 : 0);

  const parJour = useMemo(() => {
    const m = new Map<string, Creneau[]>();
    for (const c of suggestions) m.set(c.jour, [...(m.get(c.jour) ?? []), c]);
    return [...m.entries()];
  }, [suggestions]);

  function regler(cle: "vc" | "vd", valeur: string) {
    const p = new URLSearchParams(params.toString());
    p.set(cle, valeur);
    router.replace(`${chemin}?${p.toString()}#visite`, { scroll: false });
  }

  const basculer = (d: string) =>
    setCoches((x) => {
      const n = new Set(x);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });

  if (!ouvert) {
    return (
      <div className={s.panneau}>
        <div className={s.panneauTete}>
          <b>Replanifier la visite</b>
          <span>Proposer d&apos;autres créneaux au client, ou en réserver un autre pour lui.</span>
        </div>
        <div className={s.boutons}>
          <button type="button" className="btn ghost" onClick={() => setOuvert(true)}>
            Proposer d&apos;autres créneaux
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={proposerOuReserver.bind(null, dossierId)} className={s.panneau}>
      <div className={s.panneauTete}>
        <b>{replie ? "Replanifier la visite" : "Proposer des créneaux"}</b>
        <span>Tirés du planning du commercial, sans chevauchement</span>
      </div>
      <div className={s.reglages}>
        <label>
          <span>Commercial</span>
          <select name="commercial_id" value={commercialId ?? ""} onChange={(e) => regler("vc", e.target.value)} required>
            {commercialId == null && <option value="">Choisir…</option>}
            {commerciaux.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Visite</span>
          <select name="type" defaultValue={type}>
            <option value="phys">Sur place</option>
            <option value="visio">En visio</option>
          </select>
        </label>
        <label>
          <span>Durée</span>
          <select name="duree_min" value={duree} onChange={(e) => regler("vd", e.target.value)}>
            <option value={60}>1 h</option>
            <option value={90}>1 h 30</option>
            <option value={120}>2 h</option>
          </select>
        </label>
      </div>

      {suggestions.length === 0 ? (
        <p className={s.vide}>Aucun créneau libre sur les trois prochaines semaines aux heures habituelles : ajoutez-en un à la main.</p>
      ) : (
        <div className={s.jours}>
          {parJour.map(([jour, liste]) => (
            <div key={jour} className={s.jour}>
              <small>{jourVisite(`${jour}T12:00:00Z`)}</small>
              <div>
                {liste.map((c) => (
                  <label key={c.debut} className={`${s.creneau} ${coches.has(c.debut) ? s.coche : ""}`}>
                    <input type="checkbox" name="creneau" value={c.debut} checked={coches.has(c.debut)} onChange={() => basculer(c.debut)} />
                    {heureParis(c.debut)}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={s.autre}>
        <span>Autre créneau</span>
        <input type="date" name="autre_jour" value={autreJour} onChange={(e) => setAutreJour(e.target.value)} aria-label="Jour" />
        <input type="time" name="autre_heure" value={autreHeure} onChange={(e) => setAutreHeure(e.target.value)} step={900} aria-label="Heure" />
      </div>

      <div className={s.boutons}>
        <button className="btn primary" name="intent" value="proposer" disabled={!espace || nb < 2 || nb > 5}>
          Proposer {nb >= 2 && nb <= 5 ? `ces ${nb} créneaux` : "2 à 5 créneaux"} au client
        </button>
        <button className="btn ghost" name="intent" value="reserver" disabled={nb !== 1}>
          Réserver directement
        </button>
      </div>
      <p className={s.note}>
        {espace
          ? "Le client les voit dans son espace (étape « Visite technique ») et choisit ; le rendez-vous se pose alors au planning et les autres créneaux se libèrent."
          : "Ce dossier n'a pas d'espace client : réservez directement le créneau convenu avec le client (cochez-en un seul)."}
      </p>
    </form>
  );
}
