"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icone } from "./icones";
import { COULEURS, TEINTES, cleDe, departDe, estDossier, ranger, type Couleur, type GroupeOnglets, type Onglet } from "./onglets";
import s from "./onglets.module.css";

/*
 * La barre des dossiers ouverts, sous la navigation : chaque dossier visité
 * (fiche du CRM, dossier de l'espace client, demande du site) ouvre ou
 * réactive son onglet ; les pages n'en ouvrent pas. On peut :
 *   - fermer un onglet (croix, clic molette), « fermer les autres », « à droite » ;
 *   - le déplacer au glisser-déposer ;
 *   - l'épingler (il passe en tête, réduit à son icône) ;
 *   - le ranger dans un groupe nommé et coloré, que l'on replie, renomme,
 *     recolore, dissocie ou ferme d'un coup.
 * Le tout est gardé dans ce navigateur (localStorage) : on retrouve ses
 * dossiers ouverts le lendemain.
 */

const STOCKAGE = "bailly-crm-onglets-v1";
const MAX = 24;

type Etat = { onglets: Onglet[]; groupes: GroupeOnglets[] };
type Menu = { x: number; y: number } & ({ genre: "onglet"; cle: string } | { genre: "groupe"; id: string });

function lire(): Etat {
  try {
    const brut = JSON.parse(localStorage.getItem(STOCKAGE) ?? "null") as Etat | null;
    if (brut && Array.isArray(brut.onglets) && Array.isArray(brut.groupes)) {
      const onglets = brut.onglets.filter((o) => estDossier(o.cle));
      return { onglets, groupes: brut.groupes.filter((g) => onglets.some((o) => o.groupe === g.id)) };
    }
  } catch {
    // stockage indisponible ou illisible : on repart de zéro
  }
  return { onglets: [], groupes: [] };
}

