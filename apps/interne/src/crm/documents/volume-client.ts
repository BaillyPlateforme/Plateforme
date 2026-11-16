import { m3 } from "@/crm/lib/format";

/*
 * Le volume tel que le client le lit sur les documents de Bailly (devis
 * imprimé, page de signature, facture, exemplaires de la lettre de voiture).
 *
 * Client CIMOB/DICOM (clients.type = 'militaire') : ses droits, le volume
 * que son administration lui accorde (dossiers.volume_droits), et jamais son
 * volume réel, qui reste consultable au CRM sans être mentionné au client
 * (Céline, 16/11/2026 : « un peu comme les clients compte », dont le prix ne
 * se montre pas à l'employé). Sans droits saisis, aucun volume n'est montré.
 * L'espace client suit la même règle, tenue par la base (devis/schema.ts).
 */

export const estCimobDicom = (type: unknown) => type === "militaire";

export interface VolumeClient {
  /** Le volume à montrer, ou null : rien à montrer (droits pas encore saisis). */
  valeur: number | null;
  /** Vrai pour un client CIMOB/DICOM : la valeur est celle de ses droits. */
  droits: boolean;
  /** « Droits » ou « Volume ». */
  libelle: string;
}

const positif = (v: unknown) => {
  const n = v === null || v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function volumeClient(d: { type?: unknown; volume?: unknown; volume_droits?: unknown }): VolumeClient {
  if (estCimobDicom(d.type)) return { valeur: positif(d.volume_droits), droits: true, libelle: "Droits" };
  return { valeur: positif(d.volume), droits: false, libelle: "Volume" };
}

/** « 12,5 m³ », ou « — » quand il n'y a rien à montrer. */
export function m3Client(d: { type?: unknown; volume?: unknown; volume_droits?: unknown }) {
  const v = volumeClient(d);
  return v.valeur == null ? "—" : m3(v.valeur);
}
