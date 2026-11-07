import type { Db } from "@/crm/lib/db";
import { CAPACITES_INDICATIVES } from "./outils";

/*
 * Le plan de démonstration du dispatch : un groupage fictif au départ du
 * Havre vers les Antilles, la Guyane, la Réunion et le Canada — 22 clients,
 * cinq conteneurs déjà ouverts, dont un validé. Tout y est inventé (noms,
 * volumes, remarques), sauf le rattachement d'un client au dossier de
 * démonstration de Yann Morel s'il existe dans le CRM.
 *
 * Il est créé à la demande, depuis la liste des plans (ou par le jeu de
 * démonstration d'une base neuve), et peut être remis à zéro.
 */

type Client = [client: string, ville: string, pays: string, volume: number, remarques: string | null, telephone: string | null];

const CLIENTS: Client[] = [
  ["Cne Yann Morel", "Fort-de-France", "Martinique", 24, "Mutation militaire : livraison souhaitée avant le 15 décembre", "06 12 40 18 21"],
  ["Famille Désiré", "Le Lamentin", "Martinique", 21, "Piano droit à caler et sangler", "06 22 51 07 64"],
  ["Mme Nadia Pélage", "Schœlcher", "Martinique", 9, "3e étage sans ascenseur, digicode 4512B", "06 31 18 42 90"],
  ["M. et Mme Rosier", "Le Robert", "Martinique", 26, "Véhicule expédié à part, hors conteneur", "06 45 09 33 17"],
  ["Dr Thomas Lebrun", "Fort-de-France", "Martinique", 17, "Matériel médical fragile : à charger en dernier", "06 58 27 64 02"],
  ["Mme Élodie Clairac", "Le François", "Martinique", 6.5, "Cartons uniquement", null],
  ["Mme Aurore Bellance", "Fort-de-France", "Martinique", 4, "Cartons et un vélo", "06 63 90 15 48"],
  ["Lt Sarah Vidal", "Les Abymes", "Guadeloupe", 15, "Mutation militaire", "06 14 72 38 05"],
  ["Famille Jean-Baptiste", "Baie-Mahault", "Guadeloupe", 29, "Livraison en deux temps : une partie en garde-meuble à l'arrivée", "06 27 83 41 66"],
  ["M. Olivier Saint-Ange", "Le Gosier", "Guadeloupe", 11, null, "06 39 50 24 81"],
  ["Mme Patricia Darius", "Pointe-à-Pitre", "Guadeloupe", 7, "5e étage avec ascenseur", "06 41 66 92 30"],
  ["Sgt Maxime Hoarau", "Basse-Terre", "Guadeloupe", 14, "Mutation militaire, logement de fonction", "06 52 18 07 73"],
  ["Mme Inès Cabrera", "Sainte-Anne", "Guadeloupe", 5.5, null, null],
  ["Famille Payet", "Saint-Denis", "La Réunion", 22, null, "06 18 44 70 26"],
  ["M. Bruno Técher", "Saint-Pierre", "La Réunion", 16, "Rue étroite : prévoir un petit porteur", "06 29 61 85 13"],
  ["Mme Claire Fontaine", "Saint-Paul", "La Réunion", 8, null, "06 37 02 59 48"],
  ["Cdt Antoine Grondin", "Saint-Denis", "La Réunion", 19, "Mutation militaire", "06 46 85 21 97"],
  ["M. Fabrice Lony", "Cayenne", "Guyane", 13, null, "06 54 30 76 12"],
  ["Mme Sandrine Ho-A-Chuck", "Kourou", "Guyane", 9.5, "Résidence fermée : prévenir 48 h avant la livraison", "06 65 47 13 89"],
  ["M. et Mme Gagnon", "Montréal", "Canada", 26, "Inventaire détaillé et valorisé à joindre pour la douane", "+1 514 555 0142"],
  ["Mme Léa Morin", "Québec", "Canada", 10, null, "+1 418 555 0177"],
  ["M. Hugo Lemaire", "Montréal", "Canada", 7.5, "Arrivée du client prévue après le conteneur", "+1 514 555 0193"],
];

const COLONNES: [libelle: string, taille: "20" | "40", zone: string, joursDepart: number][] = [
  ["Martinique 1 · 40 pieds", "40", "Martinique", 17],
  ["Martinique 2 · 40 pieds", "40", "Martinique", 17],
  ["Guadeloupe · 40 pieds", "40", "Guadeloupe", 17],
  ["La Réunion · 40 pieds", "40", "La Réunion", 24],
  ["Guyane · 20 pieds", "20", "Guyane", 17],
];

