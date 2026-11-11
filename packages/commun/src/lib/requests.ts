import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { fireEvent } from "@/lib/alerts";
import { alerterEquipe } from "@/lib/alertes-equipe";
import { contexteDemande } from "@/lib/messaging";
import { getEspaceParCodeOuJeton } from "@/lib/espaces-pro";
import { instantane } from "@/lib/espaces";
import { qualifyRequest } from "@/lib/qualification";
import { transmettreACreagidem } from "@/lib/creagidem";
import { creerRappel } from "@/lib/rappels";
import { SANS_PRIX, parcoursDeLaDemande } from "@/lib/parcours";
import type { CreateRequestInput, ItemInput, AnalyzedPhotoInput } from "@/lib/schemas";
import type { RequestRow, RequestSource, RequestStatus } from "@/lib/types";

type ResolvedVolume = {
  volume_m3: number | null;
  volume_method: "explicit" | "list" | "ai" | null;
  items: ItemInput[];
  photos: AnalyzedPhotoInput[];
};

// Convertit un volume (3 méthodes) en (volume_m3, method) prêts à stocker.
function resolveVolume(volume: CreateRequestInput["volume"]): ResolvedVolume {
  if (!volume) return { volume_m3: null, volume_method: null, items: [], photos: [] };

  if (volume.method === "explicit") {
    return { volume_m3: volume.volume_m3, volume_method: "explicit", items: [], photos: [] };
  }
  if (volume.method === "list") {
    const total = volume.items.reduce(
      (sum, it) => sum + it.quantite * it.volume_unitaire_m3,
      0,
    );
    return { volume_m3: round2(total), volume_method: "list", items: volume.items, photos: [] };
  }
  // 'ai' : volume = somme des volumes estimés par photo (déjà analysées).
  // Chaque photo porte déjà son volume net : les meubles vus sur une autre
  // photo de la même pièce en ont été retirés.
  const total = volume.photos.reduce((sum, p) => sum + p.volume_m3, 0);
  return { volume_m3: round2(total), volume_method: "ai", items: [], photos: volume.photos };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Les meubles (volume par liste) et les photos analysées (volume par photos) d'une demande. */
async function ecrireMeublesEtPhotos(requestId: string, items: ItemInput[], photos: AnalyzedPhotoInput[]) {
  const supabase = createServiceClient();
  const [meubles, cliches] = await Promise.all([
    items.length > 0
      ? supabase.from("request_items").insert(
          items.map((it) => ({ request_id: requestId, label: it.label, quantite: it.quantite, volume_unitaire_m3: it.volume_unitaire_m3 })),
        )
      : null,
    photos.length > 0
      ? supabase.from("request_photos").insert(
          photos.map((p) => ({
            request_id: requestId,
            storage_path: p.storage_path,
            piece: p.piece,
            ai_analysis: { piece: p.piece, objets: p.objets, volume_m3: p.volume_m3 },
            volume_m3: p.volume_m3,
          })),
        )
      : null,
  ]);
  if (meubles?.error) throw new Error(`Insertion des items échouée : ${meubles.error.message}`);
  if (cliches?.error) throw new Error(`Insertion des photos échouée : ${cliches.error.message}`);
}

/**
 * Les colonnes d'une demande, d'après ce que le formulaire a envoyé : la même
 * règle à la création et à la modification par le client (modifierDemande).
 */
async function preparerDemande(input: CreateRequestInput) {
  const { volume_m3, volume_method, items, photos } = resolveVolume(input.volume);
  // L'espace pro. Le formulaire n'envoie que son lien : ses réglages sont
  // relus ici, jamais crus sur parole — la cote sur le volume ne doit pas
  // pouvoir être choisie par celui qui remplit. Ils sont figés dans la
  // demande : modifier l'espace ensuite ne rechiffre pas le passé.
  // Le nom ne suffit pas : c'est le code du lien qui prouve qu'on vient bien de l'espace.
  // (Ou le jeton reçu par qui a saisi le nom de sa société dans le formulaire public.)
  const parCode = input.espace_code ? await getEspaceParCodeOuJeton(input.espace_code) : null;
  const espace = parCode && parCode.slug === input.espace ? parCode : null;
  const contexteEspace = espace?.actif ? instantane(espace) : undefined;
  const charge: Record<string, unknown> = { ...input, espace: contexteEspace };
  // Le code a servi à reconnaître l'espace : il n'a rien à faire dans la demande.
  delete charge.espace_code;
  if (contexteEspace) {
    // Un espace pro, c'est une mobilité portée par l'employeur.
    charge.mutation_pro = true;
    if (!input.societe) charge.societe = contexteEspace.nom;
  }
  const formule = espace?.actif && espace.formule_imposee ? espace.formule_imposee : input.formule;

  const colonnes: Partial<RequestRow> = {
    client_nom: input.client.nom,
    client_email: input.client.email,
    client_tel: input.client.tel ?? null,

    depart_adresse: input.depart.adresse ?? null,
    depart_code_postal: input.depart.code_postal ?? null,
    depart_ville: input.depart.ville ?? null,
    depart_etage: input.depart.etage ?? null,
    depart_ascenseur: input.depart.ascenseur ?? null,
    type_logement_depart: input.depart.type_logement ?? null,

    arrivee_adresse: input.arrivee.adresse ?? null,
    arrivee_code_postal: input.arrivee.code_postal ?? null,
    arrivee_ville: input.arrivee.ville ?? null,
    arrivee_etage: input.arrivee.etage ?? null,
    arrivee_ascenseur: input.arrivee.ascenseur ?? null,
    type_logement_arrivee: input.arrivee.type_logement ?? null,

    date_souhaitee: input.date_souhaitee ?? null,
    flexibilite: input.flexibilite ?? null,
    formule: formule ?? null,
    distance_km: input.distance_km ?? null,
    services: input.services ?? {},

    volume_m3,
    volume_method,
    raw_payload: charge,
  };

  return { colonnes, items, photos };
}

/**
 * Crée une demande. Chemin unique pour le formulaire ET pour n8n (mail).
 *
 * Rend la demande dès qu'elle est enregistrée, et `suite` : le chiffrage, le
 * devis et les messages, à lancer une fois la réponse envoyée ; et, pour
 * une demande du formulaire, le jeton qui permet au client de la modifier
 * depuis l'écran de son estimation (modifierDemande).
 */
export async function createRequest(
  input: CreateRequestInput,
  source: RequestSource,
): Promise<{ demande: RequestRow; suite: () => Promise<void>; jetonModification: string | null }> {
  const supabase = createServiceClient();
  const { colonnes, items, photos } = await preparerDemande(input);
  const insert: Partial<RequestRow> & Pick<RequestRow, "source"> = { source, status: "new", ...colonnes };

  const { data: request, error } = await supabase
    .from("requests")
    .insert(insert)
    .select()
    .single();

  if (error || !request) {
    throw new Error(`Création de la demande échouée : ${error?.message ?? "aucune ligne"}`);
  }
  const created = request as RequestRow;

  // Les meubles, les photos et la trace de création ne dépendent pas les uns
  // des autres : ils s'écrivent ensemble, pas l'un après l'autre.
  await Promise.all([
    ecrireMeublesEtPhotos(created.id, items, photos),
    supabase.from("request_events").insert({ request_id: created.id, type: "created", payload: { source } }),
  ]);

  // Les parcours sans prix — la mutation, l'entreprise — ne demandent pas de
  // volume : une visite ou une visio suit toujours. Leur en réclamer un par
  // mail (« complétez votre demande ») n'aurait aucun sens.
  const details = (input.details ?? {}) as { parcours?: string; creneau?: string };
  const sansPrix = SANS_PRIX.has(parcoursDeLaDemande({ parcours: details.parcours }));

  // Complétude : mêmes règles que pour les mails entrants.
  const manque_volume = !sansPrix && created.volume_m3 == null;
  const manque_depart = !created.depart_ville;
  const manque_arrivee = !created.arrivee_ville;
  const incomplet = manque_volume || manque_depart || manque_arrivee;

  // Un jeton (et donc un lien de complétion) n'est créé que si une info manque.
  let token: string | null = null;
  if (incomplet) {
    token = randomUUID();
    await supabase.from("requests").update({ completion_token: token }).eq("id", created.id);
    created.completion_token = token;

    const manque: string[] = [];
    if (manque_volume) manque.push("Volume");
    if (manque_depart) manque.push("Adresse de départ");
    if (manque_arrivee) manque.push("Adresse d'arrivée");
    await supabase.from("request_events").insert({ request_id: created.id, type: "incomplete", payload: { manque } });
  }

  /*
   * La suite : le chiffrage, le devis, les messages. Rien de tout cela n'est
   * nécessaire pour répondre au client — sa demande est enregistrée. Tant que
   * la réponse attendait la fin des mails et du PDF, le bouton « Envoyer »
   * restait figé de longues secondes. L'appelant lance donc la suite une fois
   * la réponse partie.
   */
  const suite = async () => {
    // La fiche Créagidem d'une demande du site, en parallèle du reste (garde-fou : lib/creagidem). Ne lève jamais.
    const creagidem = created.source === "form" ? transmettreACreagidem(created.id) : null;
    try {
      await suiteSansCreagidem();
    } finally {
      await creagidem;
    }
  };
  const suiteSansCreagidem = async () => {
    const settings = await getSettings();
    const base = (settings.base_url || "").replace(/\/$/, "");
    const lien = token ? (base ? `${base}/completer/${token}` : `/completer/${token}`) : "";

    const ctx = {
      request_id: created.id,
      source: created.source,
      client_nom: created.client_nom,
      client_email: created.client_email,
      client_tel: created.client_tel,
      ...contexteDemande(created),
      lien_completion: lien,
      manque_volume,
      manque_depart,
      manque_arrivee,
    };

    // L'alerte de l'équipe « Nouvelle demande du site », à ses abonnés (Relances › Alertes de l'équipe).
    await alerterEquipe("demande_recue", {
      evenement: created.id, reference: created.id, origine: "questionnaires",
      vars: { client: created.client_nom || "Sans nom", trajet: `${created.depart_ville ?? "?"} → ${created.arrivee_ville ?? "?"}` },
      lien: { chemin: `/dashboard/${created.id}`, libelle: "Ouvrir la demande" },
    });

    if (sansPrix) {
      // Ni estimation ni devis automatique : l'équipe chiffre après sa visite.
      // La demande va droit au tableau des rappels, où l'équipe la reprend —
      // le client a été prévenu qu'un conseiller le recontacte.
      try {
        await creerRappel(created.id, details.creneau);
      } catch (e) {
        console.error(`[demande ${created.id}] rappel non créé :`, e instanceof Error ? e.message : e);
      }
      await fireEvent("demande_recue", ctx);
    } else if (incomplet) {
      await fireEvent("demande_recue", ctx);
      await fireEvent("demande_incomplete", ctx);
    } else {
      // Demande complète → qualification (devis + analyse notée), AVANT les
      // messages. L'accusé de réception partait jusqu'ici sans l'estimation,
      // qui n'existait pas encore : le client recevait trois phrases, et jamais
      // son prix. Une qualification qui échoue n'empêche pas le message de partir.
      let echec: unknown = null;
      try {
        await qualifyRequest(created.id);
      } catch (e) {
        echec = e;
      }
      await fireEvent("demande_recue", ctx);
      await fireEvent("demande_complete", ctx);
        if (echec) throw echec;
    }
  };

  // Le jeton de modification : le client corrige sa demande depuis l'écran de son estimation.
  const jetonModification = source === "form" ? await emettreJetonModification(created.id) : null;

  return { demande: created, suite, jetonModification };
}

/* ---------- Modifier sa demande, depuis l'écran de l'estimation ---------- */

/*
 * Le client qui voit son estimation peut revenir à son formulaire, déjà
 * rempli, et le renvoyer corrigé (retour de Christian, 11/11/2026). La
 * correction met à jour LA MÊME demande — pas une seconde, qui serait un
 * doublon dans le CRM et dans Créagidem :
 *   - le jeton, remis au navigateur qui a créé la demande et à lui seul,
 *     n'est gardé que par son empreinte (request_events « jeton_modification »)
 *     et vaut deux heures ;
 *   - une demande que l'équipe a déjà reprise (devis envoyé, dossier ouvert,
 *     perdue, archivée) ne se modifie plus : le client appelle son conseiller ;
 *   - l'estimation brouillon est remplacée, et la suite rejouée comme à la
 *     création (chiffrage, messages au client). Une fiche Créagidem déjà
 *     envoyée ne repart pas d'elle-même : la page de la demande le signale.
 */
const DUREE_JETON_MODIFICATION_MS = 2 * 60 * 60 * 1000;
const empreinteJeton = (jeton: string) => createHash("sha256").update(jeton).digest("hex");

async function emettreJetonModification(requestId: string): Promise<string | null> {
  const jeton = randomBytes(24).toString("base64url");
  const { error } = await createServiceClient()
    .from("request_events")
    .insert({ request_id: requestId, type: "jeton_modification", payload: { empreinte: empreinteJeton(jeton), expire: new Date(Date.now() + DUREE_JETON_MODIFICATION_MS).toISOString() } });
  return error ? null : jeton;
}

/** Les statuts d'une demande que l'équipe n'a pas encore reprise. */
const MODIFIABLE: RequestStatus[] = ["new", "analyzing", "qualified"];

export class ModificationRefusee extends Error {}

export async function modifierDemande(
  requestId: string,
  jeton: string,
  input: CreateRequestInput,
): Promise<{ demande: RequestRow; suite: () => Promise<void> }> {
  const supabase = createServiceClient();
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(jeton)) throw new ModificationRefusee("Lien de modification invalide.");
  const { data: avant } = await supabase.from("requests").select("*").eq("id", requestId).maybeSingle();
  if (!avant) throw new ModificationRefusee("Demande introuvable.");
  const { data: jetons } = await supabase.from("request_events").select("payload").eq("request_id", requestId).eq("type", "jeton_modification");
  const empreinte = empreinteJeton(jeton);
  const valide = (jetons ?? []).some((e) => {
    const p = e.payload as { empreinte?: string; expire?: string };
    return p.empreinte === empreinte && !!p.expire && Date.parse(p.expire) > Date.now();
  });
  if (!valide) throw new ModificationRefusee("Le délai pour modifier cette demande est passé : faites une nouvelle demande, ou appelez votre conseiller.");
  const demandeAvant = avant as RequestRow;
  const { data: devisEnvoyes } = await supabase.from("devis").select("id").eq("request_id", requestId).neq("status", "brouillon").limit(1);
  if (!MODIFIABLE.includes(demandeAvant.status) || (devisEnvoyes ?? []).length > 0) {
    throw new ModificationRefusee("Votre conseiller a déjà pris votre demande en main : appelez-le pour la modifier.");
  }

  const { colonnes, items, photos } = await preparerDemande(input);
  // On ne garde que ce que le formulaire peut changer ; le client et le canal restent.
  const complete = colonnes.volume_m3 != null && !!colonnes.depart_ville && !!colonnes.arrivee_ville;
  if (!complete) throw new ModificationRefusee("Il manque le volume ou une ville : complétez le formulaire.");

  const { data: maj, error } = await supabase
    .from("requests")
    .update({ ...colonnes, status: "new", estimation_prix: null, score_potentiel: null, score_difficulte: null, completion_token: null })
    .eq("id", requestId)
    .select()
    .single();
  if (error || !maj) throw new Error(`Modification de la demande échouée : ${error?.message ?? "aucune ligne"}`);
  const demande = maj as RequestRow;

  // Les meubles et les photos : ceux de la version renvoyée. L'estimation brouillon : remplacée par la suite.
  await Promise.all([
    supabase.from("request_items").delete().eq("request_id", requestId),
    supabase.from("request_photos").delete().eq("request_id", requestId),
    supabase.from("devis").delete().eq("request_id", requestId).eq("status", "brouillon"),
  ]);
  await ecrireMeublesEtPhotos(requestId, items, photos);

  // Ce qui a changé, pour l'équipe (onglet Historique de la demande).
  const LIBELLES: [keyof RequestRow, string][] = [
    ["client_nom", "Nom"], ["client_email", "E-mail"], ["client_tel", "Téléphone"],
    ["depart_ville", "Ville de départ"], ["depart_code_postal", "Code postal de départ"], ["depart_adresse", "Adresse de départ"],
    ["arrivee_ville", "Ville d'arrivée"], ["arrivee_code_postal", "Code postal d'arrivée"], ["arrivee_adresse", "Adresse d'arrivée"],
    ["depart_etage", "Étage au départ"], ["arrivee_etage", "Étage à l'arrivée"], ["date_souhaitee", "Date souhaitée"], ["flexibilite", "Période"],
    ["volume_m3", "Volume"], ["formule", "Formule"], ["distance_km", "Distance"],
  ];
  const texte = (v: unknown) => (v == null || v === "" ? "—" : String(v));
  const changes = LIBELLES.filter(([k]) => texte(demandeAvant[k]) !== texte(demande[k])).map(([k, l]) => ({ champ: l, avant: texte(demandeAvant[k]), apres: texte(demande[k]) }));
  await supabase.from("request_events").insert({ request_id: requestId, type: "modified", payload: { par: "client", changes } });

  const suite = async () => {
    const creagidem = demande.source === "form" ? transmettreACreagidem(demande.id) : null;
    try {
      let echec: unknown = null;
      try {
        await qualifyRequest(demande.id);
      } catch (e) {
        echec = e;
      }
      // Le client reçoit sa nouvelle estimation, comme à la création.
      await fireEvent("demande_complete", {
        request_id: demande.id,
        source: demande.source,
        client_nom: demande.client_nom,
        client_email: demande.client_email,
        client_tel: demande.client_tel,
        ...contexteDemande(demande),
        lien_completion: "",
        manque_volume: false,
        manque_depart: false,
        manque_arrivee: false,
      });
      if (echec) throw echec;
    } finally {
      await creagidem;
    }
  };

  return { demande, suite };
}

