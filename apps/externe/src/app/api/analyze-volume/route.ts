import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { analyzePhoto, detecterDoublons } from "@/lib/volume-ai";
import { getAiConfig } from "@/lib/ai-config";
import { env } from "@/lib/env";
import type { AnalyzedPhotoInput } from "@/lib/schemas";
import type { AiConfig } from "@/lib/ai-config";
import type { GroupePieces } from "@/lib/volume-ai";
import { listLibraryPhotos } from "@/lib/library";
import { adresseIp, fenetreJour, fenetres, lireLimite, reponseTropDeDemandes, reserver } from "@/lib/limites";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_PHOTOS = 12;
const MAX_BYTES = 15 * 1024 * 1024;

/*
 * Chaque photo est un appel Gemini, payant : un plafond de photos par adresse
 * IP (par minute, par heure, par jour) et un plafond total du jour. Réglables
 * sans toucher au code : GEMINI_PHOTOS_PAR_MINUTE, GEMINI_PHOTOS_PAR_HEURE,
 * GEMINI_PHOTOS_PAR_JOUR (par adresse) et GEMINI_PHOTOS_PAR_JOUR_TOTAL.
 * Par défaut, de quoi photographier tout un logement (deux envois de 12 à la
 * suite), jamais de quoi faire tourner un robot.
 */
function reserverPhotos(req: Request, nombre: number) {
  const refus = reserver([
    { cle: `gemini:ip:${adresseIp(req.headers)}`, poids: nombre, fenetres: fenetres("GEMINI_PHOTOS", { minute: 24, heure: 60, jour: 120 }) },
    { cle: "gemini:total", poids: nombre, fenetres: fenetreJour(lireLimite("GEMINI_PHOTOS_PAR_JOUR_TOTAL", 1500)) },
  ]);
  if (!refus) return null;
  return reponseTropDeDemandes(
    refus,
    refus.cle === "gemini:total"
      ? "L'analyse des photos est momentanément indisponible : vous pouvez indiquer votre volume ou décrire votre logement."
      : "Beaucoup de photos ont été analysées depuis votre connexion.",
  );
}

