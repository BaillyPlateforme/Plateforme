import type { Db } from "./db";

/**
 * Données de démonstration, insérées une seule fois sur une base vide — dans
 * le schéma `crm` uniquement (voir db.ts). Les noms, clients et adresses sont
 * fictifs.
 */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function lundiDe(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const j = (x.getDay() + 6) % 7; x.setDate(x.getDate() - j); return x;
}
/** Semaine affichée par défaut : le week-end, on montre la semaine suivante. */
export function semaineCourante(now = new Date()) {
  const x = new Date(now); x.setDate(x.getDate() + 2); return lundiDe(x);
}

type Stop = [genre: string, adresse: string, etage?: string, ascenseur?: boolean, acces?: string];
type Dev = [formule: string, montant: number, statut: string];
interface D {
  client: [type: string, prenom: string, nom: string, societe?: string, email?: string, tel?: string];
  com: number; traite: number; statut: string; periode?: string; moisCa?: string; chargement?: string;
  volume: number; obs?: string; stops: Stop[]; devis?: Dev[]; cree?: string;
}

export async function seed(d: Db) {
  const ins = async (sql: string, p: unknown[]) => (await d.query<{ id: number }>(sql + " returning id", p))[0].id;
  const now = new Date();
  const annee = now.getFullYear();

  // Les utilisateurs sont désignés par leur rang : 1 Céline G. · 2 David M. · 3 Dragan · 4 Laure · 5 Karim · 6 Roxane.
  // Le rang est traduit en identifiant réel (`uid`) : une séquence ne revient
  // pas en arrière quand une transaction est annulée, les identifiants ne
  // commencent donc pas forcément à 1.
  const U: [string, string, string, string][] = [
    ["Céline Gibergues", "CG", "direction", "celine@baillydem.test"],
    ["David Manscour", "DM", "direction", "david@baillydem.test"],
    ["Dragan Petrović", "DP", "commercial", "dragan@baillydem.test"],
    ["Laure Mercier", "LM", "commercial", "laure@baillydem.test"],
    ["Karim Benali", "KB", "commercial", "karim@baillydem.test"],
    ["Roxane Lopes", "RL", "exploitation", "roxane@baillydem.test"],
  ];
  const ids: number[] = [];
  for (const u of U) ids.push(await ins("insert into utilisateurs(nom,initiales,role,email) values($1,$2,$3,$4)", u));
  const uid = (rang: number) => ids[rang - 1];

  let nd = 417, nv = 0, nf = 0, nl = 100;
  const refD = () => `BD-${annee}-${String(++nd).padStart(4, "0")}`;

  async function dossier(x: D) {
    const cl: unknown[] = [...x.client]; while (cl.length < 6) cl.push(null);
    const cid = await ins("insert into clients(type,prenom,nom,societe,email,telephone) values($1,$2,$3,$4,$5,$6)", cl.map((v) => v ?? null));
    const did = await ins(
      `insert into dossiers(ref,client_id,commercial_id,traite_par_id,statut,periode,mois_ca,date_chargement,volume,observations,cree_le)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [refD(), cid, uid(x.com), uid(x.traite), x.statut, x.periode ?? null, x.moisCa ?? null, x.chargement ?? null, x.volume, x.obs ?? null, x.cree ?? now.toISOString()],
    );
    let o = 0;
    for (const s of x.stops)
      await d.query("insert into etapes_trajet(dossier_id,ordre,genre,adresse,etage,ascenseur,acces) values($1,$2,$3,$4,$5,$6,$7)", [did, o++, s[0], s[1], s[2] ?? null, s[3] ?? false, s[4] ?? null]);
    for (const v of x.devis ?? []) {
      const dt = x.cree ? new Date(x.cree) : now;
      await d.query(
        "insert into devis(dossier_id,numero,formule,montant,statut,envoye_le,signe_le,cree_le) values($1,$2,$3,$4,$5,$6,$7,$8)",
        [did, `DV-${annee}-${String(++nv).padStart(4, "0")}`, v[0], v[1], v[2],
          v[2] !== "brouillon" ? dt.toISOString() : null, v[2] === "signe" ? dt.toISOString() : null, dt.toISOString()],
      );
    }
    return did;
  }

  const mois = (m: number) => `${annee}-${String(m).padStart(2, "0")}-01`;
  const cur = now.getMonth() + 1;
  const dans = (j: number) => iso(new Date(now.getTime() + j * 864e5));

  // ---- dossiers en cours (ceux de la maquette) ----
  const dupuis = await dossier({
    client: ["particulier", "Quentin", "Dupuis", undefined, "q.dupuis@example.com", "06 12 34 56 78"], com: 3, traite: 6, statut: "devis",
    periode: "Fin janvier 2027", moisCa: `${annee + 1}-01-01`, volume: 42.6,
    obs: "Cave + box, déménagement quasi total. Le client a déjà vu 2 déménageurs : passer après les autres, ne pas envoyer le devis à chaud.\nCode portail 4471B · interphone « Dupuis » · pas de stationnement avant 8h.",
    stops: [["depart", "12 rue de Passy, Paris 16e", "4e", false, "Camion 20 m maximum"], ["garde_meuble", "Garde-meuble Gennevilliers", undefined, true], ["arrivee", "8 av. Carnot, Le Vésinet", "RDC", true, "Maison, plain-pied"]],
    devis: [["premium", 4280, "brouillon"], ["standard", 3640, "envoye"], ["economique", 2890, "brouillon"]], cree: new Date(now.getTime() - 3 * 864e5).toISOString(),
  });
  const inv: [string, string, number, number, string, boolean][] = [
    ["Salon", "Canapé 3 places", 1, 1.2, "Arrivée", false], ["Salon", "Fauteuil enfant", 1, 0.2, "Arrivée", false],
    ["Salon", "Bibliothèque", 1, 1.4, "Garde-meuble", true], ["Salon", "Télévision 55\"", 1, 0.3, "Arrivée", false],
    ["Cuisine", "Réfrigérateur", 1, 0.8, "Arrivée", false], ["Cuisine", "Lave-vaisselle", 1, 0.6, "Don", false],
    ["Chambre parentale", "Lit 160", 1, 1.6, "Garde-meuble", true], ["Chambre parentale", "Armoire 3 portes", 1, 2.4, "Garde-meuble", true],
  ];
  for (const i of inv) await d.query("insert into inventaire(dossier_id,piece,libelle,quantite,volume,destination,demontage) values($1,$2,$3,$4,$5,$6,$7)", [dupuis, ...i]);

  const lefevre = await dossier({
    client: ["particulier", "Claire", "Lefèvre", undefined, "claire.lefevre@example.com", "06 98 76 54 32"], com: 4, traite: 6, statut: "planifie",
    chargement: dans(5), volume: 32, stops: [["depart", "18 rue Oberkampf, Paris 11e", "3e", true], ["arrivee", "22 quai Saint-Vincent, Lyon 6e", "2e", true]],
    devis: [["standard", 2980, "signe"]], cree: new Date(now.getTime() - 14 * 864e5).toISOString(),
  });
  await d.query("insert into paiements(dossier_id,libelle,montant) values($1,'Arrhes 30 %',894)", [lefevre]);
  await dossier({
    client: ["compte", "Camille", "Bernier", "Safran", "c.bernier@safran.example", "01 40 00 00 15"], com: 3, traite: 6, statut: "visite",
    periode: "Mars 2027", moisCa: `${annee + 1}-03-01`, volume: 58,
    obs: "Safran consulte 3 déménageurs, les 2 autres sont très agressifs sur le prix : passer en dernier ou envoyer le devis après les concurrents.",
    stops: [["depart", "Paris 15e", "5e", true], ["arrivee", "Bordeaux Lac", "RDC", true]],
  });
  const morel = await dossier({
    client: ["militaire", "Yann", "Morel", "Marine nationale", undefined, "06 55 44 33 22"], com: 5, traite: 6, statut: "planifie",
    chargement: dans(-12), volume: 24, obs: "Mutation Martinique. Effets personnels en cantines, mobilier en garde-meuble.",
    stops: [["depart", "Brest", "2e", false], ["garde_meuble", "Garde-meuble Brest"], ["arrivee", "Fort-de-France", "RDC", true]],
    devis: [["standard", 6120, "signe"]], cree: new Date(now.getTime() - 40 * 864e5).toISOString(),
  });
  await d.query("insert into lettres_voiture(dossier_id,numero,trajet,date_chargement,prestataire,montant,statut) values($1,$2,$3,$4,'Bailly Brest',6120,'livree')", [morel, `LV-${annee}-0${++nl}`, "Brest → Garde-meuble Brest", dans(-12)]);
  await d.query("insert into lettres_voiture(dossier_id,numero,trajet,prestataire,montant,statut) values($1,$2,$3,'Partenaire Martinique',0,'en_cours')", [morel, `LV-${annee}-0${++nl}`, "Garde-meuble Brest → Fort-de-France"]);
  await dossier({
    client: ["particulier", "Anne", "Marino", undefined, "a.marino@example.com", "06 11 22 33 44"], com: 3, traite: 6, statut: "devis",
    periode: "Décembre 2026", moisCa: mois(12), volume: 18, stops: [["depart", "Paris 9e", "1er", true], ["arrivee", "Nantes centre", "3e", false]],
    devis: [["standard", 2210, "envoye"], ["economique", 1760, "envoye"]], cree: new Date(now.getTime() - 5 * 864e5).toISOString(),
  });
  await dossier({
    client: ["compte", "Service mobilité", "BNP Paribas", "BNP Paribas", "mobilite@bnp.example", "01 42 00 00 00"], com: 3, traite: 6, statut: "visite",
    periode: "Janvier 2027", moisCa: `${annee + 1}-01-01`, volume: 36, stops: [["depart", "La Défense", "12e", true], ["arrivee", "Lille Euralille", "8e", true]],
  });
  await dossier({
    client: ["militaire", "Louis", "Roux", "Armée de terre", undefined, "06 77 88 99 00"], com: 5, traite: 6, statut: "commande",
    periode: "Juillet", moisCa: mois(cur), volume: 31, stops: [["depart", "Vincennes", "1er", false], ["arrivee", "Papeete, Tahiti", "RDC", true]],
    devis: [["standard", 7480, "signe"]], cree: new Date(now.getTime() - 9 * 864e5).toISOString(),
  });
  await dossier({
    client: ["particulier", "Marc", "Rousseau", "Famille Rousseau", undefined, "06 31 41 59 26"], com: 3, traite: 6, statut: "perdu",
    periode: "Décembre 2026", moisCa: mois(12), volume: 64, stops: [["depart", "Boulogne-Billancourt"], ["arrivee", "Annecy"]],
    devis: [["standard", 4090, "refuse"]], cree: new Date(now.getTime() - 20 * 864e5).toISOString(),
  });
  await dossier({
    client: ["particulier", "Erwan", "Gourmelon", undefined, "e.gourmelon@example.com", "06 22 33 44 55"], com: 3, traite: 6, statut: "commande",
    chargement: dans(17), volume: 27, stops: [["depart", "Brest", "2e", false], ["arrivee", "Paris 14e", "4e", true]],
    devis: [["standard", 3150, "signe"]], cree: new Date(now.getTime() - 2 * 864e5).toISOString(),
  });

  await d.query("update dossiers set passer_en_dernier=true where id in (select d.id from dossiers d join clients c on c.id=d.client_id where c.nom in ('Dupuis','Bernier'))");

  // ---- historique de l'année (pour les statistiques) ----
  const R = rng(2026);
  const prenoms = ["Julie", "Thomas", "Sophie", "Nicolas", "Emma", "Hugo", "Léa", "Antoine", "Chloé", "Maxime", "Inès", "Paul"];
  const noms = ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Michel", "Garcia", "David", "Bertrand"];
  const villes = ["Lyon", "Bordeaux", "Nantes", "Lille", "Marseille", "Toulouse", "Rennes", "Strasbourg", "Nice", "Montpellier"];
  for (let m = 1; m <= cur; m++) {
    const n = m === cur ? 7 : 5 + Math.floor(R() * 5) + Math.floor(m / 3);
    for (let i = 0; i < n; i++) {
      const vol = Math.round((14 + R() * 55) * 10) / 10;
      const type = R() < 0.62 ? "particulier" : R() < 0.65 ? "compte" : R() < 0.85 ? "militaire" : "partenaire";
      const jour = 1 + Math.floor(R() * 27);
      const date = new Date(annee, m - 1, jour);
      const fait = date < now;
      const montant = Math.round((vol * (68 + R() * 40) + 400) / 10) * 10;
      const signe = R() < 0.74;
      const stat = !fait ? "commande" : signe ? "termine" : "perdu";
      const id = await dossier({
        client: [type, prenoms[Math.floor(R() * prenoms.length)], noms[Math.floor(R() * noms.length)], type === "compte" ? "Société " + noms[Math.floor(R() * noms.length)] : undefined],
        com: 3 + Math.floor(R() * 3), traite: 6, statut: stat, chargement: iso(date), volume: vol,
        stops: [["depart", "Paris"], ["arrivee", villes[Math.floor(R() * villes.length)]]],
        devis: [["standard", montant, signe ? "signe" : "refuse"]], cree: new Date(date.getTime() - 20 * 864e5).toISOString(),
      });
      if (signe) {
        await d.query("insert into paiements(dossier_id,libelle,montant,recu_le) values($1,'Arrhes 30 %',$2,$3)", [id, Math.round(montant * 0.3), iso(new Date(date.getTime() - 15 * 864e5))]);
        if (stat === "termine")
          await d.query("insert into factures(dossier_id,numero,objet,montant,statut,emise_le,payee_le) values($1,$2,'Déménagement',$3,'payee',$4,$4)", [id, `FA-${annee}-${String(++nf).padStart(4, "0")}`, montant, iso(date)]);
      }
    }
  }

  // ---- planning de la semaine affichée ----
  const lun = semaineCourante(now);
  const did = async (nom: string) => (await d.query<{ id: number }>("select d.id from dossiers d join clients c on c.id=d.client_id where c.nom ilike $1 or c.societe ilike $1 limit 1", [`%${nom}%`]))[0]?.id ?? null;
  type E = [com: number, jour: number, h: number, duree: number, type: string, titre: string, lieu: string, dossier: string | null, devis?: boolean];
  const EV: E[] = [
    [3, 0, 9, 90, "phys", "M. Dupuis", "Le Vésinet · 3 pièces", "Dupuis", true], [3, 0, 11.5, 60, "visio", "Mme Marino", "Visio · 2 pièces", "Marino"],
    [3, 0, 14, 120, "phys", "Safran — C. Bernier", "Paris 15e · compte", "Bernier"], [3, 1, 9.5, 60, "visio", "M. Gourmelon", "Visio · Brest → Paris", "Gourmelon", true],
    [3, 1, 11, 45, "tache", "Livrer 40 cartons", "Chez Mme Lefèvre", "Lefèvre"], [3, 1, 15, 90, "phys", "Famille Rousseau", "Boulogne · 90 m²", "Rousseau"],
    [3, 2, 8, 210, "perso", "Semaine des enfants", "Visios uniquement", null], [3, 2, 14, 60, "visio", "Cdt Morel — DOM-TOM", "Visio · Martinique", "Morel"],
    [3, 2, 16, 60, "visio", "Mme Haddad", "Visio · studio", null], [3, 3, 9, 90, "phys", "M. Perrin", "Versailles · maison 140 m²", null],
    [3, 3, 12, 45, "tache", "RDV médical", "Personnel", null], [3, 3, 14.5, 90, "phys", "Mme Okafor", "Neuilly · cave + box", null],
    [3, 4, 10, 60, "visio", "M. Tessier", "Visio · international", null], [3, 4, 11.5, 90, "phys", "BNP Paribas — mutation", "La Défense · compte", "BNP"],
    [4, 0, 10, 90, "phys", "M. Bastide", "Saint-Cloud", null, true], [4, 0, 15, 60, "visio", "Mme Giraud", "Visio", null],
    [4, 2, 9, 120, "phys", "Famille Nguyen", "Issy · 4 pièces", null], [4, 2, 13.5, 90, "phys", "M. Lemaire", "Meudon", null],
    [5, 2, 9.5, 60, "visio", "Mme Duval", "Visio", null], [5, 2, 11, 90, "phys", "Adjudant Roux", "Vincennes · mutation Tahiti", "Roux"],
    [5, 2, 15, 120, "tache", "Dépôt inventaire GM", "Garde-meuble Gennevilliers", null],
  ];
  for (const [com, j, h, dur, type, titre, lieu, dos, dv] of EV) {
    const dt = new Date(lun); dt.setDate(dt.getDate() + j); dt.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    await d.query("insert into rendez_vous(commercial_id,dossier_id,type,titre,lieu,debut,duree_min,devis_etabli) values($1,$2,$3,$4,$5,$6,$7,$8)",
      [uid(com), dos ? await did(dos) : null, type, titre, lieu, dt.toISOString(), dur, !!dv]);
  }

  // ---- journal d'activité ----
  const act: [string, number, string, number][] = [
    ["Dupuis", 3, "Devis standard envoyé au client", 1], ["Lefèvre", 4, "Devis signé électroniquement", 2],
    ["Bernier", 3, "Visite planifiée · passer en dernier", 3], ["Morel", 5, "Lettre de voiture 2 créée", 4], ["Marino", 3, "Devis envoyé (2 formules)", 5],
  ];
  for (const [nom, u, lib, h] of act)
    await d.query("insert into activite(dossier_id,utilisateur_id,libelle,cree_le) values($1,$2,$3,$4)", [await did(nom), uid(u), lib, new Date(now.getTime() - h * 36e5).toISOString()]);
}
