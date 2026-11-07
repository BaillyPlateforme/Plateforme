"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { ouvrirEspaceDepuisDemande } from "@/crm/actions-espace";

/**
 * Le bouton qui fait entrer une demande du site dans le CRM : il crée le
 * dossier du CRM (client, trajet, volume) s'il n'existe pas, puis ouvre
 * l'espace client par le même chemin que la fiche du dossier. Ce que la
 * demande ne dit pas — le mois prévu, le commercial — se complète sur la
 * fiche du dossier, qui s'ouvre aussitôt.
 */
export default function VersLeCrm({
  requestId,
  dossierCrm,
  espaceClient,
}: {
  requestId: string;
  dossierCrm: { id: number; ref: string } | null;
  espaceClient: { id: string; reference: string } | null;
}) {
  const etapes = [
    { fait: !!dossierCrm, titre: "Dossier dans le CRM", detail: dossierCrm ? dossierCrm.ref : "Client, trajet et volume repris de la demande" },
    { fait: !!espaceClient, titre: "Espace client", detail: espaceClient ? `Ouvert · ${espaceClient.reference}` : "Devis, documents, cartons et SAV pour le client" },
  ];

  return (
    <section className="mt-6 overflow-hidden rounded-[18px] bg-nuit text-white" aria-label="Le dossier de cette demande">
      <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">Un dossier, deux faces</p>
          <h2 className="mt-1 text-[20px] font-semibold leading-tight">
            {espaceClient ? "Cette demande a son dossier et son espace client" : dossierCrm ? "Le dossier existe dans le CRM : ouvrez l'espace du client" : "Faire entrer cette demande dans le CRM"}
          </h2>
          <ol className="mt-4 flex flex-wrap gap-3">
            {etapes.map((e, i) => (
              <li key={e.titre} className="flex items-center gap-3 rounded-xl bg-white/[0.07] px-3.5 py-2.5">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${e.fait ? "bg-brand text-nuit" : "bg-white/15 text-white"}`}>{e.fait ? "✓" : i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{e.titre}</span>
                  <span className="block text-[12px] text-white/65">{e.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {dossierCrm && (
            <Link href={`/dossiers/${dossierCrm.id}#espace-client`} className="rounded-xl border border-white/25 px-4 py-2.5 text-[13.5px] font-medium transition hover:border-white">
              Dossier CRM · {dossierCrm.ref}
            </Link>
          )}
          {espaceClient ? (
            <Link href={`/dashboard/espace-client/dossiers/${espaceClient.id}`} className="rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-nuit transition hover:bg-brand-mid">
              Fiche de l&apos;espace client
            </Link>
          ) : (
            <form action={ouvrirEspaceDepuisDemande.bind(null, requestId)}>
              <Envoyer libelle={dossierCrm ? "Ouvrir l'espace client" : "Créer le dossier et ouvrir l'espace client"} />
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Envoyer({ libelle }: { libelle: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-nuit transition hover:bg-brand-mid disabled:opacity-60">
      {pending ? "Création du dossier…" : libelle}
    </button>
  );
}
