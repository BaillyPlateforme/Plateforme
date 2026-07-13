import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { analyzePhoto } from "@/lib/volume-ai";
import { env } from "@/lib/env";
import type { AnalyzedPhotoInput } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_PHOTOS = 12;
const MAX_BYTES = 15 * 1024 * 1024;

// POST /api/analyze-volume  (multipart/form-data, champ "photos")
// Upload chaque photo dans le Storage + analyse IA, en parallèle.
// Retourne les photos analysées (à réinjecter dans le submit final du form).
export async function POST(req: Request) {
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

  const results = await Promise.allSettled(
    files.map(async (file, i): Promise<AnalyzedPhotoInput> => {
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

      const analysis = await analyzePhoto(bytes.toString("base64"), file.type || "image/jpeg");
      return { ...analysis, storage_path: storagePath };
    }),
  );

  const photos: AnalyzedPhotoInput[] = [];
  const errors: string[] = [];
  results.forEach((r) => {
    if (r.status === "fulfilled") photos.push(r.value);
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
  });

  if (photos.length === 0) {
    return NextResponse.json(
      { error: "Analyse impossible", details: errors },
      { status: 502 },
    );
  }

  const total_volume_m3 =
    Math.round(photos.reduce((s, p) => s + p.volume_m3, 0) * 100) / 100;

  return NextResponse.json({ photos, total_volume_m3, errors }, { status: 200 });
}
