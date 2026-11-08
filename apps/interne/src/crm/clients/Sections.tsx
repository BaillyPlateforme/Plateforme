import Link from "next/link";
import type { Row } from "@/crm/lib/db";
import { photoPour, RDV_TYPES, TYPES, initiales } from "@/crm/lib/format";
import { Avatar, Pastille } from "@/crm/kanban/Carte";
import { ETAPE_DEMANDE, TEINTES, etapeDossier, type CleEtapeDemande, type Teinte } from "@/crm/kanban/etapes";
import { Icone, type NomIcone } from "@/ui/icones";
import { ajouterContactClient, majClient, supprimerContactClient } from "./actions";
import { Confirmer, Enregistrer } from "./Boutons";
import { emailValide, lienTelephone, telephoneLisible, TEINTE_TYPE } from "./commun";
import { villeDe, type DossierClient, type EspaceClient, type FicheClient } from "./donnees";
import s from "./clients.module.css";

/*
 * Les sections de la fiche d'un client (/clients/<id>), rendues par le
 * serveur : Identité et contacts, Dossiers, Devis et factures, Espace client,
 * Rendez-vous, Demandes du site. Les Messages et l'Historique sont posés par
 * la page (composants du navigateur : la discussion, le fil du Feed).
 */

/* ─────────── Formats ─────────── */

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", o);
// Une date sans heure (chargement, émission, échéance…) est lue à minuit UTC (voir lib/db.ts).
const JOUR_UTC = fmt({ day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const JOUR = fmt({ day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
const JOUR_HEURE = fmt({ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const MOIS = fmt({ month: "long", year: "numeric", timeZone: "UTC" });
export const jourUtc = (d: unknown) => (d ? JOUR_UTC.format(new Date(d as string)) : "—");
export const jour = (d: unknown) => (d ? JOUR.format(new Date(d as string)) : "—");
/** Un montant : les centimes seulement quand il en a (« 2 201 € », « 2 200,80 € »), partout pareil. */
export const euros = (n: number | null | undefined) => {
  if (n == null) return "—";
  const cents = Math.abs(n - Math.round(n)) >= 0.005;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 }).format(n);
};
const pluriel = (n: number, mot: string, pl = `${mot}s`) => `${n} ${n > 1 ? pl : mot}`;

/* ─────────── La forme commune d'une section ─────────── */

export function Section({
  id,
  titre,
  sous,
  icone,
  actions,
  children,
}: {
  id: string;
  titre: string;
  sous?: React.ReactNode;
  icone: NomIcone;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={s.section} aria-labelledby={`${id}-titre`}>
      <header className={s.sectionTete}>
        <i className={s.sectionIcone} aria-hidden>
          <Icone nom={icone} taille={18} />
        </i>
        <div className={s.sectionTitres}>
          <h2 id={`${id}-titre`}>{titre}</h2>
          {sous && <p>{sous}</p>}
        </div>
        {actions && <div className={s.sectionActions}>{actions}</div>}
      </header>
      {children}
    </section>
  );
}

function Vide({ icone, children }: { icone: NomIcone; children: React.ReactNode }) {
  return (
    <p className={s.videSection}>
      <Icone nom={icone} taille={18} />
      <span>{children}</span>
    </p>
  );
}

/* ─────────── Les doublons possibles ─────────── */

export function Doublons({ doublons }: { doublons: FicheClient["doublons"] }) {
  if (!doublons.length) return null;
  return (
    <details className={s.doublons}>
      <summary>
        <Icone nom="alerte" taille={15} />
        <b>Doublons possibles ({doublons.length})</b>
        <span>même e-mail ou même téléphone : la fusion des fiches n’existe pas encore</span>
        <Icone nom="chevron" taille={15} className={s.doublonsChevron} />
      </summary>
      <ul>
        {doublons.map((d) => (
          <li key={d.id}>
            <Link href={`/clients/${d.id}`} prefetch={false}>
              <span className={s.doublonAvatar} data-teinte={TEINTE_TYPE[d.type] ?? "indigo"}>
                {initiales(d.nom) || "?"}
              </span>
              <span className={s.doublonTexte}>
                <b>{d.nom}</b>
                <small>
                  Client n° {d.id} · même {d.par.map((p) => (p === "email" ? "e-mail" : "téléphone")).join(" et même ")} · {pluriel(d.nbDossiers, "dossier")}
                  {d.dernierRef ? ` · ${d.dernierRef}` : ""}
                </small>
              </span>
              <Icone nom="fleche" taille={14} />
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ─────────── Identité et contacts ─────────── */

function Fait({ libelle, children, large }: { libelle: string; children: React.ReactNode; large?: boolean }) {
  return (
    <div className={s.fait} data-large={large ? "" : undefined}>
      <dt>{libelle}</dt>
      <dd>{children ?? <span className={s.manque}>—</span>}</dd>
    </div>
  );
}

function Telephone({ t }: { t: string | null | undefined }) {
  const lisible = telephoneLisible(t);
  if (!lisible) return null;
  const href = lienTelephone(t);
  return href ? (
    <a href={href} className={s.lienDoux}>
      {lisible}
    </a>
  ) : (
    <>{lisible}</>
  );
}

export function Identite({
  f,
  modifier,
  contactOuvert,
  erreur,
  espaceOuvert,
  avant,
}: {
  f: FicheClient;
  modifier: boolean;
  contactOuvert: boolean;
  erreur: string | null;
  espaceOuvert: boolean;
  /** Sous le titre : l'enregistrement fait, les doublons possibles. */ avant?: React.ReactNode;
}) {
  const c = f.client;
  const id = c.id as number;
  const email = emailValide(c.email) ? String(c.email).trim() : null;
  const adresse = [c.facturation_adresse, [c.facturation_cp, c.facturation_ville].filter(Boolean).join(" "), c.facturation_pays].filter((x) => x && String(x).trim());
  return (
    <Section
      id="identite"
      titre="Identité et contacts"
      icone="clients"
      sous={`Client n° ${id} · dans le CRM depuis le ${jour(c.cree_le)}`}
      actions={
        !modifier && (
          <Link href={`/clients/${id}?modifier=1#identite`} className={s.boutonClair} scroll={false} prefetch={false}>
            <Icone nom="crayon" taille={15} />
            Modifier
          </Link>
        )
      }
    >
      {avant}
      {modifier ? (
        <FormulaireClient c={c} espaceOuvert={espaceOuvert} erreur={erreur} />
      ) : (
        <div className={s.identite}>
          <dl className={s.faits}>
            <p className={s.groupeTitre}>Identité</p>
            <Fait libelle="Nom">{[c.civilite, c.prenom, c.nom].filter(Boolean).join(" ") || null}</Fait>
            <Fait libelle="Société">{c.societe || null}</Fait>
            <Fait libelle="Type de client">
              <Pastille label={TYPES[c.type] ?? c.type} teinte={TEINTE_TYPE[c.type] ?? "indigo"} />
            </Fait>
            <p className={s.groupeTitre}>Coordonnées</p>
            <Fait libelle="Téléphone">{c.telephone ? <Telephone t={c.telephone} /> : null}</Fait>
            <Fait libelle="Autre téléphone">{c.telephone2 ? <Telephone t={c.telephone2} /> : null}</Fait>
            <Fait libelle="E-mail">
              {email ? (
                <a href={`mailto:${email}`} className={s.lienDoux} title={email}>
                  {email}
                </a>
              ) : (
                c.email || null
              )}
              {email && espaceOuvert && <small className={s.aide}>identifiant de son espace client</small>}
            </Fait>
          </dl>
          <dl className={s.faits}>
            <p className={s.groupeTitre}>Facturation</p>
            <Fait libelle="Adresse">{adresse.length ? adresse.join(", ") : null}</Fait>
            <Fait libelle="SIREN">{c.siren || null}</Fait>
            <Fait libelle="TVA intracom.">{c.tva_intracom || null}</Fait>
            <p className={s.groupeTitre}>Notes</p>
            <Fait libelle="Notes" large>
              {c.notes ? <span className={s.notes}>{c.notes}</span> : null}
            </Fait>
          </dl>
          <Contacts clientId={id} contacts={f.contacts} ouvert={contactOuvert} />
        </div>
      )}
    </Section>
  );
}

function Champ({ l = 6, titre, aide, children }: { l?: 2 | 3 | 4 | 6 | 8 | 12; titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <label className={s.champ} data-l={l}>
      <span>
        {titre}
        {aide && <small> · {aide}</small>}
      </span>
      {children}
    </label>
  );
}

/** Le formulaire de la fiche : les champs de la fenêtre « Fiche » d'un dossier, plus la facturation et les notes. */
function FormulaireClient({ c, espaceOuvert, erreur }: { c: Row; espaceOuvert: boolean; erreur: string | null }) {
  return (
    <form action={majClient.bind(null, c.id)} className={s.formulaire}>
      {erreur === "nom" && <p className={s.erreur}>Le nom du client est obligatoire.</p>}
      <fieldset>
        <legend>Identité</legend>
        <div className={s.grille}>
          <Champ l={2} titre="Civilité">
            <select name="civilite" defaultValue={c.civilite ?? ""}>
              <option value="">—</option>
              <option>Madame</option>
              <option>Monsieur</option>
            </select>
          </Champ>
          <Champ l={4} titre="Prénom">
            <input type="text" name="prenom" defaultValue={c.prenom ?? ""} />
          </Champ>
          <Champ l={6} titre="Nom">
            <input type="text" name="nom" defaultValue={c.nom ?? ""} required />
          </Champ>
          <Champ l={6} titre="Société" aide="pour un compte ou un partenaire">
            <input type="text" name="societe" defaultValue={c.societe ?? ""} />
          </Champ>
          <Champ l={6} titre="Type de client" aide="fixe le parcours de son espace">
            <select name="type" defaultValue={c.type}>
              {Object.entries(TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Champ>
        </div>
      </fieldset>
      <fieldset>
        <legend>Coordonnées</legend>
        <div className={s.grille}>
          <Champ l={4} titre="Téléphone" aide="reçoit les SMS">
            <input type="tel" name="telephone" defaultValue={c.telephone ?? ""} />
          </Champ>
          <Champ l={4} titre="Autre téléphone">
            <input type="tel" name="telephone2" defaultValue={c.telephone2 ?? ""} />
          </Champ>
          <Champ l={4} titre="E-mail" aide={espaceOuvert ? "identifiant de l'espace : il se modifie depuis l'espace" : undefined}>
            <input type="email" name="email" defaultValue={c.email ?? ""} readOnly={espaceOuvert} />
          </Champ>
        </div>
      </fieldset>
      <fieldset>
        <legend>Facturation</legend>
        <div className={s.grille}>
          <Champ l={12} titre="Adresse de facturation">
            <input type="text" name="facturation_adresse" defaultValue={c.facturation_adresse ?? ""} autoComplete="off" />
          </Champ>
          <Champ l={3} titre="Code postal">
            <input type="text" name="facturation_cp" defaultValue={c.facturation_cp ?? ""} inputMode="numeric" />
          </Champ>
          <Champ l={6} titre="Ville">
            <input type="text" name="facturation_ville" defaultValue={c.facturation_ville ?? ""} />
          </Champ>
          <Champ l={3} titre="Pays">
            <input type="text" name="facturation_pays" defaultValue={c.facturation_pays ?? ""} placeholder="France" />
          </Champ>
          <Champ l={6} titre="SIREN">
            <input type="text" name="siren" defaultValue={c.siren ?? ""} inputMode="numeric" />
          </Champ>
          <Champ l={6} titre="TVA intracommunautaire">
            <input type="text" name="tva_intracom" defaultValue={c.tva_intracom ?? ""} />
          </Champ>
        </div>
      </fieldset>
      <fieldset>
        <legend>Notes</legend>
        <div className={s.grille}>
          <Champ l={12} titre="Notes sur le client" aide="visibles de l'équipe seulement">
            <textarea name="notes" rows={3} defaultValue={c.notes ?? ""} />
          </Champ>
        </div>
      </fieldset>
      <div className={s.pied}>
        <Link href={`/clients/${c.id}#identite`} className={s.boutonClair} scroll={false}>
          Annuler
        </Link>
        <Enregistrer>Enregistrer la fiche</Enregistrer>
      </div>
    </form>
  );
}

function Contacts({ clientId, contacts, ouvert }: { clientId: number; contacts: Row[]; ouvert: boolean }) {
  return (
    <div className={s.contacts}>
      <div className={s.contactsTete}>
        <p className={s.groupeTitre}>Autres contacts</p>
        {!ouvert && (
          <Link href={`/clients/${clientId}?contact=1#identite`} className={s.lienAjout} scroll={false} prefetch={false}>
            <Icone nom="plus" taille={14} />
            Ajouter
          </Link>
        )}
      </div>
      {contacts.length === 0 && !ouvert && <p className={s.contactsVide}>Le client est le seul contact : conjoint, assistante, service des achats… s’ajoutent ici.</p>}
      {contacts.length > 0 && (
        <ul className={s.contactsListe}>
          {contacts.map((k) => {
            const nom = [k.civilite, k.prenom, k.nom].filter(Boolean).join(" ");
            return (
              <li key={k.id}>
                <span className={s.contactAvatar}>{initiales([k.prenom, k.nom].filter(Boolean).join(" ")) || "?"}</span>
                <span className={s.contactTexte}>
                  <b>
                    {nom}
                    {k.fonction && <em> · {k.fonction}</em>}
                  </b>
                  <small>
                    {k.telephone && <Telephone t={k.telephone} />}
                    {k.telephone && k.email && " · "}
                    {k.email && (
                      <a href={`mailto:${k.email}`} className={s.lienDoux}>
                        {k.email}
                      </a>
                    )}
                  </small>
                </span>
                <form action={supprimerContactClient.bind(null, clientId, k.id)}>
                  <Confirmer question={`Retirer ${nom} des contacts du client ?`} icone="corbeille" titre={`Retirer ${nom}`} />
                </form>
              </li>
            );
          })}
        </ul>
      )}
      {ouvert && (
        <form action={ajouterContactClient.bind(null, clientId)} className={s.contactForm}>
          <div className={s.grille}>
            <Champ l={4} titre="Prénom">
              <input type="text" name="prenom" />
            </Champ>
            <Champ l={4} titre="Nom">
              <input type="text" name="nom" required />
            </Champ>
            <Champ l={4} titre="Fonction">
              <input type="text" name="fonction" placeholder="Conjoint, assistante…" />
            </Champ>
            <Champ l={6} titre="Téléphone">
              <input type="tel" name="telephone" />
            </Champ>
            <Champ l={6} titre="E-mail">
              <input type="email" name="email" />
            </Champ>
          </div>
          <div className={s.pied}>
            <Link href={`/clients/${clientId}#identite`} className={s.boutonClair} scroll={false}>
              Annuler
            </Link>
            <Enregistrer>Ajouter le contact</Enregistrer>
          </div>
        </form>
      )}
    </div>
  );
}

/* ─────────── Dossiers ─────────── */

const TYPES_DEM: Record<string, string> = { national: "National", international: "International", local: "Local", groupage: "Groupage" };

function periodeDe(d: DossierClient): string | null {
  if (d.chargement) return `Chargement le ${jourUtc(d.chargement)}`;
  if (d.periode?.trim()) return d.periode.trim();
  if (d.moisCa) return MOIS.format(new Date(d.moisCa));
  return null;
}

export function Dossiers({ f, clientId }: { f: FicheClient; clientId: number }) {
  const propres = f.dossiers.filter((d) => !d.payeurSeulement);
  const payes = f.dossiers.filter((d) => d.payeurSeulement);
  const enCours = propres.filter((d) => !d.archiveLe && !["termine", "perdu"].includes(d.statut)).length;
  return (
    <Section
      id="dossiers"
      titre="Dossiers"
      icone="parcours"
      sous={
        propres.length
          ? `${pluriel(propres.length, "dossier")}${enCours ? ` · ${enCours} en cours` : ""}${payes.length ? ` · payeur de ${pluriel(payes.length, "autre dossier")}` : ""}`
          : "Aucun dossier pour ce client"
      }
      actions={
        <Link href={`/dossiers/nouveau?client=${clientId}`} className={s.boutonClair} prefetch={false}>
          <Icone nom="plus" taille={15} />
          Nouveau dossier
        </Link>
      }
    >
      {f.dossiers.length === 0 ? (
        <Vide icone="dossierClient">Ce client n’a pas encore de dossier : « Nouveau dossier » le crée, son identité déjà remplie.</Vide>
      ) : (
        <ol className={s.dossiersListe}>
          {f.dossiers.map((d) => (
            <CarteDossier key={d.id} d={d} />
          ))}
        </ol>
      )}
    </Section>
  );
}

function CarteDossier({ d }: { d: DossierClient }) {
  const etape = etapeDossier(d.statut);
  const depart = villeDe(d.depart);
  const arrivee = villeDe(d.arrivee);
  const periode = periodeDe(d);
  return (
    <li className={s.carteDossier} style={{ ["--e" as string]: TEINTES[etape.teinte] }}>
      <i className={s.vignette} style={{ backgroundImage: `url(${photoPour(d.arrivee, d.id)})` }} aria-hidden />
      <div className={s.carteCorps}>
        <div className={s.carteHaut}>
          <Link href={`/dossiers/${d.id}`} className={s.carteRef} prefetch={false}>
            {d.ref}
          </Link>
          <Pastille label={etape.label} teinte={etape.teinte} titre={etape.aide} />
          {d.archiveLe && <span className={s.marque}>Archivé</span>}
          {d.payeurSeulement && <span className={s.marque}>Payeur · pour {d.beneficiaire}</span>}
        </div>
        <p className={s.trajet}>
          {depart || arrivee ? (
            <>
              {depart ?? "—"} <span aria-hidden>→</span> {arrivee ?? "—"}
            </>
          ) : (
            <span className={s.manque}>Trajet à préciser</span>
          )}
        </p>
        <p className={s.meta}>
          {[
            `Créé le ${jour(d.creeLe)}`,
            periode,
            d.volume > 0 ? `${String(Math.round(d.volume * 10) / 10).replace(".", ",")} m³` : null,
            d.typeDemenagement && d.typeDemenagement !== "national" ? (TYPES_DEM[d.typeDemenagement] ?? d.typeDemenagement) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className={s.carteCom}>
        {d.commercial ? (
          <>
            <Avatar r={d.commercial} mini />
            <span>{d.commercial.nom}</span>
          </>
        ) : (
          <span className={s.manque}>Sans commercial</span>
        )}
      </div>
      <div className={s.carteChiffres}>
        <span>
          <small>Signé</small>
          <b>{d.engage > 0 ? euros(d.engage) : "—"}</b>
        </span>
        <span data-ton={d.reste > 0.5 ? "du" : undefined}>
          <small>{d.reste < -0.5 ? "Crédit" : "Reste"}</small>
          <b>{d.reste > 0.5 ? euros(d.reste) : d.reste < -0.5 ? euros(-d.reste) : d.du > 0 ? "Soldé" : "—"}</b>
        </span>
      </div>
      <span className={s.aller} aria-hidden>
        <Icone nom="droite" taille={16} />
      </span>
    </li>
  );
}

/* ─────────── Devis et factures ─────────── */

const DEVIS_ST: Record<string, { label: string; teinte: Teinte }> = {
  brouillon: { label: "Brouillon", teinte: "gris" },
  envoye: { label: "Envoyé", teinte: "ciel" },
  signe: { label: "Signé", teinte: "vert" },
  refuse: { label: "Refusé", teinte: "rose" },
};
const FORMULES: Record<string, string> = { economique: "Économique", standard: "Standard", premium: "Premium", libre: "Devis libre" };
const ETAT_FACTURE: Record<string, { label: string; teinte: Teinte }> = {
  a_regler: { label: "À régler", teinte: "ambre" },
  partielle: { label: "Réglée en partie", teinte: "ciel" },
  soldee: { label: "Soldée", teinte: "vert" },
  annulee: { label: "Annulée", teinte: "gris" },
  avoir: { label: "Avoir", teinte: "violet" },
};
const GENRE_FACTURE: Record<string, string> = { facture: "Facture", solde: "Facture de solde", acompte: "Facture d’arrhes", avoir: "Avoir" };

export function Argent({ f }: { f: FicheClient }) {
  const propres = f.dossiers;
  const ca = propres.reduce((a, d) => a + d.engage, 0);
  const facture = propres.reduce((a, d) => a + d.facture, 0);
  const encaisse = propres.reduce((a, d) => a + d.encaisse, 0);
  const reste = propres.reduce((a, d) => a + Math.max(0, d.reste), 0);
  const credit = propres.reduce((a, d) => a + Math.max(0, -d.reste), 0);
  const enRetard = f.factures.filter((x) => x.en_retard).length;
  return (
    <Section
      id="argent"
      titre="Devis et factures"
      icone="euro"
      sous={`${pluriel(f.devis.length, "devis", "devis")} · ${pluriel(f.factures.length, "facture")} · ${pluriel(f.reglements.nombre, "règlement")}${f.reglements.dernier ? `, le dernier le ${jourUtc(f.reglements.dernier)}` : ""}`}
    >
      {f.devis.length === 0 && f.factures.length === 0 && f.reglements.nombre === 0 ? (
        <Vide icone="euro">Ni devis, ni facture, ni règlement : ils s’établissent dans ses dossiers.</Vide>
      ) : (
        <>
          <div className={s.totaux}>
            <span>
              <small>CA signé</small>
              <b>{euros(ca)}</b>
            </span>
            <span>
              <small>Facturé</small>
              <b>{euros(facture)}</b>
            </span>
            <span>
              <small>Encaissé</small>
              <b>{euros(encaisse)}</b>
              {ca > 0 && (
                <i className={s.jauge} aria-hidden>
                  <i style={{ width: `${Math.min(100, Math.round((encaisse / Math.max(ca, facture)) * 100))}%` }} />
                </i>
              )}
            </span>
            <span data-ton={reste > 0.5 ? "du" : ca > 0 || facture > 0 ? "ok" : "rien"}>
              <small>Reste à payer</small>
              <b>{reste > 0.5 ? euros(reste) : ca > 0 || facture > 0 ? "Soldé" : "—"}</b>
              {(enRetard > 0 || credit > 0.5) && (
                <em>{[enRetard ? `${pluriel(enRetard, "facture")} en retard` : null, credit > 0.5 ? `crédit ${euros(credit)}` : null].filter(Boolean).join(" · ")}</em>
              )}
            </span>
          </div>

          <div className={s.deuxTables}>
            <div>
              <p className={s.tableTitre}>Devis</p>
              {f.devis.length === 0 ? (
                <Vide icone="devis">Aucun devis.</Vide>
              ) : (
                <table className={s.table}>
                  <tbody>
                    {f.devis.map((v) => {
                      const st = DEVIS_ST[v.statut] ?? { label: v.statut, teinte: "gris" as Teinte };
                      return (
                        <tr key={v.id}>
                          <td>
                            <Link href={`/dossiers/${v.dossier_id}/devis/${v.id}`} className={s.lienFort} prefetch={false}>
                              {v.numero}
                            </Link>
                            <small>
                              {FORMULES[v.formule] ?? v.formule} · {v.ref}
                            </small>
                          </td>
                          <td>
                            <Pastille label={st.label} teinte={st.teinte} />
                            <small>{v.signe_le ? `le ${jour(v.signe_le)}` : v.envoye_le ? `envoyé le ${jour(v.envoye_le)}` : `créé le ${jour(v.cree_le)}`}</small>
                          </td>
                          <td className={s.num}>
                            <b>{euros(v.montant)}</b>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <p className={s.tableTitre}>Factures</p>
              {f.factures.length === 0 ? (
                <Vide icone="facture">Aucune facture.</Vide>
              ) : (
                <table className={s.table}>
                  <tbody>
                    {f.factures.map((x) => {
                      const et = x.en_retard ? { label: "En retard", teinte: "rose" as Teinte } : (ETAT_FACTURE[x.etat] ?? { label: x.etat, teinte: "gris" as Teinte });
                      return (
                        <tr key={x.id}>
                          <td>
                            <Link
                              href={x.dossier_id ? `/dossiers/${x.dossier_id}#facturation` : `/factures?q=${encodeURIComponent(x.numero)}`}
                              className={s.lienFort}
                              prefetch={false}
                            >
                              {x.numero}
                            </Link>
                            <small>
                              {GENRE_FACTURE[x.genre] ?? x.genre}
                              {x.ref ? ` · ${x.ref}` : ""} · émise le {jourUtc(x.emise_le)}
                            </small>
                          </td>
                          <td>
                            <Pastille label={et.label} teinte={et.teinte} />
                            {x.echeance_le && x.etat !== "soldee" && x.etat !== "annulee" && x.etat !== "avoir" && <small>échéance {jourUtc(x.echeance_le)}</small>}
                          </td>
                          <td className={s.num}>
                            <b>{euros(x.ttc)}</b>
                            {x.reste > 0 && <small className={s.du}>reste {euros(x.reste)}</small>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </Section>
  );
}

/* ─────────── Espace client ─────────── */

export function Espaces({ f }: { f: FicheClient }) {
  const propres = f.dossiers.filter((d) => !d.payeurSeulement);
  const parDossier = new Map<number, EspaceClient[]>();
  for (const e of f.espaces) parDossier.set(e.dossierId, [...(parDossier.get(e.dossierId) ?? []), e]);
  const ouverts = f.espaces.length;
  return (
    <Section
      id="espace"
      titre="Espace client"
      icone="dossierClient"
      sous={ouverts ? `${pluriel(ouverts, "espace ouvert", "espaces ouverts")} sur ${pluriel(propres.length, "dossier")}` : "Aucun espace client ouvert"}
    >
      {propres.length === 0 ? (
        <Vide icone="dossierClient">Un espace client s’ouvre depuis un dossier.</Vide>
      ) : (
        <ul className={s.espaces}>
          {propres.map((d) => {
            const es = parDossier.get(d.id) ?? [];
            if (!es.length)
              return (
                <li key={d.id} className={s.espaceLigne} data-etat="aucun">
                  <span className={s.espaceEtat}>
                    <i />
                  </span>
                  <span className={s.espaceTexte}>
                    <b>{d.ref}</b>
                    <small>Pas d’espace client pour ce dossier</small>
                  </span>
                  <span />
                  <span className={s.espaceActions}>
                    <Link href={`/dossiers/${d.id}#commun-espace`} className={s.boutonClair} prefetch={false}>
                      Ouvrir depuis le dossier
                    </Link>
                  </span>
                </li>
              );
            return es.map((e) => (
              <li key={e.id} className={s.espaceLigne} data-etat={e.derniereConnexion ? "vu" : "jamais"}>
                <span className={s.espaceEtat}>
                  <i />
                </span>
                <span className={s.espaceTexte}>
                  <b>
                    {d.ref} <em>· espace {e.reference}</em>
                  </b>
                  <small>
                    Ouvert le {jour(e.creeLe)}
                    {e.email ? ` · se connecte avec ${e.email}` : ""}
                  </small>
                </span>
                <span className={s.espaceVu}>
                  <b>{e.derniereConnexion ? `Vu le ${jour(e.derniereConnexion)}` : "Jamais connecté"}</b>
                  <small>{e.connexions ? pluriel(e.connexions, "connexion") : "aucune connexion"}</small>
                </span>
                <span className={s.espaceActions}>
                  <Link href={`/dashboard/espace-client/dossiers/${e.id}`} className={s.boutonClair} prefetch={false}>
                    Suivi de l’espace
                  </Link>
                  {/* Un <a> et jamais un <Link> : un préchargement noterait une ouverture de l'aperçu. */}
                  <a
                    href={`/espace-client-apercu/${e.id}`}
                    target="_blank"
                    rel="noopener"
                    className={s.boutonIcone}
                    title="L'espace tel que le client le voit, en lecture seule (nouvel onglet)"
                    aria-label="Voir comme le client"
                  >
                    <Icone nom="oeil" taille={16} />
                  </a>
                </span>
              </li>
            ));
          })}
        </ul>
      )}
    </Section>
  );
}

/* ─────────── Rendez-vous ─────────── */

const TEINTE_RDV: Record<string, Teinte> = { phys: "indigo", visio: "ciel", tache: "ambre", perso: "gris" };

export function RendezVous({ rdvs, maintenant }: { rdvs: Row[]; maintenant: number }) {
  const avenir = rdvs.filter((r) => new Date(r.debut).getTime() >= maintenant && !r.termine && !r.sans_suite).length;
  return (
    <Section
      id="rdv"
      titre="Rendez-vous"
      icone="calendrier"
      sous={rdvs.length ? `${pluriel(rdvs.length, "rendez-vous", "rendez-vous")}${avenir ? ` · ${avenir} à venir` : ""}` : "Aucun rendez-vous"}
    >
      {rdvs.length === 0 ? (
        <Vide icone="calendrier">Ni visite ni rendez-vous pour ses dossiers.</Vide>
      ) : (
        <ol className={s.rdvs}>
          {rdvs.map((r) => {
            const d = new Date(r.debut);
            const passe = d.getTime() < maintenant;
            const etat = r.sans_suite ? "Sans suite" : r.termine ? (r.devis_etabli ? "Fait · devis établi" : "Fait") : passe ? "Passé" : "À venir";
            return (
              <li key={r.id} data-passe={passe || r.termine || undefined}>
                <Link href={`/planning/${r.id}`} className={s.rdv} prefetch={false}>
                  <span className={s.rdvDate}>
                    <b>{new Intl.DateTimeFormat("fr-FR", { day: "numeric", timeZone: "Europe/Paris" }).format(d)}</b>
                    <small>{new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "Europe/Paris" }).format(d)}</small>
                  </span>
                  <span className={s.rdvTexte}>
                    <b>{r.titre}</b>
                    <small>{[r.journee ? "Toute la journée" : JOUR_HEURE.format(d), r.lieu, r.ref].filter(Boolean).join(" · ")}</small>
                  </span>
                  <Pastille label={RDV_TYPES[r.type] ?? r.type} teinte={TEINTE_RDV[r.type] ?? "gris"} />
                  <span className={s.rdvEtat} data-etat={r.termine ? "fait" : r.sans_suite ? "sans" : passe ? "passe" : "avenir"}>
                    {etat}
                  </span>
                  {r.commercial ? <Avatar r={{ id: null, nom: r.commercial, initiales: r.initiales }} mini /> : <span />}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

/* ─────────── Demandes du site ─────────── */

const ETAPE_STATUT: Record<string, CleEtapeDemande> = {
  new: "nouvelle",
  analyzing: "analyse",
  qualified: "qualifiee",
  quoted: "devis",
  won: "accepte",
  lost: "perdue",
  archived: "archivee",
};

export function Demandes({ demandes, email }: { demandes: Row[]; email: string | null }) {
  return (
    <Section
      id="demandes"
      titre="Demandes du site"
      icone="globe"
      sous={demandes.length ? `${pluriel(demandes.length, "demande")} · envoyées depuis son e-mail, ou à l’origine d’un dossier` : "Aucune demande du site à son e-mail"}
      actions={
        email && (
          <Link href={`/dashboard/clients/${encodeURIComponent(email)}`} className={s.boutonClair} prefetch={false}>
            Historique de l’e-mail
          </Link>
        )
      }
    >
      {demandes.length === 0 ? (
        <Vide icone="globe">Ce client n’est pas passé par le formulaire du site, ou avec une autre adresse.</Vide>
      ) : (
        <ol className={s.demandes}>
          {demandes.map((r) => {
            const e = ETAPE_DEMANDE[r.dossier_id ? "dossier" : (ETAPE_STATUT[r.status] ?? "nouvelle")];
            return (
              <li key={r.id}>
                <Link href={`/dashboard/${r.id}`} className={s.demande} prefetch={false}>
                  <span className={s.demandeTexte}>
                    <b>
                      {r.depart_ville || "?"} <span aria-hidden>→</span> {r.arrivee_ville || "?"}
                    </b>
                    <small>
                      {[
                        `Reçue le ${jour(r.created_at)}`,
                        r.date_souhaitee ? `souhaitée le ${jourUtc(r.date_souhaitee)}` : null,
                        r.volume ? `${String(r.volume).replace(".", ",")} m³` : null,
                        r.client_nom && r.client_nom !== "" ? r.client_nom : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                  <Pastille label={e.label} teinte={e.teinte} titre={e.aide} />
                  <span className={s.demandeMontant}>{r.estimation ? euros(r.estimation) : ""}</span>
                  <span className={s.demandeDossier}>{r.dossier_ref ?? ""}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
