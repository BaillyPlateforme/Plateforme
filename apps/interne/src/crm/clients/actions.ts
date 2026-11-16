"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, q1 } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { journaliser } from "@/crm/lib/journal";
import { projeterEspace } from "@/crm/lib/espace";
import { TYPES } from "@/crm/lib/format";
import { entrepriseValide } from "./entreprises";

/*
 * Les gestes de la fiche d'un client (/clients/<id>) : son identité, sa
 * facturation et ses autres contacts. Les mêmes règles que la fenêtre
 * « Fiche » d'un dossier (src/crm/fiche/actions.ts, majIdentite) :
 *
 * - le nom est obligatoire ;
 * - l'e-mail ne change pas ici quand un de ses dossiers a un espace client :
 *   c'est son identifiant de connexion, qui se modifie depuis la fiche de
 *   l'espace ;
 * - le type de client fixe le parcours de son espace client (segment).
 *
 * Après l'enregistrement, chaque dossier qui a un espace le reprojette (le
 * client y retrouve son nom et son téléphone), et le geste entre au journal,
 * rattaché à son dernier dossier : il paraît dans l'historique du client et
 * dans le Feed. Chaque action revérifie la session.
 */

const s = (f: FormData, k: string, max = 400) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v.slice(0, max);
};

const CHAMPS: [cle: string, libelle: string, max?: number][] = [
  ["civilite", "civilité"],
  ["prenom", "prénom"],
  ["nom", "nom"],
  ["societe", "société"],
  ["type", "type"],
  ["telephone", "téléphone"],
  ["telephone2", "autre téléphone"],
  ["email", "e-mail"],
  ["notes", "notes", 4000],
  ["facturation_adresse", "adresse de facturation"],
  ["facturation_cp", "code postal"],
  ["facturation_ville", "ville"],
  ["facturation_pays", "pays"],
  ["siren", "SIREN"],
  ["tva_intracom", "TVA intracommunautaire"],
  // L'entreprise (espace pro) : ses dossiers paraissent dans l'espace RH de celle-ci. Vérifiée plus bas.
  ["espace_pro_id", "entreprise (espace pro)"],
];

async function espacesDu(clientId: number): Promise<number[]> {
  const r = await q<{ id: number }>("select distinct d.id from dossiers d join public.ec_dossiers x on x.crm_dossier_id = d.id where d.client_id = $1", [clientId]).catch(() => []);
  return r.map((x) => x.id);
}

async function dernierDossier(clientId: number): Promise<number | null> {
  return (await q1<{ id: number }>("select id from dossiers where client_id = $1 order by cree_le desc, id desc limit 1", [clientId]))?.id ?? null;
}

const rafraichir = (id: number) => {
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
};

/** Enregistre l'identité, les coordonnées, la facturation et les notes d'un client. */
export async function majClient(id: number, f: FormData) {
  await currentUser();
  const avant = await q1("select * from clients where id = $1", [id]);
  if (!avant) redirect("/clients");
  const nom = s(f, "nom");
  if (!nom) redirect(`/clients/${id}?modifier=1&erreur=nom#identite`);

  const espaces = await espacesDu(id);
  const valeurs: Record<string, string | null> = {};
  for (const [cle, , max] of CHAMPS) valeurs[cle] = s(f, cle, max);
  // L'identifiant de l'espace client ne se change pas d'ici ; un type inconnu non plus.
  if (espaces.length) valeurs.email = avant.email ?? null;
  if (!valeurs.type || !Object.hasOwn(TYPES, valeurs.type)) valeurs.type = avant.type;
  // Le rattachement à une entreprise : seulement un espace pro qui existe (pas l'espace standard). Champ absent
  // du formulaire (liste des espaces illisible) ou valeur inconnue : le rattachement reste tel quel.
  const entreprise = f.has("espace_pro_id") ? await entrepriseValide(f.get("espace_pro_id")) : undefined;
  valeurs.espace_pro_id = entreprise === undefined ? (avant.espace_pro_id ?? null) : entreprise;

  const changes = CHAMPS.filter(([cle]) => (avant[cle] ?? null) !== (valeurs[cle] ?? null));
  if (changes.length) {
    const cles = changes.map(([cle]) => cle);
    await q(`update clients set ${cles.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1`, [id, ...cles.map((c) => valeurs[c])]);
    for (const d of espaces) await projeterEspace(d);
    const nomAffiche = valeurs.societe || [valeurs.prenom, valeurs.nom].filter(Boolean).join(" ");
    await journaliser({
      action: "client.modifie",
      libelle: `Fiche client mise à jour (${changes.map(([, l]) => l).join(", ")}) · ${nomAffiche}`,
      objet: { type: "client", id },
      dossierId: await dernierDossier(id),
      details: { champs: changes.map(([, l]) => l) },
    });
  }
  rafraichir(id);
  redirect(`/clients/${id}?enregistre=${changes.length ? "1" : "0"}#identite`);
}

