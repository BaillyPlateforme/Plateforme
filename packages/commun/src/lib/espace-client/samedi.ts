import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
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
 */
export async function envoyerCreneauxDuSamedi(samedi: string) {
  const d = await lireDonnees();
  const prets = d.livraisons_cartons.filter((l) => l.date_samedi === samedi && l.statut !== "livree" && l.creneau_debut && l.nb_cartons && !l.creneau_envoye_le);
  let envoyes = 0;
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
    await notifier.envoyer({ dossier_id: dossier.id, canal: "sms", modele: "creneau_cartons", destinataire: l.contact_tel, payload: { ...p, texte: texteSms("creneau_cartons", p) } });
    await notifier.envoyer({ dossier_id: dossier.id, canal: "email", modele: "creneau_cartons", destinataire: client.email, payload: p });
    envoyes += 1;
  }
  return { envoyes };
}
