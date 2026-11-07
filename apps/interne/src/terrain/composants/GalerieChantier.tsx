import Link from "next/link";
import { Ic } from "@/crm/lib/icons";
import { photosDuDossier } from "../lib/photos";
import GalerieClient from "./GalerieClient";

/*
 * La section « Photos de chantier » de la fiche dossier du CRM : ce que les
 * déménageurs ont envoyé depuis l'outil terrain, rangé par jour ou par
 * équipe, avec l'auteur, l'heure du serveur et la position. C'est la preuve
 * d'état du dossier en cas de SAV.
 */
export default async function GalerieChantier({ dossierId }: { dossierId: number }) {
  const photos = await photosDuDossier(dossierId);
  return (
    <section className="card docs" style={{ gridColumn: "span 12" }} id="photos-chantier">
      <div className="card-h">
        <h3>
          <Ic n="cam" />
          Photos de chantier
          {photos.length > 0 && <small style={{ fontWeight: 500 }}> · {photos.length}</small>}
        </h3>
        <Link className="btn ghost sm" href={`/terrain/dossier/${dossierId}`}>
          Ouvrir dans l&apos;outil terrain
        </Link>
      </div>
      {photos.length === 0 ? (
        <p className="sub">Aucune photo pour ce dossier. Les déménageurs les envoient depuis l&apos;outil terrain, le jour du chantier.</p>
      ) : (
        <GalerieClient photos={photos} />
      )}
    </section>
  );
}
