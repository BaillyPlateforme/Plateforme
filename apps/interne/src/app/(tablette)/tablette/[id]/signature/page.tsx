import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/crm/lib/auth";
import { q, q1 } from "@/crm/lib/db";
import { contenuDe, empreinteDe } from "@/crm/visites/compte-rendu";
import { chargerSaisie } from "@/crm/visites/donnees";
import Recapitulatif from "@/crm/visites/tablette/Recapitulatif";
import Signature from "@/crm/visites/tablette/Signature";
import { empreinteLisible, momentVisite, type ContenuCompteRendu } from "@/lib/visite/regles";
import { Picto } from "@/terrain/composants/Picto";
import s from "@/crm/visites/tablette/tablette.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Compte-rendu" };

/*
 * Le compte-rendu de la visite, sur la tablette.
 *
 * Avant la signature : le récapitulatif que le client relit — le contenu
 * même que l'empreinte va sceller —, puis le cadre de signature. Après : le
 * compte-rendu figé, tel qu'il a été signé, et son PDF. Il ne se modifie
 * plus ; une nouvelle visite fera un nouveau compte-rendu.
 */
export default async function PageCompteRendu({ params }: { params: Promise<{ id: string }> }) {
  await currentUser();
  const id = Number((await params).id);
  const saisie = await chargerSaisie(id);
  if (!saisie) notFound();
  const signee = saisie.visite.statut === "signee";

  const figee = signee
    ? await q1<{ contenu: ContenuCompteRendu; signature: string; signe_le: Date; signataire: string; empreinte: string }>(
        "select contenu, signature, signe_le, signataire, empreinte from visites where id = $1",
        [id],
      )
    : null;
  const contenu = figee?.contenu ?? contenuDe(saisie);
  const empreinte = figee?.empreinte ?? empreinteDe(contenu);

  // Les vignettes, pièce par pièce : celles de la visite.
  const photos = new Map<string, number[]>();
  for (const p of await q<{ id: number; piece: string | null }>("select id, piece_cle::text as piece from visite_photos where visite_id = $1 order by prise_le, id", [id])) {
    if (p.piece) photos.set(p.piece, [...(photos.get(p.piece) ?? []), p.id]);
  }

  return (
    <div className={s.accueil}>
      <header className={s.barre}>
        <Link href={signee ? "/tablette" : `/tablette/${id}`} className={s.retour} aria-label={signee ? "Retour aux visites" : "Retour à la saisie"}>
          <Picto nom="retour" taille={22} />
        </Link>
        <div className={s.barreTitre}>
          <b>{signee ? "Compte-rendu signé" : "Relecture et signature"}</b>
          <span>
            {saisie.dossier.client} · {saisie.dossier.ref}
          </span>
        </div>
        {!signee && (
          <Link href={`/tablette/${id}`} className={s.boutonCr}>
            <Picto nom="note" taille={20} /> Modifier la saisie
          </Link>
        )}
      </header>

      <main className={s.cr}>
        {signee && figee && (
          <section className={s.signe}>
            <i>
              <Picto nom="coche" taille={34} />
            </i>
            <div>
              <h2>Signé par {figee.signataire}</h2>
              <p>
                Le {momentVisite(figee.signe_le, true)} (heure du serveur) · empreinte <b>{empreinteLisible(figee.empreinte, 4)}</b>
              </p>
              <p>Le compte-rendu est rattaché au dossier{saisie.visite.document ? " et rangé, en PDF, dans l'espace client" : ""}. Il ne se modifie plus.</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- l'image du tracé, gardée avec la signature */}
              <img className={s.signatureImage} src={figee.signature} alt={`Signature de ${figee.signataire}`} />
            </div>
            <div className={s.signeActions}>
              <a className={s.boutonPlein} href={`/api/visites/${id}/compte-rendu`} target="_blank" rel="noopener">
                <Picto nom="telecharger" taille={18} /> Le compte-rendu en PDF
              </a>
              <Link className={s.boutonDoux} href={`/dossiers/${saisie.visite.dossierId}#visite`}>
                Fiche du dossier
              </Link>
              <Link className={s.boutonDoux} href="/tablette">
                Visites du jour
              </Link>
            </div>
          </section>
        )}

        <Recapitulatif c={contenu} photos={photos} />

        {!signee && <Signature visiteId={id} empreinte={empreinte} nomPropose={(saisie.dossier.contact ?? saisie.dossier.client).replace(/^(Madame|Monsieur)\s+/, "")} />}
      </main>
    </div>
  );
}
