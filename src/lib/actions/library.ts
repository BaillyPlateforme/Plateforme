"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export async function uploadLibraryPhotos(formData: FormData) {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return;
  const supabase = createServiceClient();
  const bucket = env.libraryBucket();

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `base/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    await supabase.storage.from(bucket).upload(path, buf, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
  }
  revalidatePath("/dashboard/configuration");
  revalidatePath("/dashboard/playground");
}

export async function deleteLibraryPhoto(path: string) {
  const supabase = createServiceClient();
  await supabase.storage.from(env.libraryBucket()).remove([path]);
  revalidatePath("/dashboard/configuration");
  revalidatePath("/dashboard/playground");
}
