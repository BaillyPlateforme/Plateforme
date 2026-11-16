import "server-only";
import { q } from "@/crm/lib/db";
import { adresseFictive } from "@/lib/espace-client/config";
import { heureParis, instantParis, jourParis, jourVisite, lendemain } from "@/lib/visite/regles";

/*
 * Les rappels de la veille des visites techniques (cahier des charges, §3.2 :
 * « il reçoit un SMS et un e-mail de confirmation la veille »).
 *
 * Ce module n'envoie RIEN. `rappelsVisitesDuLendemain` lit le planning et
 * rend les messages à envoyer pour les visites du lendemain ; la tâche
 * planifiée de la veille les envoie (Brevo) et se sert de `cle` pour ne
 * jamais envoyer deux fois le même. La fiche du dossier et le planning s'en
 * servent aussi pour dire, sur le rendez-vous, que le rappel est prévu.
 *
 * Une visite, pour le rappel : un rendez-vous « visite physique » du
 * planning commercial, rattaché à un dossier encore ouvert (ni perdu, ni
 * terminé), pas marqué terminé, et dont le compte-rendu n'est pas déjà
 * signé. Les visios n'ont pas de rappel : les modèles disent « passera chez
 * vous ».
 *
 * Les textes sont ceux des modèles « Rappel de visite (veille) » de « Courriers
 * et SMS » (crm.modeles_messages), un par canal. Un modèle absent : pas de
 * message sur ce canal. Repères remplacés : {client}, {commercial}, {date},
 * {heure}, {adresse}, {ref}.
 */

export interface RappelVisite {
  canal: "sms" | "email";
  destinataire: string;
  objet?: string;
  texte: string;
  dossierId: number;
  rendezVousId: number;
  /** Unique par visite (rendez-vous et heure) et par canal : la tâche n'envoie jamais deux fois la même. */
  cle: string;
}

export const NOM_MODELE_RAPPEL = "Rappel de visite (veille)";