/** Crée le plan de démonstration et rend son identifiant. À appeler dans une transaction. */
export async function semerDemo(db: Db, utilisateurId: number | null): Promise<number> {
  const ins = async (sql: string, p: unknown[]) => (await db.query<{ id: number }>(`${sql} returning id`, p))[0].id;
  const histo = (action: string, libelle: string, il: string, ligne: number | null = null, colonne: number | null = null) =>
    db.query(
      `insert into dispatch_historique(plan_id, ligne_id, colonne_id, action, libelle, utilisateur_id, cree_le) values($1,$2,$3,$4,$5,$6, now() - $7::interval)`,
      [planId, ligne, colonne, action, libelle, utilisateurId, il],
    );

  const planId = await ins(
    `insert into dispatch_plans(nom, sens, port, date_reference, notes, capacite_20, capacite_40, demo, cree_par, cree_le, maj_le)
     values($1, 'export', 'Le Havre', current_date + 17, $2, $3, $4, true, $5, now() - interval '3 days', now())`,
    [
      "Groupage outre-mer et Canada · décembre",
      "Plan de démonstration : données fictives. Départ groupé du Havre ; la Réunion part une semaine plus tard.",
      CAPACITES_INDICATIVES["20"],
      CAPACITES_INDICATIVES["40"],
      utilisateurId,
    ],
  );
  const importId = await ins(
    `insert into dispatch_imports(plan_id, source, fichier, nb_lignes, correspondance, importe_par, importe_le) values($1, 'demo', $2, $3, $4, $5, now() - interval '3 days')`,
    [planId, "groupage-decembre.xlsx", CLIENTS.length, JSON.stringify({ client: "Client", ville: "Ville", pays: "Pays", volume: "Volume (m³)", remarques: "Remarques" }), utilisateurId],
  );
  await histo("plan", "Plan créé : « Groupage outre-mer et Canada · décembre »", "3 days 2 hours");
  await histo("import", `${CLIENTS.length} clients importés depuis « groupage-decembre.xlsx » (Excel)`, "3 days 1 hour");

  const morel = (await db.query<{ id: number }>("select d.id from dossiers d join clients c on c.id = d.client_id where c.prenom = 'Yann' and c.nom = 'Morel' order by d.id limit 1"))[0]?.id ?? null;
  const lignes: number[] = [];
  for (const [i, [client, ville, pays, volume, remarques, telephone]] of CLIENTS.entries()) {
    lignes.push(
      await ins(
        `insert into dispatch_lignes(plan_id, import_id, client, ville, pays, volume, remarques, telephone, dossier_id, rang) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [planId, importId, client, ville, pays, volume, remarques, telephone, i === 0 ? morel : null, i + 1],
      ),
    );
  }

  const colonnes: number[] = [];
  for (const [i, [libelle, taille, zone, j]] of COLONNES.entries()) {
    colonnes.push(
      await ins(
        `insert into dispatch_colonnes(plan_id, genre, libelle, taille, capacite, zone, jour, ordre, cree_le) values($1, 'conteneur', $2, $3, $4, $5, current_date + $6::int, $7, now() - interval '2 days')`,
        [planId, libelle, taille, CAPACITES_INDICATIVES[taille], zone, j, i + 1],
      ),
    );
    await histo("colonne", `Colonne ajoutée : « ${libelle} »`, `2 days ${5 - i} minutes`, null, colonnes[i]);
  }

  // La Réunion est déjà constituée et validée : ses quatre clients, verrouillés.
  const reunion = colonnes[3];
  for (const [rang, i] of [13, 16, 15, 14].entries()) {
    await db.query("update dispatch_lignes set colonne_id = $1, rang = $2 where id = $3", [reunion, rang + 1, lignes[i]]);
    await histo("deplacement", `« ${CLIENTS[i][0]} » : À répartir → « La Réunion · 40 pieds »`, `1 day ${4 - rang} hours`, lignes[i], reunion);
  }
  await db.query("update dispatch_colonnes set verrouillee_le = now() - interval '20 hours', verrouillee_par = $2 where id = $1", [reunion, utilisateurId]);
  await histo("verrouillage", "« La Réunion · 40 pieds » validée et verrouillée : 4 clients, 65 m³", "20 hours", null, reunion);

  // Deux clients de Martinique déjà placés à la main.
  for (const [rang, i] of [0, 4].entries()) {
    await db.query("update dispatch_lignes set colonne_id = $1, rang = $2 where id = $3", [colonnes[0], rang + 1, lignes[i]]);
    await histo("deplacement", `« ${CLIENTS[i][0]} » : À répartir → « Martinique 1 · 40 pieds »`, `${3 - rang} hours`, lignes[i], colonnes[0]);
  }
  return planId;
}