import type { RequestPhotoRow, RequestItemRow, RequestEventRow, DevisRow } from "@/lib/types";

export interface RequestDetail {
  request: RequestRow;
  photos: RequestPhotoRow[];
  items: RequestItemRow[];
  events: RequestEventRow[];
  devis: DevisRow | null;
}

// Détail complet d'une demande pour la fiche.
export async function getRequestDetail(id: string): Promise<RequestDetail | null> {
  const supabase = createServiceClient();
  const { data: request } = await supabase.from("requests").select("*").eq("id", id).maybeSingle();
  if (!request) return null;

  const [{ data: photos }, { data: items }, { data: events }, { data: devis }] = await Promise.all([
    supabase.from("request_photos").select("*").eq("request_id", id).order("created_at"),
    supabase.from("request_items").select("*").eq("request_id", id).order("created_at"),
    supabase
      .from("request_events")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("devis").select("*").eq("request_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return {
    request: request as RequestRow,
    photos: (photos ?? []) as RequestPhotoRow[],
    items: (items ?? []) as RequestItemRow[],
    events: (events ?? []) as RequestEventRow[],
    devis: (devis as DevisRow) ?? null,
  };
}

/**
 * Colonnes des vues de liste : tout sauf `raw_payload`.
 *
 * Ce champ porte la copie intégrale du formulaire — 42 Ko sur 53 demandes,
 * la moitié du poids de la requête, et il repartait ensuite dans le flux RSC
 * jusqu'au navigateur. Seule la marque « express » en était lue : on va la
 * chercher directement par son chemin JSON.
 */
const COLONNES_LISTE = [
  "id", "source", "status",
  "client_nom", "client_email", "client_tel",
  "depart_adresse", "depart_code_postal", "depart_ville", "depart_etage", "depart_ascenseur",
  "arrivee_adresse", "arrivee_code_postal", "arrivee_ville", "arrivee_etage", "arrivee_ascenseur",
  "date_souhaitee", "flexibilite",
  "volume_m3", "volume_method", "type_logement_depart", "type_logement_arrivee",
  "distance_km", "formule", "services", "estimation_prix", "grid_id",
  "score_potentiel", "score_difficulte", "score_notes",
  "completion_token", "created_at", "updated_at",
  "express:raw_payload->details->>express",
  "espace_nom:raw_payload->espace->>nom",
  "parcours:raw_payload->details->>parcours",
  "transfert:raw_payload->details->>transfert",
  "mutation:raw_payload->>mutation_pro",
  "societe:raw_payload->>societe",
].join(",");

// Liste pour le dashboard.
export async function listRequests(): Promise<RequestRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("requests")
    .select(COLONNES_LISTE)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`Lecture des demandes échouée : ${error.message}`);
  return (data ?? []) as unknown as RequestRow[];
}

/**
 * Compteur de la pastille, gardé quelques secondes.
 *
 * Il est lu par le layout, donc à chaque navigation : une requête de plus à
 * chaque clic pour un chiffre qui ne bouge qu'à la réception d'une demande.
 */
let cacheNouvelles: { a: number; v: number } | null = null;
const TTL_NOUVELLES = 30_000;

export async function compterNouvelles(): Promise<number> {
  if (cacheNouvelles && Date.now() - cacheNouvelles.a < TTL_NOUVELLES) return cacheNouvelles.v;
  const supabase = createServiceClient();
  const { count } = await supabase
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  cacheNouvelles = { a: Date.now(), v: count ?? 0 };
  return cacheNouvelles.v;
}
