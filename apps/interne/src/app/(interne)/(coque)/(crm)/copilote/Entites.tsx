"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ETAPE_DEMANDE, TEINTES, etapeDossier } from "@/crm/kanban/etapes";
import type { Entite, EntiteChiffre, EntiteDemande, EntiteDevis, EntiteDossier, EntiteRdv, ValeurChiffre } from "@/crm/copilote/types";
import { Icone } from "@/ui/icones";
import s from "./copilote.module.css";

/*
 * Les éléments du CRM qu'une réponse montre : cartes de dossiers, lignes de
 * devis, agenda, demandes du site, chiffres. Chacun mène à sa page : un
 * dossier (et ses devis, ses rendez-vous) à /dossiers/<id>, une demande à
 * /dashboard/<id>. Les couleurs des étapes sont celles de tous les
 * tableaux du CRM (src/crm/kanban/etapes.ts).
 */

const TZ = "Europe/Paris";
export const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const nombre = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n);
const valeur = (v: ValeurChiffre) => (v.format === "eur" ? eur(v.valeur) : v.format === "pct" ? `${Math.round(v.valeur)} %` : nombre(v.valeur));
const m3 = (n: number) => `${nombre(n)} m³`;
/** Une date sans heure (AAAA-MM-JJ), lue telle quelle. */
const jourSeul = (d: string, o: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat("fr-FR", { ...o, timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`));
const heure = (iso: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
const jourParis = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
const jourLong = (iso: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(iso));
const capitale = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const initiales = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
export function depuis(iso: string) {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `il y a ${min} min`;
  if (min < 1440) return `il y a ${Math.round(min / 60)} h`;
  const j = Math.round(min / 1440);
  return j === 1 ? "hier" : `il y a ${j} j`;
}

/** L'heure, à la minute : ce qui est passé ou à venir, « aujourd'hui » ou « demain ». */
const abonnerMinute = (f: () => void) => {
  const t = setInterval(f, 60_000);
  return () => clearInterval(t);
};
const minute = () => Math.floor(Date.now() / 60_000) * 60_000;
const useMaintenant = () => useSyncExternalStore(abonnerMinute, minute, minute);

/** La ville d'une adresse : « 12 rue X, 75016 Paris » → « Paris 16e ». */
export function ville(adresse: string | null): string | null {
  if (!adresse) return null;
  const m = adresse.match(/\b(\d{5})\s+([^,]+)/);
  if (m) {
    const v = m[2].trim();
    if (/^paris\b/i.test(v) && /^75\d{3}$/.test(m[1])) {
      const arr = Number(m[1].slice(3));
      return arr ? `Paris ${arr}${arr === 1 ? "er" : "e"}` : "Paris";
    }
    return v;
  }
  const parties = adresse.split(",").map((x) => x.trim()).filter(Boolean);
  return parties[parties.length - 1] ?? adresse;
}

/** La pastille d'une étape, à la couleur de tous les tableaux. */
function Etape({ label, teinte }: { label: string; teinte: string }) {
  return (
    <span className={s.etape} style={{ "--teinte": teinte } as React.CSSProperties}>
      <i />
      {label}
    </span>
  );
}
const EtapeDossier = ({ statut }: { statut: string }) => {
  const e = etapeDossier(statut);
  return <Etape label={e.label} teinte={TEINTES[e.teinte]} />;
};

const TON_PROCHAINE = { faire: "#4b2fe0", attendre: "#0ea5e9", fini: "#14c27d", perdu: "#e1306c" } as const;
const TYPES_RDV: Record<string, { label: string; teinte: string }> = {
  phys: { label: "Sur place", teinte: TEINTES.indigo },
  visio: { label: "Visio", teinte: TEINTES.ciel },
  tache: { label: "Tâche", teinte: TEINTES.ambre },
  perso: { label: "Perso", teinte: TEINTES.gris },
};
const lundi = (iso: string) => {
  const d = new Date(`${jourParis(iso)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const lienRdv = (r: EntiteRdv) => (r.dossierId ? `/dossiers/${r.dossierId}` : `/planning?semaine=${lundi(r.debut)}`);

/* ───────── Un groupe d'éléments, à la suite dans la réponse ───────── */

export function Groupe({ entites }: { entites: Entite[] }) {
  const g = entites[0]?.genre;
  if (!g) return null;
  if (g === "dossier") {
    const dossiers = entites as EntiteDossier[];
    if (dossiers.some((d) => d.fiche)) return <>{dossiers.map((d) => (d.fiche ? <Fiche key={d.cle} d={d} /> : <CarteDossier key={d.cle} d={d} />))}</>;
    return (
      <div className={s.cartes} data-seule={dossiers.length === 1 || undefined}>
        {dossiers.map((d) => (
          <CarteDossier key={d.cle} d={d} />
        ))}
      </div>
    );
  }
  if (g === "devis") return <ListeDevis devis={entites as EntiteDevis[]} />;
  if (g === "rdv") return <Agenda rdv={entites as EntiteRdv[]} />;
  if (g === "demande") return <ListeDemandes demandes={entites as EntiteDemande[]} />;
  return (
    <div className={s.chiffres}>
      {(entites as EntiteChiffre[]).map((c) => (
        <Chiffre key={c.cle} c={c} />
      ))}
    </div>
  );
}

/* ───────── Dossiers ───────── */

function Trajet({ depart, arrivee }: { depart: string | null; arrivee: string | null }) {
  const a = ville(depart);
  const b = ville(arrivee);
  if (!a && !b) return null;
  return (
    <span className={s.trajet} title={[depart, arrivee].filter(Boolean).join(" → ")}>
      {a ?? "?"}
      <Icone nom="fleche" taille={13} />
      {b ?? "?"}
    </span>
  );
}

function Prochaine({ d }: { d: EntiteDossier }) {
  const p = d.prochaine;
  if (!p) return null;
  return (
    <div className={s.prochaine} style={{ "--ton": TON_PROCHAINE[p.ton] } as React.CSSProperties}>
      <span className={s.prochaineTexte}>
        <small>Prochaine étape</small>
        <b>{p.titre}</b>
      </span>
      {p.action && (
        <Link href={p.action.href} className={s.prochaineAction}>
          {p.action.label}
          <Icone nom="fleche" taille={14} />
        </Link>
      )}
    </div>
  );
}

function CarteDossier({ d }: { d: EntiteDossier }) {
  return (
    <article className={s.carte}>
      <header className={s.carteTete}>
        <span className={s.ref}>{d.ref}</span>
        <EtapeDossier statut={d.statut} />
      </header>
      <div className={s.carteCorps}>
        <div className={s.carteNom}>
          <Link href={`/dossiers/${d.id}`} className={s.lienCarte}>
            {d.client}
          </Link>
          <Trajet depart={d.depart} arrivee={d.arrivee} />
        </div>
        {d.montant != null && <span className={s.montant}>{eur(d.montant)}</span>}
      </div>
      <ul className={s.meta}>
        {d.chargement && (
          <li>
            <Icone nom="camion" taille={14} />
            {jourSeul(d.chargement)}
          </li>
        )}
        {d.volume != null && d.volume > 0 && (
          <li>
            <Icone nom="caisse" taille={14} />
            {m3(d.volume)}
          </li>
        )}
        {d.commercial && (
          <li>
            <span className={s.initiales}>{initiales(d.commercial)}</span>
            {d.commercial.split(" ")[0]}
          </li>
        )}
      </ul>
      <Prochaine d={d} />
    </article>
  );
}

const STATUT_DEVIS: Record<string, { label: string; teinte: string }> = {
  brouillon: { label: "Brouillon", teinte: TEINTES.gris },
  envoye: { label: "Envoyé", teinte: TEINTES.ciel },
  signe: { label: "Signé", teinte: TEINTES.vert },
  refuse: { label: "Refusé", teinte: TEINTES.rose },
  expire: { label: "Expiré", teinte: TEINTES.ardoise },
};

/** La fiche d'un dossier, lue en entier par l'outil « dossier ». */
function Fiche({ d }: { d: EntiteDossier }) {
  const f = d.fiche!;
  const maintenant = useMaintenant();
  const rdv = f.rdv.filter((r) => +new Date(r.debut) > maintenant).slice(0, 2);
  const passes = f.rdv.filter((r) => +new Date(r.debut) <= maintenant).slice(-1);
  return (
    <article className={s.fiche}>
      <header className={s.ficheTete}>
        <div>
          <span className={s.ref}>{d.ref}</span>
          <h4>
            <Link href={`/dossiers/${d.id}`} className={s.lienCarte}>
              {d.client}
            </Link>
          </h4>
          <Trajet depart={d.depart} arrivee={d.arrivee} />
        </div>
        <EtapeDossier statut={d.statut} />
      </header>

      <div className={s.ficheChiffres}>
        <div>
          <small>{f.argent.du > 0 ? "Dû" : "Devis"}</small>
          <b>{f.argent.du > 0 ? eur(f.argent.du) : d.montant != null ? eur(d.montant) : "—"}</b>
        </div>
        <div>
          <small>Encaissé</small>
          <b>{eur(f.argent.encaisse)}</b>
        </div>
        <div data-alerte={f.argent.reste > 0 || undefined}>
          <small>Reste à payer</small>
          <b>{f.argent.du > 0 ? eur(f.argent.reste) : "—"}</b>
        </div>
        <div>
          <small>Chargement</small>
          <b>{d.chargement ? jourSeul(d.chargement, { day: "numeric", month: "short" }) : (f.periode ?? "À fixer")}</b>
        </div>
        <div>
          <small>Volume</small>
          <b>{d.volume ? m3(d.volume) : "—"}</b>
        </div>
      </div>

      <Prochaine d={d} />

      <div className={s.ficheColonnes}>
        <section>
          <h5>Devis</h5>
          {f.devis.length === 0 && <p className={s.vide}>Aucun devis.</p>}
          {f.devis.map((v) => {
            const st = STATUT_DEVIS[v.statut] ?? { label: v.statut, teinte: TEINTES.gris };
            return (
              <div key={v.numero} className={s.ligneFiche}>
                <span>
                  <b>{v.formule}</b>
                  <small>
                    {v.numero}
                    {v.signeLe ? ` · signé le ${jourSeul(v.signeLe, { day: "numeric", month: "short" })}` : v.envoyeLe ? ` · envoyé le ${jourSeul(v.envoyeLe, { day: "numeric", month: "short" })}` : ""}
                  </small>
                </span>
                <Etape label={st.label} teinte={st.teinte} />
                <b className={s.chiffreLigne}>{eur(v.montant)}</b>
              </div>
            );
          })}
        </section>
        <section>
          <h5>Rendez-vous</h5>
          {rdv.length + passes.length === 0 && <p className={s.vide}>Aucun rendez-vous.</p>}
          {[...passes, ...rdv].map((r) => {
            const t = TYPES_RDV[r.type] ?? { label: r.type, teinte: TEINTES.gris };
            const avenir = +new Date(r.debut) > maintenant;
            return (
              <div key={r.debut + r.titre} className={s.ligneFiche} data-passe={!avenir || undefined}>
                <span>
                  <b>{capitale(jourLong(r.debut))}</b>
                  <small>
                    {heure(r.debut)} · {r.commercial}
                  </small>
                </span>
                <Etape label={avenir ? t.label : "Fait"} teinte={avenir ? t.teinte : TEINTES.gris} />
              </div>
            );
          })}
          {f.activite[0] && (
            <p className={s.activite}>
              <Icone nom="horloge" taille={13} />
              {f.activite[0].quoi} · {depuis(f.activite[0].quand)}
              {f.activite[0].qui ? ` · ${f.activite[0].qui}` : ""}
            </p>
          )}
        </section>
      </div>

      {(f.telephone || f.email || f.observations) && (
        <footer className={s.ficheBas}>
          {f.telephone && (
            <a href={`tel:${f.telephone.replace(/\s/g, "")}`}>
              <Icone nom="telephone" taille={14} />
              {f.telephone}
            </a>
          )}
          {f.email && (
            <a href={`mailto:${f.email}`}>
              <Icone nom="courrier" taille={14} />
              {f.email}
            </a>
          )}
          {f.observations && <p title={f.observations}>{f.observations}</p>}
        </footer>
      )}
    </article>
  );
}

/* ───────── Devis à relancer ───────── */

function ListeDevis({ devis }: { devis: EntiteDevis[] }) {
  const total = devis.reduce((t, v) => t + v.montant, 0);
  return (
    <section className={s.liste}>
      <header className={s.listeTete}>
        <span>
          {devis.length} devis · <b>{eur(total)}</b> en attente
        </span>
        <span>Sans réponse depuis</span>
      </header>
      {devis.map((v) => (
        <Link key={v.cle} href={`/dossiers/${v.dossierId}`} className={s.ligne}>
          <span className={s.ligneNom}>
            <b>{v.client}</b>
            <small>
              {v.ref} · {v.numero}
            </small>
          </span>
          <span className={s.formule}>{v.formule}</span>
          <b className={s.chiffreLigne}>{eur(v.montant)}</b>
          <span className={s.age} data-niveau={v.jours >= 14 ? "fort" : v.jours >= 7 ? "moyen" : "faible"}>
            {v.jours} j
          </span>
        </Link>
      ))}
    </section>
  );
}

/* ───────── Agenda ───────── */

function Agenda({ rdv }: { rdv: EntiteRdv[] }) {
  const jours = new Map<string, EntiteRdv[]>();
  for (const r of rdv) {
    const j = jourParis(r.debut);
    jours.set(j, [...(jours.get(j) ?? []), r]);
  }
  const maintenant = useMaintenant();
  const auj = jourParis(new Date(maintenant).toISOString());
  const demain = jourParis(new Date(maintenant + 86_400_000).toISOString());
  return (
    <section className={s.agenda}>
      {[...jours].map(([j, liste]) => (
        <div key={j} className={s.jour}>
          <h5>
            {j === auj ? "Aujourd'hui" : j === demain ? "Demain" : capitale(jourLong(liste[0].debut))}
            <small>
              {liste.length} rendez-vous{j === auj || j === demain ? ` · ${jourLong(liste[0].debut)}` : ""}
            </small>
          </h5>
          {liste.map((r) => {
            const t = TYPES_RDV[r.type] ?? { label: r.type, teinte: TEINTES.gris };
            return (
              <Link key={r.cle} href={lienRdv(r)} className={s.rdv} style={{ "--teinte": t.teinte } as React.CSSProperties} data-fait={r.termine || undefined}>
                <span className={s.heure}>
                  <b>{heure(r.debut)}</b>
                  {r.dureeMin ? <small>{r.dureeMin >= 60 ? `${Math.floor(r.dureeMin / 60)} h${r.dureeMin % 60 ? String(r.dureeMin % 60).padStart(2, "0") : ""}` : `${r.dureeMin} min`}</small> : null}
                </span>
                <span className={s.rdvCorps}>
                  <b>{r.client ?? r.titre}</b>
                  <small>
                    {[r.client ? r.titre : null, r.lieu ? ville(r.lieu) : null, r.ref].filter(Boolean).join(" · ")}
                  </small>
                </span>
                <span className={s.typeRdv}>{t.label}</span>
                <span className={s.initiales} title={r.commercial}>
                  {initiales(r.commercial)}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </section>
  );
}

/* ───────── Demandes du site ───────── */

function ListeDemandes({ demandes }: { demandes: EntiteDemande[] }) {
  return (
    <section className={s.liste}>
      <header className={s.listeTete}>
        <span>
          {demandes.length} demande{demandes.length > 1 ? "s" : ""} du site
        </span>
        <span>Potentiel</span>
      </header>
      {demandes.map((r) => {
        const e = ETAPE_DEMANDE[r.etape];
        return (
          <Link key={r.cle} href={`/dashboard/${r.id}`} className={s.ligne} data-demande>
            <span className={s.ligneNom}>
              <b>{r.client}</b>
              <small>
                {[r.depart && r.arrivee ? `${r.depart} → ${r.arrivee}` : (r.depart ?? r.arrivee), r.volume ? m3(r.volume) : null, r.dateSouhaitee ? `souhaité ${jourSeul(r.dateSouhaitee, { day: "numeric", month: "short" })}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
            <Etape label={e.label} teinte={TEINTES[e.teinte]} />
            <span className={s.recue}>{depuis(r.recueLe)}</span>
            <span
              className={s.potentiel}
              data-vide={r.potentiel == null || undefined}
              style={{ "--p": Math.max(0, Math.min(100, r.potentiel ?? 0)) } as React.CSSProperties}
              title={r.potentiel != null ? `Potentiel : ${r.potentiel} / 100` : "Pas encore évaluée"}
            >
              {r.potentiel != null ? (
                <>
                  <i />
                  <b>{r.potentiel}</b>
                </>
              ) : (
                <small>—</small>
              )}
            </span>
          </Link>
        );
      })}
    </section>
  );
}

/* ───────── Chiffres ───────── */

function Chiffre({ c }: { c: EntiteChiffre }) {
  const [premier, ...autres] = c.valeurs;
  if (c.serie) {
    const max = Math.max(1, ...c.serie.map((x) => x.valeur));
    return (
      <section className={s.chiffre} data-large>
        <header>
          <span>
            <b>{c.titre}</b>
            {c.sous && <small>{c.sous}</small>}
          </span>
          {premier && (
            <span className={s.chiffreFort}>
              {valeur(premier)}
              <small>{premier.libelle}</small>
            </span>
          )}
        </header>
        <div className={s.barres} role="img" aria-label={c.serie.map((x) => `${x.libelle} : ${eur(x.valeur)}`).join(", ")}>
          {c.serie.map((x) => (
            <span key={x.libelle} data-courant={x.courant || undefined} title={`${capitale(x.libelle)} : ${eur(x.valeur)}`}>
              <i style={{ height: `${x.valeur > 0 ? Math.max(4, (x.valeur / max) * 100) : 0}%` }} />
              <small>{x.libelle.slice(0, 3)}</small>
            </span>
          ))}
        </div>
      </section>
    );
  }
  // Deux périodes face à face (le CA du mois et du précédent) : une ligne chacune, la barre à l'échelle.
  if (c.evolution !== undefined && autres.length) {
    const max = Math.max(1, ...c.valeurs.map((v) => v.valeur));
    return (
      <section className={s.chiffre} data-comparaison>
        <header>
          <span>
            <b>{c.titre}</b>
            {c.sous && <small>{c.sous}</small>}
          </span>
          {c.evolution != null && (
            <span className={s.evolution} data-sens={c.evolution >= 0 ? "haut" : "bas"}>
              {c.evolution >= 0 ? "+" : "−"}
              {nombre(Math.abs(c.evolution))} %
            </span>
          )}
        </header>
        <div className={s.duel}>
          {c.valeurs.map((v) => (
            <div key={v.libelle} data-fort={v.fort || undefined}>
              <small>{v.libelle}</small>
              <span className={s.piste}>
                <i style={{ "--w": `${Math.max(1, (v.valeur / max) * 100)}%` } as React.CSSProperties} />
              </span>
              <b>{valeur(v)}</b>
            </div>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className={s.chiffre}>
      <header>
        <span>
          <b>{c.titre}</b>
          {c.sous && <small>{c.sous}</small>}
        </span>
      </header>
      <div className={s.valeurs}>
        {c.valeurs.map((v) => (
          <span key={v.libelle} data-fort={v.fort || undefined}>
            <b>{valeur(v)}</b>
            <small>{v.libelle}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

/* ───────── Dans une phrase : un lien court ───────── */

export function libelleEntite(e: Entite): string {
  switch (e.genre) {
    case "dossier":
      return `${e.ref} · ${e.client}`;
    case "devis":
      return `${e.client} · ${eur(e.montant)}`;
    case "rdv":
      return `${e.client ?? e.titre} · ${new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(new Date(e.debut))} ${heure(e.debut)}`;
    case "demande":
      return e.client;
    case "chiffre":
      return e.valeurs[0] ? `${e.titre} : ${valeur(e.valeurs[0])}` : e.titre;
  }
}

/** Une ligne de texte pour « Copier » : l'élément, en clair. */
export function texteEntite(e: Entite): string {
  switch (e.genre) {
    case "dossier":
      return [
        `${e.ref} · ${e.client}`,
        etapeDossier(e.statut).label,
        [ville(e.depart), ville(e.arrivee)].filter(Boolean).join(" → "),
        e.montant != null ? eur(e.montant) : null,
        e.prochaine ? `prochaine étape : ${e.prochaine.titre}` : null,
      ]
        .filter(Boolean)
        .join(" — ");
    case "devis":
      return `${e.client} (${e.ref}) — ${e.formule} — ${eur(e.montant)} — sans réponse depuis ${e.jours} j`;
    case "rdv":
      return `${capitale(jourLong(e.debut))} ${heure(e.debut)} — ${TYPES_RDV[e.type]?.label ?? e.type} — ${[e.client, e.titre].filter(Boolean).join(", ")} — ${e.commercial}`;
    case "demande":
      return `${e.client} — ${[e.depart, e.arrivee].filter(Boolean).join(" → ")} — ${ETAPE_DEMANDE[e.etape].label}`;
    case "chiffre":
      return `${e.titre}${e.sous ? ` (${e.sous})` : ""} : ${(e.serie ? e.serie.filter((x) => x.valeur > 0).map((x) => ({ libelle: x.libelle, valeur: x.valeur, format: "eur" as const })) : e.valeurs).map((v) => `${v.libelle} ${valeur(v)}`).join(", ")}`;
  }
}

export function lienEntite(e: Entite): string | null {
  switch (e.genre) {
    case "dossier":
      return `/dossiers/${e.id}`;
    case "devis":
      return `/dossiers/${e.dossierId}`;
    case "rdv":
      return lienRdv(e);
    case "demande":
      return `/dashboard/${e.id}`;
    case "chiffre":
      return null;
  }
}

export function teinteEntite(e: Entite): string {
  switch (e.genre) {
    case "dossier":
      return TEINTES[etapeDossier(e.statut).teinte];
    case "devis":
      return TEINTES.ciel;
    case "rdv":
      return TYPES_RDV[e.type]?.teinte ?? TEINTES.gris;
    case "demande":
      return TEINTES[ETAPE_DEMANDE[e.etape].teinte];
    case "chiffre":
      return TEINTES.vert;
  }
}
