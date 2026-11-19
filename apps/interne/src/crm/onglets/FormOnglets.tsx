"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Icone, type NomIcone } from "@/ui/icones";
import { enregistrerOnglets } from "./actions";
import { cleCase, ROLES_MENU, verrouillee, type RoleMenu } from "./regles";
import s from "./onglets.module.css";

/*
 * Réglages › Onglets : une carte par rubrique du menu, ses pages dessous ;
 * pour chacune, un interrupteur par rôle (agents, admins). L'interrupteur
 * d'une rubrique règle toutes ses pages d'un coup. Rien ne change tant
 * qu'on n'a pas enregistré ; « Annuler » revient à l'état enregistré.
 */

export type RubriqueVue = { titre: string; pages: { href: string; label: string; icone: NomIcone }[] };

type Visibles = Set<string>;

export default function FormOnglets({
  rubriques,
  masques,
  lecture,
}: {
  rubriques: RubriqueVue[];
  /** Les pages masquées, par rôle, telles qu'enregistrées. */
  masques: Record<RoleMenu, string[]>;
  /** Un agent voit l'écran sans pouvoir le changer. */
  lecture: boolean;
}) {
  const initial = useMemo(() => {
    const v: Visibles = new Set();
    for (const r of rubriques)
      for (const p of r.pages) for (const { cle } of ROLES_MENU) if (!masques[cle].includes(p.href)) v.add(cleCase(cle, p.href));
    return v;
  }, [rubriques, masques]);
  const [visibles, setVisibles] = useState<Visibles>(initial);
  const modifie = visibles.size !== initial.size || [...visibles].some((k) => !initial.has(k));

  const basculer = (cles: string[], montrer: boolean) =>
    setVisibles((v) => {
      const n = new Set(v);
      for (const k of cles) if (montrer) n.add(k);
      else n.delete(k);
      return n;
    });

  const compte = (role: RoleMenu) => rubriques.reduce((n, r) => n + r.pages.filter((p) => !visibles.has(cleCase(role, p.href))).length, 0);

  return (
    <form action={enregistrerOnglets} className={s.formulaire}>
      <div className={s.tete}>
        <span className={s.teteTitre}>Rubriques et pages du menu</span>
        {ROLES_MENU.map(({ cle, label }) => (
          <span key={cle} className={s.teteRole}>
            {label}
            <small>{compte(cle) ? `${compte(cle)} masquée${compte(cle) > 1 ? "s" : ""}` : "tout visible"}</small>
          </span>
        ))}
      </div>

      {rubriques.map((r) => {
        const seule = r.pages.length === 1;
        return (
          <section key={r.titre} className={s.rubrique} aria-label={r.titre}>
            <div className={s.ligneRubrique}>
              <span className={s.nom}>
                <span className={s.picto}>
                  <Icone nom={r.pages[0].icone} taille={17} />
                </span>
                <b>{r.titre}</b>
                {!seule && <small>{r.pages.length} pages</small>}
              </span>
              {ROLES_MENU.map(({ cle, label }) => {
                const libres = r.pages.filter((p) => !verrouillee(p.href, cle));
                const vues = r.pages.filter((p) => visibles.has(cleCase(cle, p.href)) || verrouillee(p.href, cle)).length;
                const toutes = vues === r.pages.length;
                const aucune = vues === 0;
                const fige = libres.length === 0;
                return (
                  <Interrupteur
                    key={cle}
                    role={label}
                    titre={`${r.titre} pour les ${label.toLowerCase()}`}
                    actif={!aucune}
                    partiel={!toutes && !aucune}
                    note={fige ? "Toujours visible" : !toutes && !aucune ? `${vues} sur ${r.pages.length}` : null}
                    desactive={lecture || fige}
                    // Une rubrique d'une seule page : sa case est celle de la page, envoyée avec le formulaire.
                    nom={seule && !fige ? cleCase(cle, r.pages[0].href) : undefined}
                    changer={() => basculer(libres.map((p) => cleCase(cle, p.href)), !toutes)}
                  />
                );
              })}
            </div>

            {!seule &&
              r.pages.map((p) => (
                <div key={p.href} className={s.lignePage}>
                  <span className={s.nom}>
                    <Icone nom={p.icone} taille={15} />
                    {p.label}
                  </span>
                  {ROLES_MENU.map(({ cle, label }) => {
                    const fige = verrouillee(p.href, cle);
                    const k = cleCase(cle, p.href);
                    return (
                      <Interrupteur
                        key={cle}
                        role={label}
                        titre={`${p.label} pour les ${label.toLowerCase()}`}
                        actif={fige || visibles.has(k)}
                        note={fige ? "Toujours visible" : null}
                        desactive={lecture || fige}
                        nom={fige ? undefined : k}
                        changer={() => basculer([k], !visibles.has(k))}
                      />
                    );
                  })}
                </div>
              ))}
          </section>
        );
      })}

      {!lecture && (
        <div className={s.pied}>
          <p>
            {modifie ? "Modifications non enregistrées." : "Le menu de l’équipe est celui-ci."} Le super admin voit toujours tout le menu.
          </p>
          <button type="button" className={s.boutonContour} disabled={!modifie} onClick={() => setVisibles(new Set(initial))}>
            Annuler
          </button>
          <Enregistrer modifie={modifie} />
        </div>
      )}
    </form>
  );
}

function Enregistrer({ modifie }: { modifie: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={s.boutonPlein} disabled={!modifie || pending}>
      <Icone nom="coche" taille={16} />
      {pending ? "Enregistrement…" : "Enregistrer"}
    </button>
  );
}

/**
 * Un interrupteur : allumé, la page (ou la rubrique) est dans le menu de ce
 * rôle. `nom` : la case envoyée avec le formulaire (« rôle|adresse ») ; sans
 * nom, l'interrupteur ne fait que régler les cases de ses pages.
 */
function Interrupteur({
  role,
  titre,
  actif,
  partiel = false,
  note,
  desactive,
  nom,
  changer,
}: {
  role: string;
  titre: string;
  actif: boolean;
  partiel?: boolean;
  note: string | null;
  desactive: boolean;
  nom?: string;
  changer: () => void;
}) {
  return (
    <label className={s.cellule} data-role={role}>
      <input
        type="checkbox"
        className={s.case}
        name={nom ? "visible" : undefined}
        value={nom}
        checked={actif}
        disabled={desactive}
        onChange={changer}
        aria-label={`${titre} : ${actif ? "visible" : "masquée"}`}
      />
      <span className={s.interrupteur} data-partiel={partiel || undefined} aria-hidden />
      <span className={s.etat}>{note ?? (actif ? "Visible" : "Masquée")}</span>
    </label>
  );
}