type Ligne = {
  id: number;
  dossier_id: number;
  debut: Date;
  ref: string;
  commercial: string;
  civilite: string | null;
  prenom: string | null;
  nom: string;
  societe: string | null;
  email: string | null;
  telephone: string | null;
  notes: string | null;
  adresse: string | null;
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Un numéro de téléphone qu'un SMS peut joindre : au moins neuf chiffres. */
const telephoneValide = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").length >= 9;

/** Les domaines réservés aux exemples et aux essais (RFC 2606) : « c.bernier@safran.example ». */
const DOMAINE_RESERVE = /@([\w-]+\.)*(example|test|invalid|localhost)$/i;

/**
 * Un client fictif : adresse du jeu de démonstration (@example.com, domaine
 * réservé comme .example ou .test) ou fiche marquée par le script de
 * démonstration. Ses numéros ressemblent à de vrais numéros : il ne doit
 * jamais rien recevoir, même par erreur.
 */
export const clientFictif = (c: { email: string | null; notes: string | null }) =>
  (!!c.email && (adresseFictive(c.email) || DOMAINE_RESERVE.test(c.email.trim()))) || /^client fictif/i.test(c.notes ?? "");

/** Comment on s'adresse au client : « Madame Marchal », sinon « Inès Marchal », sinon la société. */
function appellation(c: Pick<Ligne, "civilite" | "prenom" | "nom" | "societe">) {
  if (c.civilite === "Madame" || c.civilite === "Monsieur") return `${c.civilite} ${c.nom}`.trim();
  return [c.prenom, c.nom].filter(Boolean).join(" ").trim() || c.societe || "";
}

/** Les canaux de rappel d'un client : SMS s'il a un téléphone, e-mail s'il a une adresse valable. */
export function canauxDeRappel(c: { email: string | null; telephone: string | null }) {
  return { sms: telephoneValide(c.telephone), email: EMAIL.test((c.email ?? "").trim()) };
}

// Object.hasOwn : « {constructor} » dans un modèle ne doit pas rendre la fonction d'Object.
const remplir = (modele: string, v: Record<string, string>) => modele.replace(/\{(\w+)\}/g, (tout, k: string) => (Object.hasOwn(v, k) ? v[k] : tout));

/**
 * Les messages à envoyer, `jour` étant la veille : les visites du lendemain
 * de `jour` (jour calendaire à Paris), dans l'ordre du planning.
 *
 * Les clients fictifs sont écartés, sauf `{ inclureFictifs: true }` : pour
 * l'aperçu dans le CRM et les essais, jamais pour l'envoi.
 */
export async function rappelsVisitesDuLendemain(jour: Date, options: { inclureFictifs?: boolean } = {}): Promise<RappelVisite[]> {
  const demain = lendemain(jourParis(jour));
  const de = instantParis(demain, "00:00");
  const a = instantParis(lendemain(demain), "00:00");

  const [lignes, modeles] = await Promise.all([
    q<Ligne>(
      `select r.id, r.dossier_id, r.debut, d.ref, u.nom as commercial,
              c.civilite, c.prenom, c.nom, c.societe, c.email, c.telephone, c.notes,
              (select e.adresse from etapes_trajet e where e.dossier_id = d.id and e.genre = 'depart' and btrim(coalesce(e.adresse, '')) <> ''
                order by e.ordre, e.id limit 1) as adresse
         from rendez_vous r
         join dossiers d on d.id = r.dossier_id
         join clients c on c.id = d.client_id
         join utilisateurs u on u.id = r.commercial_id
        where r.type = 'phys' and not r.termine and r.debut >= $1 and r.debut < $2
          and d.statut not in ('perdu', 'termine')
          and not exists (select 1 from visites v where v.rendez_vous_id = r.id and v.statut = 'signee')
        order by r.debut, r.id`,
      [de.toISOString(), a.toISOString()],
    ),
    q<{ canal: "sms" | "email"; objet: string | null; corps: string }>(
      "select canal, objet, corps from modeles_messages where nom = $1 order by id",
      [NOM_MODELE_RAPPEL],
    ),
  ]);
  const sms = modeles.find((m) => m.canal === "sms");
  const email = modeles.find((m) => m.canal === "email");

  const out: RappelVisite[] = [];
  for (const l of lignes) {
    if (!options.inclureFictifs && clientFictif(l)) continue;
    const debut = new Date(l.debut);
    const valeurs = {
      client: appellation(l),
      commercial: l.commercial,
      date: jourVisite(debut),
      heure: heureParis(debut),
      adresse: l.adresse ?? "",
      ref: l.ref,
    };
    const base = { dossierId: l.dossier_id, rendezVousId: l.id };
    const cle = (canal: string) => `visite-veille:${l.id}:${debut.toISOString()}:${canal}`;
    const canaux = canauxDeRappel(l);
    if (sms && canaux.sms) {
      out.push({ canal: "sms", destinataire: l.telephone!.trim(), texte: remplir(sms.corps, valeurs), ...base, cle: cle("sms") });
    }
    if (email && canaux.email) {
      out.push({
        canal: "email",
        destinataire: l.email!.trim().toLowerCase(),
        objet: remplir(email.objet ?? "Votre visite technique de demain", valeurs),
        texte: remplir(email.corps, valeurs),
        ...base,
        cle: cle("email"),
      });
    }
  }
  return out;
}

/**
 * Ce que le CRM affiche sur un rendez-vous : le rappel de la veille est-il
 * prévu, et sur quels canaux ? `null` quand il n'y a pas lieu (pas une
 * visite physique rattachée à un dossier, visite passée ou du jour même).
 */
export function rappelPrevu(
  r: { type: string; dossier_id: number | null; debut: Date | string; termine: boolean },
  client: { email: string | null; telephone: string | null; notes?: string | null },
  maintenant = new Date(),
): { canaux: ("sms" | "email")[]; veille: string; fictif: boolean } | null {
  if (r.type !== "phys" || !r.dossier_id || r.termine) return null;
  const jourVisiteParis = jourParis(r.debut);
  // La veille doit être aujourd'hui ou plus tard : une visite du jour même n'a plus de rappel à recevoir.
  if (jourVisiteParis <= jourParis(maintenant)) return null;
  const c = canauxDeRappel(client);
  return {
    canaux: [...(c.sms ? (["sms"] as const) : []), ...(c.email ? (["email"] as const) : [])],
    veille: lendemain(jourVisiteParis, -1),
    fictif: clientFictif({ email: client.email, notes: client.notes ?? null }),
  };
}
