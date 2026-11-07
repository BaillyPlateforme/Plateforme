import "server-only";
import { lireDonnees, maintenant, modifierDonnees } from "./depot";
import { texteSms } from "./emails";
import { heure, jourLong, salutation } from "./format";
import { conseillerDe, signatureDe } from "./lectures";
import { notifier } from "./notifier";
import { distanceKm, geocoder, PARAMS_TOURNEE, tournees } from "./tournee";

/*
 * La logistique des cartons d'un samedi, partagée par le bouton de l'équipe
 * et par l'envoi automatique de la veille (/espace-client/taches/veille).
 */

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

  await modifierDonnees((m) => {
    for (const l of livraisons) {
      const cible = m.livraisons_cartons.find((x) => x.id === l.id);
      if (!cible) continue;
      const p = coords.get(l.id);
      cible.lat = p?.lat ?? null;
      cible.lng = p?.lng ?? null;
      const a = r.arrets.find((x) => x.id === l.id);
      // Hors zone ou introuvable : ni ordre ni créneau, l'équipe l'organise à part.
      Object.assign(cible, a ? { ordre_passage: a.ordre, creneau_debut: a.creneau_debut, creneau_fin: a.creneau_fin } : { ordre_passage: null, creneau_debut: null, creneau_fin: null });
    }
  });
  return { distanceKm: r.distanceKm, fin: r.fin, arrets: r.arrets.length, horsTournee: livraisons.length - r.arrets.length };
}

/**
 * Le message de la veille : un SMS et un e-mail par client dont le nombre de
 * cartons et le créneau sont connus. Un message déjà parti ne repart pas.
 */
export async function envoyerCreneauxDuSamedi(samedi: string) {
  const d = await lireDonnees();
  const prets = d.livraisons_cartons.filter((l) => l.date_samedi === samedi && l.statut !== "livree" && l.creneau_debut && l.nb_cartons && !l.creneau_envoye_le);
  for (const l of prets) {
    const dossier = d.dossiers.find((x) => x.id === l.dossier_id);
    const client = dossier && d.clients.find((c) => c.id === dossier.client_id);
    if (!dossier || !client) continue;
    const conseiller = conseillerDe(d, client.conseiller_id);
    const p = {
      salutation: salutation(client), prenom: client.prenom, nb: l.nb_cartons, jour: jourLong(samedi),
      debut: heure(l.creneau_debut!), fin: heure(l.creneau_fin!), adresse: l.adresse, contact: l.contact_nom,
      telephone: conseiller.telephone, signature: signatureDe(conseiller),
    };
    await notifier.envoyer({ dossier_id: dossier.id, canal: "sms", modele: "creneau_cartons", destinataire: l.contact_tel, payload: { ...p, texte: texteSms("creneau_cartons", p) } });
    await notifier.envoyer({ dossier_id: dossier.id, canal: "email", modele: "creneau_cartons", destinataire: client.email, payload: p });
  }
  const ids = new Set(prets.map((l) => l.id));
  await modifierDonnees((m) => {
    for (const l of m.livraisons_cartons) if (ids.has(l.id)) l.creneau_envoye_le = maintenant();
  });
  return { envoyes: prets.length };
}
