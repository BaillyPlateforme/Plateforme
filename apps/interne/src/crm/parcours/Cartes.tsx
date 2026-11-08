import Link from "next/link";
import { Icone, type NomIcone } from "@/ui/icones";
import { eur, m3, TYPES } from "@/crm/lib/format";
import type { Row } from "@/crm/lib/db";
import type { Parcours } from "./donnees";
import { jourFr, type Etape } from "./etapes";
import s from "./parcours.module.css";

/*
 * La colonne de droite du parcours : les étapes une à une, puis les
 * caractéristiques du dossier — client et contacts, trajet et accès,
 * commercial et « traité par », argent, documents. Lecture seule : chaque
 * carte mène à l'écran où l'on agit.
 */

type P = NonNullable<Parcours>;

const GENRE: Record<string, string> = { depart: "Départ", garde_meuble: "Garde-meuble", arrivee: "Arrivée", autre: "Étape" };
const TYPE_D: Record<string, string> = { national: "National", international: "International", maritime: "Maritime", aerien: "Aérien", gm: "Garde-meuble", bureau: "Bureau" };
const ETAT: Record<Etape["etat"], string> = { fait: "Fait", encours: "En cours", avenir: "À venir", manque: "Non enregistré", sansobjet: "Sans objet" };
const initiales = (nom: string | null) => (nom ?? "").split(/\s+/).filter(Boolean).map((m) => m[0]).slice(0, 2).join("").toUpperCase() || "—";
const quand = (iso: string, jour: boolean) =>
  jour ? jourFr(iso) : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(iso));
const etage = (e: unknown) => {
  const t = String(e ?? "").trim();
  return !t ? null : /^(rdc|0|rez)/i.test(t) ? "Rez-de-chaussée" : `Étage ${t}`;
};

/** Étage, ascenseur, accès : ce qui est renseigné. L'ascenseur n'est dit absent qu'au-dessus du rez-de-chaussée. */
const acces = (e: Row) => {
  const niveau = etage(e.etage);
  const haut = niveau && niveau !== "Rez-de-chaussée";
  return [niveau, e.ascenseur ? "ascenseur" : haut ? "sans ascenseur" : null, e.acces].filter(Boolean).join(" · ");
};

function Tete({ titre, icone, lien }: { titre: string; icone: NomIcone; lien?: { href: string; label: string } }) {
  return (
    <header className={s.carteTete}>
      <h2>
        <span className={s.carteIcone}>
          <Icone nom={icone} taille={16} />
        </span>
        {titre}
      </h2>
      {lien && (
        <Link href={lien.href} className={s.carteLien}>
          {lien.label}
          <Icone nom="fleche" taille={13} />
        </Link>
      )}
    </header>
  );
}

