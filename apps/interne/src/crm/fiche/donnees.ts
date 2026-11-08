import "server-only";
import { q, type Row } from "@/crm/lib/db";
import { lienFichier } from "@/lib/espace-client/fichiers";
import { lireParametres } from "@/crm/devis/donnees";
import { effectifs } from "@/crm/devis/parametres";

/*
 * Ce que la fiche du dossier lit en plus de getDossier (lib/data.ts) : les
 * rendez-vous avec leur cycle, les devis datés, les contacts, les services,
 * les contrats de garde-meuble et leurs factures, l'historique complet, et,
 * en lecture seule, ce que la plateforme tient hors du schéma `crm` — le
 * journal des e-mails et SMS (public.envois) et les documents de l'espace
 * client (public.ec_documents).
 *
 * Les lectures hors `crm` ne font jamais tomber la fiche : une table absente
 * ou une base lente rendent une liste vide.
 */

/** Le lien signé d'un document de l'espace client, par la porte de l'équipe (cinq minutes). */
const PORTE_FICHIERS = "/api/data/espace-client/fichier";

export async function ficheDossier(d: Row) {
  const id = d.id as number;
  const [rdvs, visitesSansRdv, devis, contacts, services, gm, activite, espace, parametresDevis] = await Promise.all([
    q(
      `select r.id, r.type, r.titre, r.lieu, r.notes, r.debut, r.duree_min, r.termine, r.devis_etabli, r.sans_suite, r.journee,
              r.commercial_id, u.nom as commercial, u.initiales,
              (select x.id from visites x where x.rendez_vous_id = r.id order by (x.statut = 'signee') desc, x.commencee_le desc limit 1) as visite_id,
              (select x.statut from visites x where x.rendez_vous_id = r.id order by (x.statut = 'signee') desc, x.commencee_le desc limit 1) as visite_statut,
              (select x.document_chemin is not null from visites x where x.rendez_vous_id = r.id and x.statut = 'signee' order by x.signe_le desc limit 1) as visite_document
         from rendez_vous r join utilisateurs u on u.id = r.commercial_id
        where r.dossier_id = $1 order by r.debut`,
      [id],
    ),
    q(
      `select v.id, v.statut, v.commencee_le, v.signe_le, v.signataire, v.document_chemin is not null as document, u.nom as commercial
         from visites v left join utilisateurs u on u.id = v.commercial_id
        where v.dossier_id = $1 and v.rendez_vous_id is null order by v.commencee_le`,
      [id],
    ),
    q("select id, cree_le, arrhes_pct::float8 as arrhes_pct from devis where dossier_id = $1", [id]),
    q(
      "select id, civilite, prenom, nom, fonction, telephone, email, notes, cree_le from contacts where client_id = $1 order by cree_le, id",
      [d.client_id],
    ),
    q(
      "select id, libelle, date_prevue, montant::float8 as montant, statut, notes, cree_le from services where dossier_id = $1 order by coalesce(date_prevue, cree_le::date), id",
      [id],
    ),
    q(
      `select id, client, nb_caisses, numeros, loyer_mensuel::float8 as loyer, periodicite, debut, derniere_facture, assurance, actif
         from garde_meuble where dossier_id = $1 order by debut, id`,
      [id],
    ),
    q(
      `select a.id, a.libelle, a.cree_le, u.initiales, u.nom from activite a left join utilisateurs u on u.id = a.utilisateur_id
        where a.dossier_id = $1 order by a.cree_le desc, a.id desc limit 200`,
      [id],
    ),
    q<{ id: string; reference: string }>("select id::text, reference from public.ec_dossiers where crm_dossier_id = $1 limit 1", [id]).catch(() => []),
    lireParametres(),
  ]);
  const ec = espace[0] ?? null;

  // Les factures de garde-meuble de ces contrats, rattachées ou non au dossier.
  const facturesGm = gm.length
    ? await q(
        "select id, numero, objet, montant::float8 as montant, statut, emise_le, payee_le, garde_meuble_id, dossier_id from factures where garde_meuble_id = any($1::int[]) order by emise_le, id",
        [gm.map((g) => g.id)],
      )
    : [];
  const idsGmFactures = new Set((await q<{ id: number }>("select id from factures where dossier_id = $1 and garde_meuble_id is not null", [id])).map((f) => f.id));

  // Le journal des envois de la plateforme : la référence du dossier (CRM) et celle de son espace client.
  const references = [d.ref, ec?.reference].filter(Boolean);
  const envois = await q(
    `select id::text, canal, origine, modele, destinataire, sujet, apercu, statut, motif, cree_le, traite_le
       from public.envois where reference = any($1::text[]) order by cree_le desc limit 200`,
    [references],
  ).catch(() => [] as Row[]);

  // Les documents déposés dans l'espace client (pièces du client, documents de l'équipe).
  const documents: Row[] = ec
    ? await q(
        `select doc.id::text, doc.categorie, doc.libelle, doc.source, doc.nom_fichier, doc.taille_octets::float8 as taille, doc.mime, doc.created_at,
                req.libelle as piece
           from public.ec_documents doc left join public.ec_document_requirements req on req.id = doc.requirement_id
          where doc.dossier_id = $1::uuid order by doc.created_at desc`,
        [ec.id],
      )
        .then((l) => l.map((x) => ({ ...x, lien: lienFichier("doc", x.id, { porte: PORTE_FICHIERS }) })))
        .catch(() => [] as Row[])
    : [];

  const creeLe = new Map(devis.map((v) => [v.id as number, v.cree_le as Date]));
  // Le pourcentage d'arrhes de chaque devis, sinon celui des Paramètres du devis : le même que l'éditeur et la facturation.
  const arrhesDefaut = effectifs(parametresDevis).arrhesPct;
  const arrhesPct = new Map(devis.map((v) => [v.id as number, Number(v.arrhes_pct ?? arrhesDefaut)]));
  return { rdvs, visitesSansRdv, devisCreeLe: creeLe, arrhesPct, arrhesDefaut, contacts, services, gm, facturesGm, idsGmFactures, activite, espace: ec, envois, documents };
}

export type FicheDonnees = Awaited<ReturnType<typeof ficheDossier>>;
