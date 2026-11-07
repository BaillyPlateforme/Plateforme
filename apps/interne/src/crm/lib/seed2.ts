import type { Db, Row } from "./db";
import { prestationsPour, formules } from "./tarif";
import { semerDemo } from "@/crm/dispatch/demo";

/**
 * Données de démonstration des modules ajoutés après la recette : import web,
 * garde-meuble, conteneurs, modèles, exploitation. Appelée en fin de seed(),
 * donc une seule fois, sur une base vide, dans le schéma `crm` uniquement.
 * Tout est fictif.
 *
 * `uid` traduit le rang d'un utilisateur de démonstration (3 Dragan, 6 Roxane…)
 * en son identifiant réel, comme dans seed().
 */
export async function seedExtra(d: Db, lun: Date, now: Date, uid: (rang: number) => number) {
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const jour = (n: number) => { const x = new Date(lun); x.setDate(x.getDate() + n); return iso(x); };
  const ins = async (sql: string, p: unknown[]) => (await d.query<{ id: number }>(sql + " returning id", p))[0].id;
  const annee = now.getFullYear();

  // prestations détaillées des devis existants
  for (const v of await d.query<{ id: number; formule: string; montant: number; volume: number; lignes: Row[] }>("select v.id, v.formule, v.montant::float8 as montant, d.volume::float8 as volume, v.lignes from devis v join dossiers d on d.id=v.dossier_id")) {
    let lignes = v.lignes;
    if (!lignes || lignes.length === 0) {
      // lignes de chiffrage calées sur le montant déjà signé ou envoyé
      const fo = formules(v.volume > 0 ? v.volume : 20).find((f) => f.cle === v.formule) ?? formules(20)[1];
      const base = fo.lignes.reduce((a, l) => a + l.prix, 0) || 1, k = v.montant / base;
      lignes = fo.lignes.map((l) => ({ ...l, prix: Math.round((l.prix * k) / 10) * 10, achat: Math.round((l.prix * k * 0.68) / 10) * 10 }));
    }
    await d.query("update devis set lignes=$3, prestations=$2, validite=current_date + 60 where id=$1", [v.id, JSON.stringify(prestationsPour(v.formule)), JSON.stringify(lignes)]);
  }
  await d.query("update dossiers set type_demenagement='international' where id in (select d.id from dossiers d join clients c on c.id=d.client_id where c.type='militaire')");

  // modèles de courriers et de SMS
  const M: [string, string, string | null, string][] = [
    ["sms", "Confirmation de rendez-vous", null, "Bailly Déménagement : votre rendez-vous avec {commercial} est confirmé le {date} à {heure}. Répondez 1 pour confirmer ou 2 pour annuler."],
    ["sms", "Rappel de visite (veille)", null, "Bonjour {client}, {commercial} passera chez vous demain à {heure} pour la visite technique. Merci de confirmer en répondant 1."],
    ["sms", "Livraison de cartons", null, "Bonjour {client}, vos cartons seront livrés le {date}. Bailly Déménagement."],
    ["sms", "Rendez-vous manqué", null, "Bonjour {client}, nous n'avons pas pu vous joindre pour la visite prévue. Rappelez-nous au 01 69 10 35 35."],
    ["email", "Envoi du devis", "Votre devis de déménagement {ref}", "Bonjour {client},\n\nSuite à notre rencontre, veuillez trouver nos propositions pour votre déménagement.\n\nBien cordialement,\n{commercial}"],
    ["email", "Relance de devis", "Votre déménagement : avez-vous pu consulter notre devis ?", "Bonjour {client},\n\nJe me permets de revenir vers vous au sujet de notre devis {ref}. Je reste à votre disposition.\n\n{commercial}"],
    ["email", "Fiche de visite", "Votre fiche de visite {ref}", "Bonjour {client},\n\nVous trouverez ci-joint la fiche de visite de votre déménagement.\n\n{commercial}"],
    ["email", "Lettre de voiture", "Votre lettre de voiture {ref}", "Bonjour {client},\n\nVeuillez trouver ci-joint la lettre de voiture signée.\n\nL'équipe Bailly"],
    ["email", "Facture", "Votre facture Bailly Déménagement {ref}", "Bonjour {client},\n\nVeuillez trouver ci-joint votre facture.\n\nCordialement,\nLa comptabilité"],
  ];
  for (const m of M) await d.query("insert into modeles_messages(canal,nom,objet,corps) values($1,$2,$3,$4)", m);

  // dossiers planifiés de la semaine (écran « Planning d'exploitation »)
  const cl = async (type: string, prenom: string, nom: string, societe?: string) => ins("insert into clients(type,prenom,nom,societe) values($1,$2,$3,$4)", [type, prenom, nom, societe ?? null]);
  let nd = 300, nl = 200;
  const P: [number, number, string, string, string, string, string, string][] = [
    // jour chargement, durée (jours), client, société, départ, arrivée, prestataire, équipe
    [0, 0, "Laurent Perrot", "", "Paris 12e", "Vincennes", "Bailly Paris", "Équipe 1 · Samir, Joao, Bilel"],
    [0, 1, "Isabelle Rey", "", "Versailles", "Tours", "Bailly Paris", "Équipe 2 · Mehdi, Karl"],
    [1, 0, "Cabinet Moreau", "Cabinet Moreau", "Paris 8e", "Paris 17e", "Bailly Paris", "Équipe 1 · Samir, Joao, Bilel"],
    [2, 1, "Camille Fournier", "", "Boulogne", "Lyon 2e", "Partenaire Lyon", "Équipe externe · Rhône Déménagement"],
    [3, 0, "Karine Dubreuil", "", "Neuilly", "Paris 16e", "Bailly Paris", "Équipe 2 · Mehdi, Karl"],
    [4, 1, "Olivier Marchand", "", "Saint-Cloud", "Bordeaux", "Bailly Paris", "Équipe 1 · Samir, Joao, Bilel"],
  ];
  for (const [j, dur, nom, soc, dep, arr, presta, equipe] of P) {
    const c = await cl(soc ? "compte" : "particulier", nom.split(" ")[0], nom.split(" ").slice(1).join(" ") || nom, soc || undefined);
    // commercial : Dragan (rang 3) · traité par : Roxane (rang 6)
    const dos = await ins(
      "insert into dossiers(ref,client_id,commercial_id,traite_par_id,statut,date_chargement,date_livraison,volume,mois_ca) values($1,$2,$6,$7,'planifie',$3,$4,$5,$3)",
      [`BD-${annee}-${String(++nd).padStart(4, "0")}`, c, jour(j), jour(j + dur), 18 + (j + dur) * 7, uid(3), uid(6)]);
    await d.query("insert into etapes_trajet(dossier_id,ordre,genre,adresse) values($1,0,'depart',$2),($1,1,'arrivee',$3)", [dos, dep, arr]);
    await d.query("insert into devis(dossier_id,numero,formule,montant,statut,envoye_le,signe_le,prestations) values($1,$2,'standard',$3,'signe',now(),now(),$4)", [dos, `DV-${annee}-9${String(nd).padStart(3, "0")}`, 1800 + dur * 900, JSON.stringify(prestationsPour("standard"))]);
    await d.query("insert into lettres_voiture(dossier_id,numero,trajet,date_chargement,date_livraison,prestataire,equipe,immatriculation,montant,statut) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'planifiee')",
      [dos, `LV-${annee}-0${++nl}`, `${dep} → ${arr}`, jour(j), jour(j + dur), presta, equipe, presta === "Bailly Paris" ? "GH-482-KL" : null, 1800 + dur * 900]);
  }
  const O: [string, number, string, string, string][] = [
    ["Équipe 3 · Congés", 0, "manuelle", "Congés Christophe É.", "Toute la semaine"],
    ["Équipe 3 · Congés", 1, "manuelle", "Congés Christophe É.", ""], ["Équipe 3 · Congés", 2, "manuelle", "Congés Christophe É.", ""],
    ["Équipe 2 · Mehdi, Karl", 2, "manuelle", "Op. manuelle", "Dépôt chez le garde-meuble : TV et cartons"],
    ["Équipe 1 · Samir, Joao, Bilel", 3, "groupage", "Dépotage TC arrivé du Havre", "Dépôt de Villebon : 8 clients à livrer"],
  ];
  for (const o of O) await d.query("insert into operations(equipe,jour,genre,titre,detail) values($1,$2,$3,$4,$5)", [o[0], jour(o[1]), o[2], o[3], o[4]]);

  // garde-meuble
  const G: [string, number, string, number, string, number, string | null][] = [
    ["Bastien Roux", 3, "GM-0412, GM-0413, GM-0431", 210, "mensuelle", 14, jour(-20)],
    ["Marine Delcourt", 1, "GM-0501", 70, "mensuelle", 9, jour(-12)],
    ["Entreprise Safran (stockage)", 12, "GM-0600 à GM-0611", 840, "trimestrielle", 24, jour(-70)],
    ["Famille Nguyen", 2, "GM-0377, GM-0378", 140, "mensuelle", 22, jour(-48)],
    ["Capitaine Morel", 4, "GM-0702 à GM-0705", 280, "mensuelle", 3, jour(-5)],
    ["Hélène Vasseur", 1, "GM-0715", 70, "trimestrielle", 6, null],
  ];
  for (const g of G) {
    const deb = new Date(now); deb.setMonth(deb.getMonth() - g[5]);
    await d.query("insert into garde_meuble(client,nb_caisses,numeros,loyer_mensuel,periodicite,debut,derniere_facture) values($1,$2,$3,$4,$5,$6,$7)", [g[0], g[1], g[2], g[3], g[4], iso(deb), g[6]]);
  }

  // conteneurs et clients groupés
  const ds = await d.query<{ id: number }>("select id from dossiers where statut in ('commande','planifie') order by id limit 12");
  const C: [string, string, string, number, string, string, string][] = [
    ["TCLU 507215-0", "export", "Fort-de-France (Martinique)", 67, "preparation", jour(9), "ACCORD DÉMÉNAGEMENT BY EDM"],
    ["MRSU 331804-7", "export", "Pointe-à-Pitre (Guadeloupe)", 67, "charge", jour(2), "TRANSITAIRE ANTILLES"],
    ["CMAU 902276-3", "import", "Le Havre, depuis Papeete", 67, "en_mer", jour(-3), "AGENT TAHITI"],
  ];
  let ci = 0;
  for (const c of C) {
    const id = await ins("insert into conteneurs(numero,sens,destination,capacite,statut,depart_prevu,groupeur,plomb) values($1,$2,$3,$4,$5,$6,$8,$7)", [c[0], c[1], c[2], c[3], c[4], c[5], `PL-${100000 + ci * 7311}`, c[6]]);
    const vols: [number, string][] = [[14, "Fort-de-France"], [9, "Le Lamentin"], [18, "Schoelcher"], [7, "Fort-de-France"]];
    const n = ci === 0 ? 4 : ci === 1 ? 3 : 2;
    for (let i = 0; i < n && ds[ci * 4 + i]; i++) await d.query("insert into conteneur_dossiers(conteneur_id,dossier_id,volume,ville_livraison) values($1,$2,$3,$4) on conflict do nothing", [id, ds[ci * 4 + i].id, vols[i][0], vols[i][1]]);
    ci++;
  }

  // litige
  const t = await d.query<{ id: number }>("select id from dossiers where statut='termine' order by id limit 2");
  if (t[0]) await d.query("insert into litiges(dossier_id,objet,statut,montant) values($1,'Meuble rayé au déchargement',$2,180)", [t[0].id, "en_cours"]);
  if (t[1]) await d.query("insert into litiges(dossier_id,objet,statut,montant) values($1,'Carton manquant à la livraison','ouvert',60)", [t[1].id]);

  // dispatch des conteneurs : le plan de démonstration (exploitation : Roxane, rang 6)
  await semerDemo(d, uid(6));
}
