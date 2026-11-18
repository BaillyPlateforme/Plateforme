import "server-only";
import { createHash } from "node:crypto";
import { TEL_AGENCE } from "@/lib/messaging";
import { champDesabonnement, destinatairesAlerte, noterEvenement } from "@/lib/alertes-equipe";
import { createServiceClient } from "@/lib/supabase/server";
import { pdfBons } from "./pdf";
import { estDemo } from "./config";
import { avecDelai, depot, lireDonnees, maintenant } from "./depot";
import { texteSms } from "./emails";
import { heure, jourLong, salutation } from "./format";
import { conseillerDe, signatureDe } from "./lectures";
import { notifier } from "./notifier";
import { distanceKm, geocoder, PARAMS_TOURNEE, tournees } from "./tournee";

/*
 * La logistique des cartons d'un samedi, partagée par le bouton de l'équipe
 * et par l'envoi automatique de la veille (/espace-client/taches/veille).
 */

/**
 * L'occupation des samedis entre deux dates : un nombre de livraisons par
 * date, sans rien d'autre. C'est tout ce qu'un client voit des autres — et
 * il le voit par le serveur (clé de service), car la RLS ne lui montre que
 * ses propres livraisons. `exclure` : sa livraison, qu'il est en train de
 * déplacer.
 */
export async function occupationSamedis(min: string, max: string, exclure?: string | null): Promise<Record<string, number>> {
  const lignes = estDemo()
    ? (await lireDonnees()).livraisons_cartons
    : await avecDelai(createServiceClient().from("ec_livraisons_cartons").select("id, date_samedi").gte("date_samedi", min).lte("date_samedi", max)).then(({ data, error }) => {
        if (error) throw new Error(`Lecture du calendrier impossible : ${error.message}`);
        return (data ?? []) as { id: string; date_samedi: string }[];
      });
  const out: Record<string, number> = {};
  for (const l of lignes) {
    if (l.id === exclure || l.date_samedi < min || l.date_samedi > max) continue;
    out[l.date_samedi] = (out[l.date_samedi] ?? 0) + 1;
  }
  return out;
}

/** Localise les adresses manquantes, puis calcule l'ordre de passage et les créneaux. */
export async function calculerTourneeDuSamedi(samedi: string) {
  const d = await lireDonnees();
  const livraisons = d.livraisons_cartons.filter((l) => l.date_samedi === samedi && l.statut !== "livree");
  const coords = new Map<string, { lat: number; lng: number } | null>();
  for (const l of livraisons) coords.set(l.id, l.lat != null && l.lng != null ? { lat: l.lat, lng: l.lng } : await geocoder(l.adresse));

  const dansLaZone = (p: { lat: number; lng: number } | null | undefined): p is { lat: number; lng: number } => !!p && distanceKm(PARAMS_TOURNEE.depot, p) <= PARAMS_TOURNEE.rayonMaxKm;
  const arrets = livraisons.flatMap((l) => {
    const p = coords.get(l.id);
    return dansLaZone(p) ? [{ id: l.id, ...p }] : [];
  });
  const r = await tournees.optimiser(arrets, {
    depart: PARAMS_TOURNEE.depot,
    heureDepart: PARAMS_TOURNEE.heureDepart,
    minutesParArret: PARAMS_TOURNEE.minutesParArret,
    vitesseKmh: PARAMS_TOURNEE.vitesseKmh,
    largeurCreneau: PARAMS_TOURNEE.largeurCreneau,
  });

  for (const l of livraisons) {
    const p = coords.get(l.id);
    const a = r.arrets.find((x) => x.id === l.id);
    await depot().modifier("livraisons_cartons", l.id, {
      lat: p?.lat ?? null,
      lng: p?.lng ?? null,
      // Hors zone ou introuvable : ni ordre ni créneau, l'équipe l'organise à part.
      ...(a ? { ordre_passage: a.ordre, creneau_debut: a.creneau_debut, creneau_fin: a.creneau_fin } : { ordre_passage: null, creneau_debut: null, creneau_fin: null }),
    });
  }
  return { distanceKm: r.distanceKm, fin: r.fin, arrets: r.arrets.length, horsTournee: livraisons.length - r.arrets.length };
}

/**
 * Le message de la veille : un SMS et un e-mail par client dont le nombre de
 * cartons et le créneau sont connus. Un message déjà parti ne repart pas.
 *
 * `prevenus` : les clients traités (leur message est passé par le module
 * d'envoi) ; `partis` : les messages vraiment remis au fournisseur — en recette ou
 * envoi désactivé, ils restent au journal. `incomplets` : les livraisons sans
 * nombre de cartons ou sans créneau, qui ne reçoivent rien.
 */
