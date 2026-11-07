import "server-only";
import { lireDonnees } from "@/lib/espace-client/depot";
import { jourLong } from "@/lib/espace-client/format";
import { calculerTourneeDuSamedi, envoyerCreneauxDuSamedi, envoyerRecapitulatifEquipe } from "@/lib/espace-client/samedi";
import type { Tache } from "./types";

/*
 * Les cartons du samedi (cahier des charges, §3.6), la veille :
 *
 *   1. l'ordre de passage optimisé et les créneaux — le calcul de tournée de
 *      l'espace client, celui du bouton « Calculer la tournée » —, s'il
 *      manque encore à une livraison ;
 *   2. les bons de livraison par client et le récapitulatif des cartons à
 *      préparer, envoyés à l'équipe (le PDF des bons en pièce jointe) ;
 *   3. le message au client : un SMS et un e-mail avec son créneau.
 *
 * Rien en double si on la relance : la tournée n'est recalculée que s'il
 * manque un créneau, le récapitulatif ne repart que si son contenu a changé,
 * et un client déjà prévenu ne l'est pas deux fois.
 */
export const tacheCartons: Tache = {
  cle: "cartons_du_samedi",
  libelle: "Cartons du samedi",
  async executer({ demain }) {
    const d = await lireDonnees();
    const livraisons = d.livraisons_cartons.filter((l) => l.date_samedi === demain && l.statut !== "livree");
    if (!livraisons.length) return { statut: "rien", resume: `Aucune livraison de cartons ${jourLong(demain)}.` };

    const erreurs: string[] = [];
    let tournee: Awaited<ReturnType<typeof calculerTourneeDuSamedi>> | null = null;
    if (livraisons.some((l) => !l.creneau_debut)) {
      try {
        tournee = await calculerTourneeDuSamedi(demain);
      } catch (e) {
        erreurs.push(`tournée : ${e instanceof Error ? e.message : "calcul impossible"}`);
      }
    }

    let recap: Awaited<ReturnType<typeof envoyerRecapitulatifEquipe>> | null = null;
    try {
      recap = await envoyerRecapitulatifEquipe(demain);
    } catch (e) {
      erreurs.push(`récapitulatif : ${e instanceof Error ? e.message : "envoi impossible"}`);
    }

    let clients: Awaited<ReturnType<typeof envoyerCreneauxDuSamedi>> | null = null;
    try {
      clients = await envoyerCreneauxDuSamedi(demain, { origine: "veille" });
    } catch (e) {
      erreurs.push(`messages aux clients : ${e instanceof Error ? e.message : "envoi impossible"}`);
    }

    const morceaux = [
      `${livraisons.length} livraison${livraisons.length > 1 ? "s" : ""} ${jourLong(demain)}`,
      tournee ? `tournée calculée (${tournee.arrets} arrêt${tournee.arrets > 1 ? "s" : ""}, ${String(tournee.distanceKm).replace(".", ",")} km${tournee.horsTournee ? `, ${tournee.horsTournee} hors tournée` : ""})` : "tournée déjà calculée",
      recap
        ? recap.deja === recap.destinataires
          ? "récapitulatif déjà traité, inchangé"
          : `récapitulatif et bons à ${recap.destinataires} destinataire${recap.destinataires > 1 ? "s" : ""} (${recap.partis} parti${recap.partis > 1 ? "s" : ""}, ${recap.journalises} au journal)`
        : null,
      clients
        ? clients.prevenus
          ? `${clients.prevenus} client${clients.prevenus > 1 ? "s" : ""} traité${clients.prevenus > 1 ? "s" : ""} : ${clients.partis} message${clients.partis > 1 ? "s" : ""} parti${clients.partis > 1 ? "s" : ""} sur ${clients.prevenus * 2}`
          : "aucun nouveau client à prévenir"
        : null,
      clients?.incomplets ? `${clients.incomplets} sans nombre de cartons ou sans créneau : non prévenu${clients.incomplets > 1 ? "s" : ""}` : null,
    ].filter(Boolean);

    const echecs = (clients?.echecs ?? 0) + erreurs.length;
    return {
      statut: erreurs.length === 3 ? "echec" : echecs || clients?.incomplets ? "partielle" : "faite",
      resume: `${morceaux.join(" · ")}${erreurs.length ? ` · erreurs : ${erreurs.join(" ; ")}` : ""}.`,
      details: { samedi: demain, livraisons: livraisons.length, tournee, recap, clients, erreurs },
    };
  },
};
