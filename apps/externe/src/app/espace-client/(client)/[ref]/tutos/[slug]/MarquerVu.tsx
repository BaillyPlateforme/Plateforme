"use client";

import { useEffect, useState, useTransition } from "react";
import { marquerVu } from "@/lib/actions/tutos";
import { Icone } from "../../../../_ui/Icone";

/*
 * « Marquer comme vu » : le bouton sous la vidéo, celui du bas de la page, et
 * la fin de la vidéo passent tous par signalerVu. Le serveur enregistre, puis
 * rafraîchit la page (revalidatePath) ; en attendant, un événement prévient
 * les autres boutons de la page, qui passent aussitôt à « Vu ».
 */

const EVENEMENT = "ec-tuto-vu";
type Detail = { tutoId: string; le: string };

export type EtatVu = { ok: true } | { ok: false; message: string };

const APERCU = "Aperçu de l'équipe : rien n'est enregistré au nom du client.";

export async function signalerVu(reference: string, tutoId: string, par: "bouton" | "video"): Promise<EtatVu> {
  const r = await marquerVu(reference, tutoId, par);
  if (r.ok) {
    window.dispatchEvent(new CustomEvent<Detail>(EVENEMENT, { detail: { tutoId, le: new Date().toISOString() } }));
    return { ok: true };
  }
  return { ok: false, message: r.apercu ? APERCU : (r.erreur ?? "Impossible d'enregistrer pour l'instant.") };
}

/** Le « vu » de la page : celui du serveur, ou celui que le client vient de marquer. */
export function useVu(tutoId: string, vuServeur: string | null) {
  const [vuLocal, setVuLocal] = useState<string | null>(null);
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<Detail>).detail;
      if (d?.tutoId === tutoId) setVuLocal(d.le);
    };
    window.addEventListener(EVENEMENT, f);
    return () => window.removeEventListener(EVENEMENT, f);
  }, [tutoId]);
  return vuServeur ?? vuLocal;
}

const jour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

/**
 * Le bouton. `lectureSeule` : un aperçu de l'équipe — le bouton reste, mais
 * la garde de l'aperçu l'arrête (data-apercu-bloque, data-reserve-client) et
 * le serveur refuse de toute façon.
 */
export function MarquerVu({
  reference,
  tutoId,
  vuLe,
  lectureSeule,
  variante = "clair",
  aide = null,
}: {
  reference: string;
  tutoId: string;
  vuLe: string | null;
  lectureSeule: boolean;
  variante?: "clair" | "sombre";
  /** La ligne sous le bouton (tutos-contenu.ts) ; rien sans vidéo hébergée. */
  aide?: string | null;
}) {
  const vu = useVu(tutoId, vuLe);
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (vu) {
    return (
      <p className={`tx-vu-etat ${variante}`} role="status">
        <span className="tx-vu-coche">
          <Icone nom="check" />
        </span>
        <span>
          <b>Tutoriel vu</b>
          <small>le {jour(vu)}</small>
        </span>
      </p>
    );
  }

  return (
    <div className={`tx-vu-action ${variante}`} data-reserve-client="">
      <button
        type="button"
        className={`btn ${variante === "sombre" ? "btn-primary" : "btn-dark"}`}
        disabled={enCours}
        data-apercu-bloque=""
        onClick={() => {
          setMessage(null);
          demarrer(async () => {
            const r = await signalerVu(reference, tutoId, "bouton");
            if (!r.ok) setMessage(r.message);
          });
        }}
      >
        <Icone nom="check" /> {enCours ? "Enregistrement…" : "Marquer comme vu"}
      </button>
      {message ? (
        <p className="err-inline" role="alert">
          {message}
        </p>
      ) : (
        (lectureSeule || aide) && <small>{lectureSeule ? "Aperçu de l'équipe : rien ne sera enregistré." : aide}</small>
      )}
    </div>
  );
}