export async function envoyerCreneauxDuSamedi(samedi: string, options: { origine?: "espace_client" | "veille" } = {}) {
  const d = await lireDonnees();
  const duJour = d.livraisons_cartons.filter((l) => l.date_samedi === samedi && l.statut !== "livree");
  const prets = duJour.filter((l) => l.creneau_debut && l.nb_cartons && !l.creneau_envoye_le);
  const incomplets = duJour.filter((l) => !l.creneau_envoye_le && (!l.creneau_debut || !l.nb_cartons)).length;
  let prevenus = 0;
  let partis = 0;
  let echecs = 0;
  for (const l of prets) {
    const dossier = d.dossiers.find((x) => x.id === l.dossier_id);
    const client = dossier && d.clients.find((c) => c.id === dossier.client_id);
    if (!dossier || !client) continue;
    // Marqué avant l'envoi, en une seule requête : la tâche de la veille et le bouton
    // de l'équipe lancés ensemble n'envoient pas deux fois le même message.
    if (!(await depot().modifier("livraisons_cartons", l.id, { creneau_envoye_le: maintenant() }, { creneau_envoye_le: null }))) continue;
    const conseiller = conseillerDe(d, client.conseiller_id);
    const p = {
      salutation: salutation(client), prenom: client.prenom, nb: l.nb_cartons, jour: jourLong(samedi),
      debut: heure(l.creneau_debut!), fin: heure(l.creneau_fin!), adresse: l.adresse, contact: l.contact_nom,
      telephone: conseiller.telephone, signature: signatureDe(conseiller),
    };
    // Et une clé par message : même si le marquage était un jour défait, un client ne reçoit pas deux fois le même créneau.
    const cle = `cartons:creneau:${l.id}:${samedi}:${l.creneau_debut}`;
    const origine = options.origine ?? "espace_client";
    const sms = await notifier.envoyer({ dossier_id: dossier.id, canal: "sms", modele: "creneau_cartons", destinataire: l.contact_tel, payload: { ...p, texte: texteSms("creneau_cartons", p) } }, { cle: `${cle}:sms`, origine });
    const email = await notifier.envoyer({ dossier_id: dossier.id, canal: "email", modele: "creneau_cartons", destinataire: client.email, payload: p }, { cle: `${cle}:email`, origine });
    prevenus += 1;
    partis += [sms, email].filter((n) => n.statut === "envoyee").length;
    echecs += [sms, email].filter((n) => n.statut === "echec").length;
  }
  return { envoyes: prevenus, prevenus, partis, echecs, incomplets };
}

/**
 * Le récapitulatif de la veille, pour l'équipe : l'ordre de passage, les
 * créneaux et les cartons à préparer, avec les bons de livraison en PDF (la
 * page récapitulative, puis un bon par client). Il part à l'adresse de
 * l'équipe (ESPACE_CLIENT_EMAIL_EQUIPE), à défaut aux conseillers des
 * dossiers du jour. Sa clé tient compte de son contenu : relancé à
 * l'identique, il ne repart pas ; si la tournée a changé, il repart.
 */
export async function envoyerRecapitulatifEquipe(samedi: string) {
  const d = await lireDonnees();
  const bons = d.livraisons_cartons
    .filter((l) => l.date_samedi === samedi && l.statut !== "livree")
    .sort((a, b) => (a.ordre_passage ?? 99) - (b.ordre_passage ?? 99) || a.contact_nom.localeCompare(b.contact_nom))
    .flatMap((l) => {
      const dossier = d.dossiers.find((x) => x.id === l.dossier_id);
      const client = dossier && d.clients.find((c) => c.id === dossier.client_id);
      return dossier && client ? [{ l, dossier, client }] : [];
    });
  if (!bons.length) return { destinataires: 0, partis: 0, journalises: 0, deja: 0 };

  const total = bons.reduce((n, b) => n + (b.l.nb_cartons ?? 0), 0);
  const lignes = bons.map(({ l, dossier }) => ({
    ordre: l.ordre_passage, creneau: l.creneau_debut ? `${heure(l.creneau_debut)} – ${heure(l.creneau_fin!)}` : null,
    client: l.contact_nom, reference: dossier.reference, adresse: l.adresse, nb: l.nb_cartons,
  }));
  const empreinte = createHash("sha256").update(JSON.stringify(lignes)).digest("hex").slice(0, 16);
  // Les abonnés de l'alerte « Tournée des cartons du samedi » (Relances › Alertes de l'équipe) ;
  // sans abonnements lisibles, comme avant : ESPACE_CLIENT_EMAIL_EQUIPE, sinon les conseillers des dossiers du jour.
  const abonnes = (await destinatairesAlerte("recap_cartons", { conseillers: bons.map((b) => conseillerDe(d, b.client.conseiller_id).email) })).destinataires;
  const destinataires = abonnes.map((a) => a.email);
  const pdf = (await pdfBons(samedi, bons)).toString("base64");

  let partis = 0;
  let journalises = 0;
  let deja = 0;
  for (const a of destinataires) {
    const n = await notifier.envoyer(
      {
        dossier_id: null, canal: "email", modele: "recap_cartons_equipe", destinataire: a,
        payload: {
          jour: jourLong(samedi), total, lignes, incomplets: lignes.filter((x) => !x.nb || !x.creneau).length,
          chemin: `/dashboard/espace-client/cartons?samedi=${samedi}`, signature: { nom: "Espace client", role: "Message automatique", telephone: TEL_AGENCE },
          ...champDesabonnement(abonnes.find((x) => x.email === a) ?? { desabonnement: null }),
        },
      },
      { cle: `veille:cartons:recap:${samedi}:${a.toLowerCase()}:${empreinte}`, origine: "veille", piecesJointes: [{ nom: `bons-cartons-${samedi}.pdf`, base64: pdf }] },
    );
    if (n.doublon) deja += 1;
    else if (n.statut === "envoyee") partis += 1;
    else journalises += 1;
  }
  await noterEvenement("recap_cartons", `${samedi}-${empreinte}`, null, destinataires.length, `${destinataires.length} destinataire(s) · ${partis} parti(s), ${journalises} journalisé(s), ${deja} déjà traité(s)`);
  return { destinataires: destinataires.length, partis, journalises, deja };
}