/** Les treize étapes, une à une : l'état, la date, ce qu'on en sait. */
export function CarteEtapes({ etapes }: { etapes: Etape[] }) {
  const faites = etapes.filter((e) => e.etat === "fait").length;
  return (
    <section className={s.carte} aria-label="Les étapes du dossier">
      <Tete titre="Les étapes, de A à Z" icone="parcours" />
      <div className={s.jauge} aria-hidden>
        {etapes.map((e) => (
          <i key={e.cle} data-etat={e.etat} />
        ))}
      </div>
      <p className={s.jaugeTexte}>
        <b>{faites}</b> étape{faites > 1 ? "s" : ""} faite{faites > 1 ? "s" : ""} sur {etapes.length}
      </p>
      <ol className={s.echelle}>
        {etapes.map((e, i) => (
          <li key={e.cle} data-etat={e.etat}>
            <span className={s.puce} aria-hidden>
              {e.etat === "fait" ? <Icone nom="coche" taille={12} /> : e.etat === "manque" ? "!" : e.etat === "sansobjet" ? "–" : i + 1}
            </span>
            <span className={s.echelleTexte}>
              <b>{e.label}</b>
              <small>{e.detail || ETAT[e.etat]}</small>
            </span>
            <span className={s.echelleDate}>{e.date ? quand(e.date, e.jour) : e.etat === "encours" ? "En cours" : ""}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CarteClient({ p }: { p: P }) {
  const d = p.d as Row;
  const contact = [d.civilite, d.prenom, d.nom].filter(Boolean).join(" ");
  return (
    <section className={s.carte} aria-label="Client et contacts">
      <Tete titre="Client et contacts" icone="clients" lien={{ href: `/dossiers/${d.id}`, label: "Fiche" }} />
      <div className={s.identite}>
        <span className={s.grandAvatar}>{initiales(d.societe || [d.prenom, d.nom].filter(Boolean).join(" "))}</span>
        <div>
          <b>{d.societe || [d.prenom, d.nom].filter(Boolean).join(" ") || "Sans nom"}</b>
          <small>
            {TYPES[d.type] ?? d.type}
            {d.societe && contact ? ` · ${contact}` : ""}
          </small>
        </div>
      </div>
      <dl className={s.lignes}>
        <dt>Téléphone</dt>
        <dd>{d.telephone ? <a href={`tel:${String(d.telephone).replace(/\s+/g, "")}`}>{d.telephone}</a> : <span className={s.manque}>Non renseigné</span>}</dd>
        <dt>E-mail</dt>
        <dd>{d.email ? <a href={`mailto:${d.email}`}>{d.email}</a> : <span className={s.manque}>Non renseigné</span>}</dd>
        <dt>Client depuis</dt>
        <dd>{quand(new Date(d.client_le).toISOString(), false)}</dd>
        <dt>Demande du site</dt>
        <dd>
          {p.demande ? (
            <Link href={`/dashboard/${p.demande.id}`}>
              {p.demande.source === "email" ? "E-mail" : "Formulaire"} du {quand(p.demande.le, false)} · {p.demande.statut}
            </Link>
          ) : (
            <span className={s.manque}>Saisi au CRM</span>
          )}
        </dd>
        <dt>Espace client</dt>
        <dd>
          {p.espace ? (
            <Link href={`/dashboard/espace-client/dossiers/${p.espace.id}`} title={`Espace ${p.espace.reference}`}>
              Ouvert
              {p.espace.derniereConnexion
                ? ` · vu le ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date(p.espace.derniereConnexion))}`
                : " · jamais consulté"}
            </Link>
          ) : (
            <span className={s.manque}>Pas encore ouvert</span>
          )}
        </dd>
      </dl>
    </section>
  );
}

export function CarteTrajet({ p }: { p: P }) {
  const d = p.d as Row;
  const date = d.date_chargement
    ? `Chargement le ${jourFr(new Date(d.date_chargement).toISOString(), { day: "numeric", month: "long", year: "numeric" })}${
        d.date_livraison && +new Date(d.date_livraison) !== +new Date(d.date_chargement) ? ` · livraison le ${jourFr(new Date(d.date_livraison).toISOString(), { day: "numeric", month: "long" })}` : ""
      }`
    : d.periode
      ? `Période souhaitée : ${d.periode}`
      : "Date à fixer";
  return (
    <section className={s.carte} aria-label="Trajet et accès">
      <Tete titre="Trajet et accès" icone="camion" />
      <ol className={s.route}>
        {p.stops.map((e: Row) => (
          <li key={e.id} data-genre={e.genre}>
            <i aria-hidden />
            <div>
              <small>{GENRE[e.genre] ?? "Étape"}</small>
              <b>{e.adresse || "Adresse à préciser"}</b>
              <span>{acces(e) || "Accès non renseigné"}</span>
            </div>
          </li>
        ))}
        {p.stops.length === 0 && <li className={s.manque}>Aucune adresse.</li>}
      </ol>
      <div className={s.puces}>
        <span>
          <Icone nom="boite" taille={14} />
          {d.volume > 0 ? m3(d.volume) : "Volume à estimer"}
        </span>
        <span>
          <Icone nom="globe" taille={14} />
          {TYPE_D[d.type_demenagement] ?? "National"}
        </span>
        {p.distance && (
          <span>
            <Icone nom="tendance" taille={14} />
            {p.distance} km
          </span>
        )}
        {d.vehicule && (
          <span>
            <Icone nom="camion" taille={14} />
            Véhicule à transporter
          </span>
        )}
      </div>
      <p className={s.dateTrajet}>
        <Icone nom="calendrier" taille={14} />
        {date}
      </p>
    </section>
  );
}

export function CarteEquipe({ p }: { p: P }) {
  const d = p.d as Row;
  const personne = (role: string, nom: string | null, init: string | null) => (
    <div className={s.personne}>
      <span className={s.avatarMoyen} data-vide={!nom || undefined}>
        {nom ? (init ?? initiales(nom)) : "—"}
      </span>
      <div>
        <small>{role}</small>
        <b>{nom ?? "Non affecté"}</b>
      </div>
    </div>
  );
  return (
    <section className={s.carte} aria-label="Commercial et traité par">
      <Tete titre="Commercial et suivi" icone="equipe" />
      <div className={s.duo}>
        {personne("Commercial", d.commercial, d.com_init)}
        {personne("Traité par", d.traite_par, d.tr_init)}
      </div>
      {p.prochainRdv && (
        <p className={s.rdv}>
          <Icone nom="calendrier" taille={14} />
          <span>
            Prochain rendez-vous :{" "}
            <b>
              {new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(p.prochainRdv.debut))}
            </b>{" "}
            avec {p.prochainRdv.commercial}
          </span>
        </p>
      )}
    </section>
  );
}

export function CarteArgent({ p }: { p: P }) {
  const a = p.argent;
  const part = a.signe ? Math.min(100, Math.round((a.encaisse / a.signe) * 100)) : 0;
  return (
    <section className={`${s.carte} ${s.argent}`} aria-label="Argent">
      <Tete titre="Argent" icone="euro" />
      <div className={s.montantSigne}>
        <small>Montant signé</small>
        <b data-vide={a.signe == null || undefined}>{a.signe != null ? eur(a.signe) : "Pas de devis signé"}</b>
        {p.signe && (
          <span>
            {p.signe.numero} · {p.signe.formule} · TTC
          </span>
        )}
      </div>
      {a.signe != null && (
        <div className={s.barreArgent} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={part} aria-label="Part encaissée">
          <i style={{ width: `${part}%` }} />
        </div>
      )}
      <dl className={s.lignes}>
        <dt>Arrhes (30 %)</dt>
        <dd>{a.arrhesAttendues != null ? eur(a.arrhesAttendues) : "—"}</dd>
        <dt>Paiements reçus</dt>
        <dd>{eur(a.recu)}</dd>
        <dt>Facturé</dt>
        <dd>{eur(a.facture)}</dd>
        <dt>Payé</dt>
        <dd className={s.vert}>{eur(a.encaisse)}</dd>
        <dt className={s.fort}>Reste dû</dt>
        <dd className={`${s.fort} ${a.reste > 0 ? s.rose : ""}`}>{eur(a.reste)}</dd>
      </dl>
      <p className={s.note}>Payé : tous les règlements reçus. Reste dû : le plus grand du devis signé et du facturé (le facturé seul après la facture de solde), moins le payé.</p>
    </section>
  );
}

export function CarteDocuments({ p }: { p: P }) {
  return (
    <section className={s.carte} aria-label="Documents">
      <Tete titre="Documents" icone="devis" />
      <ul className={s.documents}>
        {p.documents.map((x) => (
          <li key={x.cle}>
            <Link href={x.href}>
              <span className={s.docIcone}>
                <Icone nom={x.icone} taille={16} />
              </span>
              <span className={s.docTexte}>
                <b>{x.titre}</b>
                <small>{x.meta}</small>
              </span>
              <Icone nom="fleche" taille={14} className={s.docFleche} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
