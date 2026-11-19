import { libelleParcours } from "@/lib/parcours";
import { libelleZone } from "@/lib/zone";
import type { RequestRow } from "@/lib/types";

/**
 * Les variables de l'alerte « Nouvelle demande du site » : de quelle bulle
 * vient la demande, sa destination, les coordonnées du client et son trajet
 * (Céline, 19/11/2026 : « que l'on sache de quelle bulle il s'agit, que je
 * puisse transmettre directement aux personnes concernées »).
 */
export function varsAlerteDemande(
  r: Pick<RequestRow, "client_nom" | "client_email" | "client_tel" | "depart_adresse" | "depart_code_postal" | "depart_ville" | "arrivee_adresse" | "arrivee_code_postal" | "arrivee_ville" | "date_souhaitee" | "flexibilite" | "volume_m3">,
  details: { parcours?: string; transfert?: string; express?: boolean | string; contact_rapide?: boolean },
  zone: unknown,
): Record<string, string> {
  const lieu = (adresse: string | null, cp: string | null, ville: string | null) => [adresse, [cp, ville].filter(Boolean).join(" ")].filter((x) => x && String(x).trim()).join(", ") || "—";
  const profil = libelleParcours({ parcours: details.parcours, transfert: details.transfert, express: details.express === true || details.express === "true" ? "true" : null });
  return {
    client: r.client_nom || "Sans nom",
    trajet: `${r.depart_ville ?? "?"} → ${r.arrivee_ville ?? "?"}`,
    profil: details.contact_rapide ? `${profil.split(" · ")[0]} · demande à être rappelé(e)` : profil,
    destination: libelleZone(zone),
    telephone: r.client_tel || "—",
    email: r.client_email || "—",
    depart: lieu(r.depart_adresse, r.depart_code_postal, r.depart_ville),
    arrivee: lieu(r.arrivee_adresse, r.arrivee_code_postal, r.arrivee_ville),
    periode: r.date_souhaitee || r.flexibilite || "—",
    volume: r.volume_m3 != null ? `${String(r.volume_m3).replace(".", ",")} m³` : "—",
  };
}

