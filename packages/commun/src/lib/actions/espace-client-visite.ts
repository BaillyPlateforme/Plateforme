"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { emailEquipe } from "@/lib/espace-client/config";
import { nomClient } from "@/lib/espace-client/format";
import { conseillerDe } from "@/lib/espace-client/lectures";
import { notifier } from "@/lib/espace-client/notifier";
import { exigerClientPourAgir, lireDonneesClient } from "@/lib/espace-client/session";
import { choisirCreneauCrm, demanderCreneauxCrm } from "@/lib/espace-client/visite";

/*
 * Les actions du client pour sa visite technique (cahier des charges, §3.2).
 * Comme les autres actions du client (espace-client.ts), chacune refait tout
 * le chemin : la session, la propriété du dossier — cherché dans ce que la
 * RLS rend au client —, puis l'écriture, ici par les fonctions de la
 * migration 0015, qui réservent dans le CRM sous verrou et revérifient que
 * le créneau est bien à ce client. Pendant un aperçu de l'équipe, elles
 * refusent d'entrée (exigerClientPourAgir).
 */

async function contexte(reference: string) {
  const client = await exigerClientPourAgir();
  const d = await lireDonneesClient();
  const dossier = d.dossiers.find((x) => x.reference === reference && x.client_id === client.id);
  if (!dossier) throw new Error("Dossier introuvable.");
  return { client, dossier, d, conseiller: conseillerDe(d, client.conseiller_id) };
}

const rafraichir = (reference: string) => revalidatePath(`/espace-client/${reference}`, "layout");

/** Le client choisit l'un des créneaux proposés : la visite est réservée dans le planning du commercial. */
export async function choisirCreneau(reference: string, creneauId: string) {
  const { client, dossier, d } = await contexte(reference);
  const creneau = (d.creneaux ?? []).find((c) => c.id === creneauId && c.dossier_id === dossier.id && c.statut === "propose");
  if (!creneau) redirect(`/espace-client/${reference}/visite?indisponible=1`);
  const issue = await choisirCreneauCrm(creneau.id, client.id);
  rafraichir(reference);
  redirect(issue === "reserve" ? `/espace-client/${reference}/visite?ok=visite-reservee` : `/espace-client/${reference}/visite?indisponible=1`);
}

/**
 * Aucun créneau ne convient : la demande est notée dans le CRM (sur la
 * proposition et au fil d'activité du dossier) et part au conseiller, comme
 * un message écrit depuis l'espace.
 */
export async function demanderAutresCreneaux(reference: string, fd: FormData) {
  const { client, dossier, conseiller } = await contexte(reference);
  const precision = String(fd.get("message") ?? "").replace(/\s+\n/g, "\n").trim().slice(0, 600);
  await demanderCreneauxCrm(dossier.id, client.id, precision);
  await notifier.envoyer({
    dossier_id: dossier.id,
    canal: "email",
    modele: "message_conseiller",
    destinataire: conseiller.email || emailEquipe(conseiller.email),
    payload: {
      client: nomClient(client),
      email: client.email,
      reference: dossier.reference,
      message: `Aucun des créneaux de visite technique proposés ne me convient.${precision ? `\n\n${precision}` : ""}`,
      signature: { nom: "Espace client", role: "Message automatique", telephone: conseiller.telephone },
    },
  });
  rafraichir(reference);
  redirect(`/espace-client/${reference}/visite?ok=visite-demande`);
}