/**
 * « Dupliquer la fiche » : une nouvelle fiche client qui reprend ce qui tient
 * à l'entreprise — type, société, facturation (adresse, SIREN, TVA),
 * entreprise (espace pro), notes — et laisse vide ce qui tient à la personne
 * (civilité, prénom, nom, e-mail, téléphones). L'usage : un deuxième salarié
 * ou contact de la même société. La fiche s'ouvre en modification, le nom à
 * saisir (il est obligatoire à l'enregistrement).
 */
export async function dupliquerClient(id: number) {
  await currentUser();
  const c = await q1<{ id: number; type: string; societe: string | null }>(
    `insert into clients(type, nom, societe, facturation_adresse, facturation_cp, facturation_ville, facturation_pays, siren, tva_intracom, espace_pro_id, notes)
     select type, '', societe, facturation_adresse, facturation_cp, facturation_ville, facturation_pays, siren, tva_intracom, espace_pro_id, notes
       from clients where id = $1 returning id, type, societe`,
    [id],
  );
  if (!c) redirect("/clients");
  const o = await q1<{ nom: string; prenom: string | null; societe: string | null }>("select nom, prenom, societe from clients where id = $1", [id]);
  const origine = o?.societe || [o?.prenom, o?.nom].filter(Boolean).join(" ") || `n° ${id}`;
  await journaliser({
    action: "client.duplique",
    libelle: `Fiche client dupliquée depuis ${origine} (client n° ${id}) : société et facturation reprises, identité à saisir`,
    objet: { type: "client", id: c.id },
    dossierId: await dernierDossier(id),
    details: { source: id, societe: c.societe, type: c.type },
  });
  rafraichir(id);
  redirect(`/clients/${c.id}?modifier=1&duplique=${id}#identite`);
}

/**
 * Renoncer à une fiche tout juste dupliquée : elle n'est supprimée que tant
 * qu'elle est restée vide — sans nom, sans e-mail ni téléphone, sans contact,
 * sans dossier. Sinon, rien ne bouge.
 */
export async function abandonnerClientDuplique(id: number, source: number) {
  await currentUser();
  const r = await q1<{ id: number }>(
    `delete from clients c where c.id = $1 and coalesce(btrim(c.nom), '') = '' and c.prenom is null and c.email is null and c.telephone is null and c.telephone2 is null
       and not exists (select 1 from dossiers where client_id = c.id or payeur_client_id = c.id)
       and not exists (select 1 from contacts where client_id = c.id) returning id`,
    [id],
  );
  if (r) {
    await journaliser({
      action: "client.duplication_abandonnee",
      libelle: `Fiche client dupliquée puis abandonnée, avant toute saisie (client n° ${id})`,
      objet: { type: "client", id },
      dossierId: await dernierDossier(source),
      details: { source },
    });
  }
  revalidatePath("/clients");
  redirect(r ? `/clients/${source}#identite` : `/clients/${id}#identite`);
}

/** Ajoute un contact au client (conjoint, assistante, service des achats…). */
export async function ajouterContactClient(clientId: number, f: FormData) {
  await currentUser();
  const nom = s(f, "nom");
  if (!nom) redirect(`/clients/${clientId}?contact=1#identite`);
  const c = await q1<{ id: number }>(
    "insert into contacts(client_id, civilite, prenom, nom, fonction, telephone, email, notes) select id, $2, $3, $4, $5, $6, $7, $8 from clients where id = $1 returning id",
    [clientId, s(f, "civilite"), s(f, "prenom"), nom, s(f, "fonction"), s(f, "telephone"), s(f, "email"), s(f, "notes", 2000)],
  );
  if (c) {
    const libelle = `Contact ajouté : ${[s(f, "prenom"), nom].filter(Boolean).join(" ")}`;
    await journaliser({
      action: "contact.ajoute",
      libelle,
      objet: { type: "contact", id: c.id },
      dossierId: await dernierDossier(clientId),
      details: { fonction: s(f, "fonction") },
    });
  }
  rafraichir(clientId);
  redirect(`/clients/${clientId}#identite`);
}

/** Retire un contact du client. */
export async function supprimerContactClient(clientId: number, contactId: number) {
  await currentUser();
  const c = await q1<{ nom: string; fonction: string | null }>(
    "delete from contacts where id = $1 and client_id = $2 returning coalesce(prenom || ' ', '') || nom as nom, fonction",
    [contactId, clientId],
  );
  if (c) {
    await journaliser({
      action: "contact.supprime",
      libelle: `Contact supprimé : ${c.nom}`,
      objet: { type: "contact", id: contactId },
      dossierId: await dernierDossier(clientId),
      details: { nom: c.nom, fonction: c.fonction },
    });
  }
  rafraichir(clientId);
}
