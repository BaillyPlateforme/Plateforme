"use client";

import { useRef, useState, useTransition } from "react";
import type { LibraryPhoto } from "@/lib/library";
import { uploadLibraryPhotos, deleteLibraryPhoto } from "@/lib/actions/library";

export default function ImagesManager({ library }: { library: LibraryPhoto[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    start(async () => {
      await uploadLibraryPhotos(fd);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="font-serif text-xl">Base de photos</h3>
          <p className="text-sm text-ink-soft">{library.length} photo(s) — utilisées dans le Playground.</p>
        </div>
        <label className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark">
          {pending ? "Envoi…" : "Ajouter des photos"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onFiles}
            disabled={pending}
          />
        </label>
      </div>

      {library.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
          Aucune photo. Ajoutez-en pour alimenter le Playground.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6">
          {library.map((p) => (
            <div key={p.path} className="group relative aspect-square overflow-hidden rounded-lg border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() =>
                  start(async () => {
                    setBusy(p.path);
                    await deleteLibraryPhoto(p.path);
                    setBusy(null);
                  })
                }
                disabled={pending}
                className="absolute inset-0 flex items-center justify-center bg-ink/0 text-transparent transition group-hover:bg-ink/50 group-hover:text-white"
              >
                {busy === p.path ? "…" : "Supprimer"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
