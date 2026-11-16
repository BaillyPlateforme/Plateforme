import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CATALOG } from "@/lib/catalog";
import { currentUser } from "@/crm/lib/auth";
import { chargerSaisie, objetsDejaSaisis } from "@/crm/visites/donnees";
import Saisie from "@/crm/visites/tablette/Saisie";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saisie de la visite" };

/** La saisie d'une visite en cours. Signée, elle ne se modifie plus : on montre son compte-rendu. */
export default async function PageSaisie({ params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  const id = Number((await params).id);
  const s = await chargerSaisie(id);
  if (!s) notFound();
  if (s.visite.statut === "signee") redirect(`/tablette/${id}/signature`);
  const depart = s.etapes.find((e) => e.genre === "depart" && e.adresse?.trim());
  // Le vocabulaire déjà saisi par l'équipe : une suggestion de plus, jamais un blocage.
  const historique = await objetsDejaSaisis().catch(() => []);

  return (
    <Saisie
      visiteId={id}
      initiale={{ pieces: s.pieces, objets: s.objets, etapes: s.etapes, remarques: s.visite.remarques, options: s.visite.options, formule: s.visite.formule }}
      volumeInitial={s.dossier.volume}
      majLe={s.visite.majLe}
      utilisateur={u.id}
      dossier={{ ref: s.dossier.ref, client: s.dossier.client, contact: s.dossier.contact, telephone: s.dossier.telephone, adresse: depart?.adresse ?? null }}
      rdv={s.rdv}
      commercial={s.visite.commercial}
      photos={s.photos.map((p) => ({ id: p.id, cle: p.cle, piece: p.piece, vignette: p.vignette }))}
      catalogue={CATALOG}
      historique={historique}
      destinations={s.destinations}
    />
  );
}
