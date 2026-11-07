import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { analyzePhoto, detecterDoublons } from "@/lib/volume-ai";
import { getAiConfig } from "@/lib/ai-config";
import { env } from "@/lib/env";
import type { AnalyzedPhotoInput } from "@/lib/schemas";
import type { AiConfig } from "@/lib/ai-config";
import type { GroupePieces } from "@/lib/volume-ai";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_PHOTOS = 12;
const MAX_BYTES = 15 * 1024 * 1024;

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
  const paths =
    body && typeof body === "object" && Array.isArray((body as { paths?: unknown }).paths)
      ? ((body as { paths: unknown[] }).paths.filter((p) => typeof p === "string") as string[])
      : [];

  if (paths.length === 0) {
    return NextResponse.json({ error: "Aucune photo sélectionnée" }, { status: 422 });
  }
  if (paths.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Maximum ${MAX_PHOTOS} photos` }, { status: 422 });
  }

  const supabase = createServiceClient();
  const bucket = env.libraryBucket();
  const cfg = await getAiConfig();

  const results = await Promise.allSettled(
    paths.map(async (path): Promise<Analysee> => {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) throw new Error(`Téléchargement échoué : ${path}`);
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

  const supabase = createServiceClient();
  const bucket = env.storageBucket();
  const sessionId = randomUUID(); // dossier de staging, relié à la demande au submit
  const cfg = await getAiConfig();

  const results = await Promise.allSettled(
    files.map(async (file, i): Promise<Analysee> => {
      if (file.size > MAX_BYTES) throw new Error(`${file.name} dépasse 15 Mo`);

      const bytes = Buffer.from(await file.arrayBuffer());
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const storagePath = `staging/${sessionId}/${i}-${randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, bytes, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
      if (upErr) throw new Error(`Upload échoué (${file.name}) : ${upErr.message}`);

      const mimeType = file.type || "image/jpeg";
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
    return NextResponse.json({ error: "Analyse impossible", details: errors }, { status: 502 });
  }

  const total_volume_m3 = round2(photos.reduce((s, p) => s + p.volume_m3, 0));

  return NextResponse.json({ photos, total_volume_m3, errors }, { status: 200 });
}
