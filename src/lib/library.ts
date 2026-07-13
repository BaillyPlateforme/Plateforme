import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export interface LibraryPhoto {
  path: string;
  url: string;
}

// Liste la base de photos (bucket public playground-photos/base).
export async function listLibraryPhotos(): Promise<LibraryPhoto[]> {
  const supabase = createServiceClient();
  const bucket = env.libraryBucket();
  const { data, error } = await supabase.storage.from(bucket).list("base", {
    limit: 100,
    sortBy: { column: "name", order: "asc" },
  });
  if (error || !data) return [];
  return data
    .filter((f) => f.name && !f.name.startsWith("."))
    .map((f) => {
      const path = `base/${f.name}`;
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      return { path, url: pub.publicUrl };
    });
}