export default function OngletsTravail() {
  const chemin = usePathname();
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>({ onglets: [], groupes: [] });
  const [pret, setPret] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [glisse, setGlisse] = useState<{ cle: string; vers: number } | null>(null);
  const barre = useRef<HTMLDivElement>(null);
  const miroir = useRef<Etat>(etat);
  useEffect(() => {
    miroir.current = etat;
  }, [etat]);
  const vientDeGlisser = useRef(false);
  const cleActive = cleDe(chemin);

  // Lecture au montage, écriture à chaque changement.
  useEffect(() => {
    // Après le premier rendu (le serveur ne connaît pas le stockage du navigateur).
    const id = requestAnimationFrame(() => {
      setEtat(lire());
      setPret(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    if (!pret) return;
    try {
      localStorage.setItem(STOCKAGE, JSON.stringify(etat));
    } catch {
      // stockage plein ou interdit : les onglets vivront le temps de la session
    }
  }, [etat, pret]);

  // Chaque page visitée ouvre (ou réactive) son onglet, juste après l'onglet actif.
  const derniere = useRef<string | null>(null);
  useEffect(() => {
    if (!pret || !estDossier(cleActive)) return;
    const href = chemin + window.location.search;
    setEtat((e) => {
      const existe = e.onglets.find((o) => o.cle === cleActive);
      if (existe) return { ...e, onglets: e.onglets.map((o) => (o.cle === cleActive ? { ...o, href } : o)) };
      const { titre, icone } = departDe(cleActive, chemin);
      const neuf: Onglet = { cle: cleActive, href, titre, icone, groupe: null };
      const i = e.onglets.findIndex((o) => o.cle === derniere.current);
      const liste = i >= 0 ? [...e.onglets.slice(0, i + 1), neuf, ...e.onglets.slice(i + 1)] : [...e.onglets, neuf];
      // Au-delà du maximum, on ferme les plus anciens non épinglés et hors groupe.
      while (liste.length > MAX) {
        const j = liste.findIndex((o) => !o.epingle && !o.groupe && o.cle !== cleActive);
        if (j < 0) break;
        liste.splice(j, 1);
      }
      return { ...e, onglets: ranger(liste) };
    });
    derniere.current = cleActive;
  }, [chemin, cleActive, pret]);

  // Le titre d'un dossier, d'une demande ou d'un conteneur vient de sa page (le
  // bandeau : référence et nom) ; une page du menu garde le nom du menu.
  useEffect(() => {
    if (!pret || !estDossier(cleActive)) return;
    let essais = 0;
    const id = setInterval(() => {
      essais++;
      if (essais > 12) clearInterval(id);
      const h1 = document.querySelector("main section h1")?.textContent?.trim();
      const sur = document.querySelector("main section h1")?.previousElementSibling?.textContent?.trim() ?? "";
      if (!h1) return;
      const ref = sur.match(/BD-\d{4}-\d{3,}/)?.[0];
      // Un dossier ne prend son titre que sur sa fiche ou son parcours, dont le titre est le client :
      // l'éditeur de devis porte aussi la référence, mais son titre est « Devis DV-… ».
      if (cleActive.startsWith("dossier:") && (!ref || !/^\/(dossiers|parcours)\/\d+\/?$/.test(chemin))) return;
      const titre = cleActive.startsWith("dossier:") ? `${ref} · ${h1}` : h1;
      setEtat((e) => ({ ...e, onglets: e.onglets.map((o) => (o.cle === cleActive && o.titre !== titre ? { ...o, titre } : o)) }));
    }, 160);
    return () => clearInterval(id);
  }, [chemin, cleActive, pret]);

  const aller = useCallback((href: string) => router.push(href), [router]);

  const fermer = useCallback(
    (cles: string[]) => {
      const avant = miroir.current.onglets;
      if (cleActive && cles.includes(cleActive)) {
        const i = avant.findIndex((o) => o.cle === cleActive);
        const voisin = avant.slice(i + 1).find((o) => !cles.includes(o.cle)) ?? [...avant.slice(0, i)].reverse().find((o) => !cles.includes(o.cle));
        aller(voisin?.href ?? "/");
      }
      setEtat((e) => {
        const restants = e.onglets.filter((o) => !cles.includes(o.cle));
        return { onglets: restants, groupes: e.groupes.filter((g) => restants.some((o) => o.groupe === g.id)) };
      });
    },
    [aller, cleActive],
  );

  const modifier = (cle: string, f: (o: Onglet) => Onglet) => setEtat((e) => ({ ...e, onglets: ranger(e.onglets.map((o) => (o.cle === cle ? f(o) : o))) }));
  const modifierGroupe = (id: string, f: (g: GroupeOnglets) => GroupeOnglets) => setEtat((e) => ({ ...e, groupes: e.groupes.map((g) => (g.id === id ? f(g) : g)) }));

  function nouveauGroupe(cle: string) {
    setEtat((e) => {
      const id = `g${Date.now().toString(36)}`;
      const couleur = COULEURS[e.groupes.length % COULEURS.length];
      return {
        groupes: [...e.groupes, { id, nom: `Groupe ${e.groupes.length + 1}`, couleur }],
        onglets: ranger(e.onglets.map((o) => (o.cle === cle ? { ...o, groupe: id, epingle: false } : o))),
      };
    });
  }

  // Le glisser-déposer : on suit le pointeur, on calcule la place d'arrivée.
  function commencer(e: React.PointerEvent, cle: string) {
    if (e.button !== 0) return;
    const depart = e.clientX;
    let actif = false;
    const cible = (x: number) => {
      const elements = Array.from(barre.current?.querySelectorAll<HTMLElement>("[data-onglet]") ?? []);
      let vers = elements.length;
      for (let i = 0; i < elements.length; i++) {
        const r = elements[i].getBoundingClientRect();
        if (x < r.left + r.width / 2) {
          vers = i;
          break;
        }
      }
      return vers;
    };
    const bouge = (ev: PointerEvent) => {
      if (!actif && Math.abs(ev.clientX - depart) < 6) return;
      actif = true;
      setGlisse({ cle, vers: cible(ev.clientX) });
    };
    const fin = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", bouge);
      window.removeEventListener("pointerup", fin);
      if (!actif) return;
      vientDeGlisser.current = true;
      const vers = cible(ev.clientX);
      setGlisse(null);
      setEtat((et) => {
        const visibles = Array.from(barre.current?.querySelectorAll<HTMLElement>("[data-onglet]") ?? []).map((el) => el.dataset.onglet!);
        const ordre = et.onglets.filter((o) => o.cle !== cle);
        const moi = et.onglets.find((o) => o.cle === cle)!;
        // La place visée, rapportée à la liste complète.
        const voisinDroite = visibles.filter((k) => k !== cle)[vers - (visibles.indexOf(cle) < vers ? 1 : 0)];
        const voisinGauche = visibles.filter((k) => k !== cle)[vers - (visibles.indexOf(cle) < vers ? 1 : 0) - 1];
        const d = voisinDroite ? ordre.findIndex((o) => o.cle === voisinDroite) : ordre.length;
        const g = ordre.find((o) => o.cle === voisinGauche);
        const dr = ordre.find((o) => o.cle === voisinDroite);
        // Posé entre deux onglets d'un même groupe, il le rejoint ; ailleurs, il en sort.
        const groupe = g?.groupe && dr?.groupe === g.groupe ? g.groupe : moi.groupe && (g?.groupe === moi.groupe || dr?.groupe === moi.groupe) ? moi.groupe : null;
        const place = { ...moi, groupe, epingle: moi.epingle && (!dr || !!dr.epingle) };
        const liste = [...ordre.slice(0, d), place, ...ordre.slice(d)];
        return { ...et, onglets: ranger(liste), groupes: et.groupes.filter((gr) => liste.some((o) => o.groupe === gr.id)) };
      });
    };
    window.addEventListener("pointermove", bouge);
    window.addEventListener("pointerup", fin);
  }

  // Fermer le menu au clic à côté ou à Échap.
  useEffect(() => {
    if (!menu) return;
    const fermerMenu = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && (e.target as HTMLElement).closest(`.${s.menu}`)) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", fermerMenu);
    document.addEventListener("keydown", fermerMenu);
    return () => {
      document.removeEventListener("mousedown", fermerMenu);
      document.removeEventListener("keydown", fermerMenu);
    };
  }, [menu]);

  if (!pret) return <div className={s.barre} aria-hidden />;
  if (etat.onglets.length === 0)
    return (
      <div className={s.barre}>
        <span className={s.vide}>
          <Icone nom="dossierClient" taille={15} /> Les dossiers que vous ouvrez restent ici, en onglets : passez de l’un à l’autre, rangez-les en groupes.
        </span>
      </div>
    );

  const groupeDe = (id: string | null) => etat.groupes.find((g) => g.id === id);

  return (
    <div className={s.barre} ref={barre} role="tablist" aria-label="Onglets ouverts" onWheel={(e) => barre.current && (barre.current.scrollLeft += e.deltaY)}>
      {etat.onglets.map((o, i) => {
        const g = groupeDe(o.groupe);
        const etiquette =
          g && (i === 0 || etat.onglets[i - 1].groupe !== o.groupe) ? (
            <button
              key={`g-${g.id}`}
              type="button"
              className={s.groupe}
              style={{ "--teinte": TEINTES[g.couleur] } as React.CSSProperties}
              onClick={() => modifierGroupe(g.id, (x) => ({ ...x, replie: !x.replie }))}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ genre: "groupe", id: g.id, x: e.clientX, y: e.clientY });
              }}
              title={g.replie ? "Déplier le groupe" : "Replier le groupe (clic droit : options)"}
            >
              {g.nom}
              {g.replie && <span>{etat.onglets.filter((x) => x.groupe === g.id).length}</span>}
            </button>
          ) : null;
        const actif = o.cle === cleActive;
        const cache = g?.replie && !actif;
        return (
          <span key={o.cle} className={s.place}>
            {etiquette}
            {glisse?.vers === i && glisse.cle !== o.cle && <i className={s.insertion} />}
            {!cache && (
              <div
                data-onglet={o.cle}
                role="tab"
                aria-selected={actif}
                className={`${s.onglet} ${o.epingle ? s.epingle : ""} ${glisse?.cle === o.cle ? s.enMain : ""}`}
                style={g ? ({ "--teinte": TEINTES[g.couleur] } as React.CSSProperties) : undefined}
                data-groupe={g ? "" : undefined}
                title={o.titre}
                onPointerDown={(e) => commencer(e, o.cle)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    fermer([o.cle]);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ genre: "onglet", cle: o.cle, x: e.clientX, y: e.clientY });
                }}
              >
                <a
                  href={o.href}
                  className={s.lien}
                  draggable={false}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    if (vientDeGlisser.current) {
                      vientDeGlisser.current = false;
                      return;
                    }
                    aller(o.href);
                  }}
                >
                  <Icone nom={o.icone} taille={15} />
                  {!o.epingle && <TitreOnglet titre={o.titre} />}
                </a>
                {!o.epingle && (
                  <button
                    type="button"
                    className={s.fermer}
                    aria-label={`Fermer ${o.titre}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => fermer([o.cle])}
                  >
                    <Icone nom="plus" taille={13} />
                  </button>
                )}
              </div>
            )}
          </span>
        );
      })}
      {glisse?.vers === etat.onglets.length && <i className={s.insertion} />}

      {menu && (
        <div className={s.menu} style={{ left: Math.min(menu.x, window.innerWidth - 250), top: menu.y + 6 }} role="menu">
          {menu.genre === "onglet" ? (
            <MenuOnglet
              onglet={etat.onglets.find((o) => o.cle === menu.cle)!}
              groupes={etat.groupes}
              fermer={() => setMenu(null)}
              actions={{
                epingler: (o) => modifier(o.cle, (x) => ({ ...x, epingle: !x.epingle, groupe: x.epingle ? x.groupe : null })),
                versGroupe: (o, id) => modifier(o.cle, (x) => ({ ...x, groupe: id, epingle: false })),
                nouveauGroupe: (o) => nouveauGroupe(o.cle),
                fermer: (o) => fermer([o.cle]),
                fermerAutres: (o) => fermer(etat.onglets.filter((x) => x.cle !== o.cle && !x.epingle).map((x) => x.cle)),
                fermerDroite: (o) => fermer(etat.onglets.slice(etat.onglets.findIndex((x) => x.cle === o.cle) + 1).filter((x) => !x.epingle).map((x) => x.cle)),
              }}
            />
          ) : (
            <MenuGroupe
              groupe={etat.groupes.find((g) => g.id === menu.id)!}
              fermer={() => setMenu(null)}
              renommer={(nom) => modifierGroupe(menu.id, (g) => ({ ...g, nom }))}
              colorer={(couleur) => modifierGroupe(menu.id, (g) => ({ ...g, couleur }))}
              replier={() => modifierGroupe(menu.id, (g) => ({ ...g, replie: !g.replie }))}
              dissocier={() => setEtat((e) => ({ onglets: e.onglets.map((o) => (o.groupe === menu.id ? { ...o, groupe: null } : o)), groupes: e.groupes.filter((g) => g.id !== menu.id) }))}
              fermerTout={() => fermer(etat.onglets.filter((o) => o.groupe === menu.id).map((o) => o.cle))}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MenuOnglet({
  onglet,
  groupes,
  fermer,
  actions,
}: {
  onglet: Onglet;
  groupes: GroupeOnglets[];
  fermer: () => void;
  actions: Record<"epingler" | "nouveauGroupe" | "fermer" | "fermerAutres" | "fermerDroite", (o: Onglet) => void> & { versGroupe: (o: Onglet, id: string | null) => void };
}) {
  if (!onglet) return null;
  const faire = (f: () => void) => () => {
    f();
    fermer();
  };
  return (
    <>
      <p className={s.titreMenu}>{onglet.titre}</p>
      <button type="button" onClick={faire(() => actions.epingler(onglet))}>
        {onglet.epingle ? "Désépingler" : "Épingler en tête"}
      </button>
      <button type="button" onClick={faire(() => actions.nouveauGroupe(onglet))}>
        Nouveau groupe avec cet onglet
      </button>
      {groupes
        .filter((g) => g.id !== onglet.groupe)
        .map((g) => (
          <button key={g.id} type="button" onClick={faire(() => actions.versGroupe(onglet, g.id))}>
            <i className={s.pastille} style={{ background: TEINTES[g.couleur] }} /> Ranger dans « {g.nom} »
          </button>
        ))}
      {onglet.groupe && (
        <button type="button" onClick={faire(() => actions.versGroupe(onglet, null))}>
          Retirer du groupe
        </button>
      )}
      <hr />
      <button type="button" onClick={faire(() => actions.fermer(onglet))}>
        Fermer
      </button>
      <button type="button" onClick={faire(() => actions.fermerAutres(onglet))}>
        Fermer les autres
      </button>
      <button type="button" onClick={faire(() => actions.fermerDroite(onglet))}>
        Fermer les onglets à droite
      </button>
    </>
  );
}

function MenuGroupe({
  groupe,
  fermer,
  renommer,
  colorer,
  replier,
  dissocier,
  fermerTout,
}: {
  groupe: GroupeOnglets;
  fermer: () => void;
  renommer: (nom: string) => void;
  colorer: (c: Couleur) => void;
  replier: () => void;
  dissocier: () => void;
  fermerTout: () => void;
}) {
  const [nom, setNom] = useState(groupe?.nom ?? "");
  if (!groupe) return null;
  return (
    <>
      <form
        className={s.nomGroupe}
        onSubmit={(e) => {
          e.preventDefault();
          renommer(nom.trim() || groupe.nom);
          fermer();
        }}
      >
        <input value={nom} onChange={(e) => setNom(e.target.value)} aria-label="Nom du groupe" autoFocus maxLength={40} />
      </form>
      <div className={s.couleurs}>
        {COULEURS.map((c) => (
          <button key={c} type="button" aria-label={c} aria-pressed={groupe.couleur === c} style={{ background: TEINTES[c] }} onClick={() => colorer(c)} />
        ))}
      </div>
      <hr />
      <button type="button" onClick={() => (replier(), fermer())}>
        {groupe.replie ? "Déplier" : "Replier"}
      </button>
      <button type="button" onClick={() => (dissocier(), fermer())}>
        Dissocier le groupe
      </button>
      <button type="button" className={s.danger} onClick={() => (fermerTout(), fermer())}>
        Fermer le groupe
      </button>
    </>
  );
}

/** « BD-2026-0418 · Quentin Dupuis » s'affiche nom d'abord, référence ensuite, plus discrète. */
function TitreOnglet({ titre }: { titre: string }) {
  const m = titre.match(/^(BD-\d{4}-\d+) · (.+)$/);
  if (!m) return <span className={s.titre}>{titre}</span>;
  return (
    <span className={s.titre}>
      {m[2]} <small className={s.ref}>{m[1].replace(/^BD-\d{4}-/, "")}</small>
    </span>
  );
}
