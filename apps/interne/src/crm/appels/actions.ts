"use server";

import { revalidatePath } from "next/cache";
import { deplacerRappel } from "@/lib/actions/rappels";
import { currentUser } from "@/crm/lib/auth";
import { q } from "@/crm/lib/db";
import { journaliser } from "@/crm/lib/journal";
import { trouverAppel } from "./donnees";
import { lireCle, NOTE_MAX, REPORT_MAX_JOURS, type Appel } from "./regles";

/*
 * Les gestes de la liste des appels. Chacun revérifie le compte (une action
 * serveur s'appelle de n'importe où) et ne note qu'un appel encore dû :
 * l'appel est recalculé depuis sa source, jamais pris tel que l'écran
 * l'envoie. Rien ne part : ni e-mail, ni SMS.
 *
 * - « Fait » : un rappel demandé passe à « rappelé » par l'action existante
 *   des rappels (Demandes › À rappeler) ; pour les autres sources, l'appel
 *   est noté dans crm.appels. Dans les deux cas, la ligne de crm.appels
 *   garde la note, et le journal des gestes l'inscrit (le Feed le montre).
 * - « Fermer » (David, 08/11/2026 : « soit c'est fait, soit on ferme ») :
 *   l'appel quitte la liste sans avoir été passé ; un rappel demandé passe
 *   à « clos » par la même action des rappels. La demande ou le dossier,
 *   eux, ne changent pas.
 * - « Plus tard » : l'appel quitte la liste jusqu'à l'heure choisie.
 * - « Maintenant » : un appel reporté revient tout de suite.
 */

export type Resultat = { ok: boolean; message: string };

async function noter(a: Appel, etat: "fait" | "reporte" | "ferme", o: { note?: string | null; reporteAu?: Date | null }, u: { id: number; nom: string }) {
  await q(
    `insert into crm.appels(source, objet_id, occurrence, etat, reporte_au, note, par_id, par_nom, quand, dossier_id, request_id, client, motif, telephone, lien)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10, $11, $12, $13, $14)
     on conflict (source, objet_id, occurrence) do update set etat = excluded.etat, reporte_au = excluded.reporte_au, note = excluded.note,
       par_id = excluded.par_id, par_nom = excluded.par_nom, quand = now(), dossier_id = excluded.dossier_id, request_id = excluded.request_id,
       client = excluded.client, motif = excluded.motif, telephone = excluded.telephone, lien = excluded.lien`,
    [
      a.source, a.objetId, a.occurrence, etat, o.reporteAu ?? null, o.note ?? null, u.id, u.nom,
      a.dossierId, a.requestId, a.client, a.motif, a.telephone, a.lien.href,
    ],
  );
}

function rafraichir(a: Appel) {
  revalidatePath("/appels");
  if (a.requestId) revalidatePath(`/dashboard/${a.requestId}`);
  if (a.dossierId) revalidatePath(`/dossiers/${a.dossierId}`);
}

async function retrouver(cle: string): Promise<Appel | null> {
  const c = lireCle(cle);
  return c ? trouverAppel(c.source, c.objetId, c.occurrence) : null;
}

export async function marquerAppelFait(cle: string, note?: string | null): Promise<Resultat> {
  const u = await currentUser();
  const a = await retrouver(cle);
  if (!a) return { ok: false, message: "Cet appel n'est plus à faire : la liste a changé." };
  const texte = String(note ?? "").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) || null;
  try {
    // Le rappel demandé passe à « rappelé » par l'action des rappels : son journal dit le changement de statut.
    if (a.source === "rappel") await deplacerRappel(a.objetId, "rappele");
    await noter(a, "fait", { note: texte }, u);
  } catch (e) {
    console.error("Appels : appel non noté", e instanceof Error ? e.message : e);
    return { ok: false, message: "L'appel n'a pas pu être noté : réessayez dans un instant." };
  }
  await journaliser({
    action: "appel.fait",
    libelle: `Appel passé à ${a.client} (${a.resume})${texte ? ` : « ${texte} »` : ""}`,
    objet: a.objetFeed,
    dossierId: a.dossierId,
    requestId: a.requestId,
    details: { source: a.source },
  });
  rafraichir(a);
  return { ok: true, message: `Appel à ${a.client} noté.` };
}

export async function fermerAppel(cle: string): Promise<Resultat> {
  const u = await currentUser();
  const a = await retrouver(cle);
  if (!a) return { ok: false, message: "Cet appel n'est plus à faire : la liste a changé." };
  try {
    if (a.source === "rappel") await deplacerRappel(a.objetId, "clos");
    await noter(a, "ferme", {}, u);
  } catch (e) {
    console.error("Appels : fermeture non notée", e instanceof Error ? e.message : e);
    return { ok: false, message: "L'appel n'a pas pu être fermé : réessayez dans un instant." };
  }
  await journaliser({
    action: "appel.ferme",
    libelle: `Appel fermé sans suite : ${a.client} (${a.resume})`,
    objet: a.objetFeed,
    dossierId: a.dossierId,
    requestId: a.requestId,
    details: { source: a.source },
  });
  rafraichir(a);
  return { ok: true, message: `${a.client} : retiré de la liste.` };
}

export async function reporterAppel(cle: string, jusqua: string): Promise<Resultat> {
  const u = await currentUser();
  const au = new Date(jusqua);
  const maintenant = Date.now();
  if (!Number.isFinite(au.getTime()) || au.getTime() < maintenant + 60_000) return { ok: false, message: "Choisissez une heure à venir." };
  if (au.getTime() > maintenant + REPORT_MAX_JOURS * 864e5) return { ok: false, message: `Un appel se reporte de ${REPORT_MAX_JOURS} jours au plus.` };
  const a = await retrouver(cle);
  if (!a) return { ok: false, message: "Cet appel n'est plus à faire : la liste a changé." };
  try {
    await noter(a, "reporte", { reporteAu: au }, u);
  } catch (e) {
    console.error("Appels : report non noté", e instanceof Error ? e.message : e);
    return { ok: false, message: "Le report n'a pas pu être noté : réessayez dans un instant." };
  }
  rafraichir(a);
  return { ok: true, message: `Appel à ${a.client} reporté.` };
}

/** Un appel reporté revient tout de suite dans la liste. */
export async function remettreAppel(cle: string): Promise<Resultat> {
  await currentUser();
  const c = lireCle(cle);
  if (!c) return { ok: false, message: "Appel introuvable." };
  await q("delete from crm.appels where source = $1 and objet_id = $2 and occurrence = $3 and etat = 'reporte'", [c.source, c.objetId, c.occurrence]);
  revalidatePath("/appels");
  return { ok: true, message: "L'appel est de retour dans la liste." };
}
