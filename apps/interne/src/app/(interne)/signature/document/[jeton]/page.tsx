import { getDossier } from "@/crm/lib/data";
import { q1 } from "@/crm/lib/db";
import DevisBailly from "@/crm/documents/DevisBailly";
import { AjusterA4 } from "@/crm/documents/AjusterA4";
import { devisPourDocument, lireParametres } from "@/crm/devis/donnees";
import { effectifs } from "@/crm/devis/parametres";
import { cgvDuClient } from "@/crm/devis/cgv";
import { noterSignatureVue } from "@/crm/suivi/signature";
import { devisDuLienDocument } from "@/lib/espace-client/document-devis";
import { TEL_AGENCE } from "@/lib/messaging";
import { Imprimer } from "./Imprimer";
import s from "./document.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: { absolute: "Votre devis — Bailly Déménagement" },
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

/*
 * Le devis complet, ouvert depuis « Mes devis » de l'espace client : le même
 * document que celui qu'imprime le CRM et que montre la page de signature,
 * avec les CGV que le client accepte. Page publique, rangée sous /signature/
 * (que le proxy laisse passer sans session) : seul un lien signé de l'espace
 * client l'ouvre, pour deux heures (lib/espace-client/document-devis.ts).
 * On n'y signe pas : la signature se fait dans l'espace.
 */
export default async function DocumentDevis({ params }: { params: Promise<{ jeton: string }> }) {
  const id = devisDuLienDocument((await params).jeton);
  const v = id ? await q1<{ id: number; dossier_id: number; ref: string; numero: string }>(
    "select v.id, v.dossier_id, d.ref, v.numero from devis v join dossiers d on d.id = v.dossier_id where v.id = $1 and v.statut <> 'brouillon'", [id]) : undefined;
  const dossier = v ? await getDossier(v.dossier_id) : null;

  if (!v || !dossier) {
    return (
      <div className={s.page}>
        <Bandeau />
        <main className={s.introuvable}>
          <h1>Ce lien a expiré</h1>
          <p>Pour votre sécurité, le lien du devis ne reste valable que deux heures. Rouvrez-le depuis « Mes devis » de votre espace client, ou appelez l&apos;agence au {TEL_AGENCE}.</p>
        </main>
      </div>
    );
  }

  // « A consulté son devis » au suivi de l'e-mail du devis (jamais quand c'est l'équipe qui l'ouvre).
  await noterSignatureVue({ id: v.id, dossier_id: v.dossier_id, ref: v.ref });
  const [devis, parametres] = await Promise.all([devisPourDocument(v.dossier_id), lireParametres()]);
  const eff = effectifs(parametres);
  const complet = devis.find((x) => x.id === v.id);
  const arrhesPct = complet?.arrhes_pct != null ? Number(complet.arrhes_pct) : eff.arrhesPct;

  return (
    <div className={s.page}>
      <style>{"@page{size:A4;margin:0}"}</style>
      <Bandeau imprimer />
      <p className={s.intro}>
        Votre devis <b>{v.numero}</b> (dossier {v.ref}), tel que Bailly Déménagement l&apos;a établi, suivi des conditions générales de vente.
      </p>
      <div className={s.document}>
        <AjusterA4>
          <DevisBailly d={{ ...dossier, devis: devis.filter((x) => x.id === v.id) }} devisId={v.id} parametres={{ cgv: cgvDuClient(parametres.cgv).texte, tvaAssurance: eff.tvaAssurance, arrhesPct }} />
        </AjusterA4>
      </div>
    </div>
  );
}

function Bandeau({ imprimer = false }: { imprimer?: boolean }) {
  return (
    <header className={s.bandeau}>
      <div className={s.interieur}>
        {/* eslint-disable-next-line @next/next/no-img-element -- logo de la marque, servi tel quel */}
        <img src="/marque/bailly-logo-blanc.svg" alt="Bailly Déménagement" />
        {imprimer && <Imprimer className={s.imprimer} />}
      </div>
    </header>
  );
}