/** Le type réel d'une image, lu dans ses premiers octets (jamais celui que le navigateur annonce). */
function typeImage(o: Buffer): { mime: string; ext: string } | null {
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (o.length >= 8 && o.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (o.length >= 12 && o.toString("ascii", 0, 4) === "RIFF" && o.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (o.length >= 12 && o.toString("ascii", 4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(o.toString("ascii", 8, 12))) return { mime: "image/heic", ext: "heic" };
  return null;
}

type ResultPhoto = AnalyzedPhotoInput & { previewUrl?: string };

/** Une photo analysée, avec ses octets : la passe de doublons les redemande. */
type Analysee = { photo: ResultPhoto; base64: string; mimeType: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Regroupe les photos d'une même pièce et écarte le mobilier déjà compté.
 *
 * Chaque photo garde son inventaire complet et reste visible. Seules les
 * LIGNES qui désignent un meuble déjà listé sur une photo précédente du groupe
 * sont marquées : elles restent affichées, mais ne comptent plus. Ce qu'une
 * photo est seule à montrer est conservé — c'est tout l'intérêt du second
 * angle.
 */
async function regrouper(
  results: PromiseSettledResult<Analysee>[],
  cfg: AiConfig,
): Promise<PromiseSettledResult<ResultPhoto>[]> {
  const ok = results.filter((r) => r.status === "fulfilled");
  if (ok.length < 2) return aplatir(results);

  let groupes: GroupePieces[] = [];
  try {
    groupes = await detecterDoublons(
      ok.map((r) => ({
        base64: r.value.base64,
        mimeType: r.value.mimeType,
        inventaire: r.value.photo.objets.map(
          (o) => `${o.label} (×${o.quantite}, ${o.volume_m3} m³)`,
        ),
      })),
      cfg,
    );
  } catch {
    // La détection est un confort : si elle échoue, les photos restent telles
    // quelles plutôt que de faire échouer toute l'analyse.
    return aplatir(results);
  }

  groupes.forEach((g, n) => {
    const membres = g.photos.map((i) => ok[i].value.photo);
    const id = `${Date.now().toString(36)}-${n}`;

    membres.forEach((m) => {
      m.groupe = id;
      m.doublon_de = membres[0].storage_path;
      m.doublon_raison = g.raison;
      if (g.piece) m.piece = g.piece;
    });

    // Les lignes déjà vues ailleurs : marquées, pas supprimées.
    g.deja_vus.forEach(({ photo, ligne }) => {
      const cible = ok[photo]?.value.photo.objets[ligne];
      if (cible) cible.doublon = true;
    });

    membres.forEach((m) => {
      m.volume_m3 = round2(m.objets.reduce((s, o) => s + (o.doublon ? 0 : o.volume_m3), 0));
    });
  });

  return aplatir(results);
}

function aplatir(results: PromiseSettledResult<Analysee>[]): PromiseSettledResult<ResultPhoto>[] {
  return results.map((r) =>
    r.status === "fulfilled"
      ? { status: "fulfilled" as const, value: r.value.photo }
      : { status: "rejected" as const, reason: r.reason },
  );
}


// POST /api/analyze-volume
// - multipart/form-data (champ "photos") : upload + analyse (formulaire)
// - application/json { paths: string[] } : analyse depuis la base playground
export async function POST(req: Request) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) return analyzeLibrary(req);
  return analyzeUpload(req);
}

// Analyse des photos de la bibliothèque (bucket playground-photos), par chemin.
async function analyzeLibrary(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const demandes =
    body && typeof body === "object" && Array.isArray((body as { paths?: unknown }).paths)
      ? ((body as { paths: unknown[] }).paths.filter((p) => typeof p === "string") as string[])
      : [];
  // Seulement les photos de la vitrine (base/…), chacune une fois : un même chemin répété
  // douze fois faisait douze appels Gemini.
  const vitrine = new Set((await listLibraryPhotos()).map((p) => p.path));
  const paths = [...new Set(demandes)].filter((p) => vitrine.has(p));

  if (paths.length === 0) {
    return NextResponse.json({ error: "Aucune photo sélectionnée" }, { status: 422 });
  }
  if (paths.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Maximum ${MAX_PHOTOS} photos` }, { status: 422 });
  }
  const refus = reserverPhotos(req, paths.length);
  if (refus) return refus;

  const supabase = createServiceClient();
  const bucket = env.libraryBucket();
  const cfg = await getAiConfig();

  const results = await Promise.allSettled(
    paths.map(async (path): Promise<Analysee> => {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) throw new Error("Photo d'exemple indisponible.");
      const bytes = Buffer.from(await data.arrayBuffer());
      const mimeType = data.type || "image/jpeg";
      const base64 = bytes.toString("base64");
      const analysis = await analyzePhoto(base64, mimeType, cfg);
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      return { photo: { ...analysis, storage_path: path, previewUrl: pub.publicUrl }, base64, mimeType };
    }),
  );

  return collect(await regrouper(results, cfg));
}

// Analyse d'un upload multipart (formulaire client).
async function analyzeUpload(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data attendu" }, { status: 400 });
  }

  const files = form.getAll("photos").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Aucune photo reçue" }, { status: 422 });
  }
  if (files.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_PHOTOS} photos par envoi` },
      { status: 422 },
    );
  }
  const refus = reserverPhotos(req, files.length);
  if (refus) return refus;

  const supabase = createServiceClient();
  const bucket = env.storageBucket();
  const sessionId = randomUUID(); // dossier de staging, relié à la demande au submit
  const cfg = await getAiConfig();

  const results = await Promise.allSettled(
    files.map(async (file, i): Promise<Analysee> => {
      if (file.size > MAX_BYTES) throw new Error(`${file.name} dépasse 15 Mo`);

      const bytes = Buffer.from(await file.arrayBuffer());
      // Le type et l'extension viennent du contenu, jamais du nom ni de ce qu'annonce le navigateur.
      const type = typeImage(bytes);
      if (!type) throw new Error(`${file.name} n'est pas une photo (JPEG, PNG, WebP ou HEIC).`);
      const storagePath = `staging/${sessionId}/${i}-${randomUUID()}.${type.ext}`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, bytes, {
          contentType: type.mime,
          upsert: false,
        });
      if (upErr) {
        console.error("[analyze-volume] dépôt de la photo :", upErr.message);
        throw new Error(`${file.name} n'a pas pu être enregistrée.`);
      }

      const mimeType = type.mime;
      const base64 = bytes.toString("base64");
      const analysis = await analyzePhoto(base64, mimeType, cfg);
      return { photo: { ...analysis, storage_path: storagePath }, base64, mimeType };
    }),
  );

  return collect(await regrouper(results, cfg));
}

// Agrège les résultats d'analyse (fulfilled/rejected) en réponse JSON.
function collect(results: PromiseSettledResult<ResultPhoto>[]) {
  const photos: ResultPhoto[] = [];
  const errors: string[] = [];
  results.forEach((r) => {
    if (r.status === "fulfilled") photos.push(r.value);
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
  });

  if (photos.length === 0) {
    // Toutes refusées pour la même raison (pas une photo, par exemple) : le visiteur lit cette raison.
    const unique = new Set(errors.map((e) => e.replace(/^.*? n'est pas une photo/, "n'est pas une photo")));
    const raison = unique.size === 1 && errors[0] ? errors[0] : "Analyse impossible";
    return NextResponse.json({ error: raison, details: errors }, { status: errors.some((e) => e.includes("n'est pas une photo")) ? 422 : 502 });
  }

  const total_volume_m3 = round2(photos.reduce((s, p) => s + p.volume_m3, 0));

  return NextResponse.json({ photos, total_volume_m3, errors }, { status: 200 });
}
