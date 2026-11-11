"use client";

import ApercuDevis from "@/components/ApercuDevis";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { RequestDetail as Detail } from "@/lib/requests";
import type { DevisStatus } from "@/lib/types";
import { DEVIS_ORDER, DEVIS_STATUS, scoreColor, sourceLabel, isIncomplete, missingFields, espaceLabel, parcoursBadge, traceDeLaDemande } from "../status";
import { espaceDeLaDemande, volumeChiffre } from "@/lib/espaces";
import { updateStatus, updateScores } from "@/lib/actions/requests";
import { envoyerDansCreagidem } from "@/crm/creagidem/actions";
import type { EvenementCreagidem } from "@/lib/creagidem";
import { deleteDevis, updateDevisStatus } from "@/lib/actions/devis";
import TrajetMap from "@/components/TrajetMap";
import LigneParcours from "@/crm/parcours/LigneParcours";
import DecisionDemande from "@/crm/parcours/DecisionDemande";
import type { Etape } from "@/crm/parcours/etapes";
import Radar from "@/crm/demandes/Radar";
import { AXES, basePrestige, type Araignee } from "@/crm/demandes/araignee";
import MenuActions from "@/ui/MenuActions";
import { Icone, type NomIcone } from "@/ui/icones";
import EnTeteSection from "../EnTeteSection";
import s from "./demande.module.css";

const TABS = ["Infos", "Analyse", "Trajet", "Volume & photos", "Devis", "Messages", "Historique"] as const;
type Tab = (typeof TABS)[number];
const ICONES: Record<Tab, NomIcone> = {
  Infos: "questionnaires",
  Analyse: "stats",
  Trajet: "camion",
  "Volume & photos": "caisse",
  Devis: "devis",
  Messages: "courrier",
  Historique: "horloge",
};

const recueLe = (iso: string) =>
  `${new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })} à ${new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}`;

/*
 * La page d'une demande du site, première étape du Parcours (unification du
 * 08/11/2026) : la même forme que la page d'un dossier.
 *
 *  - Le bandeau : le nom du client, « Demande du site · reçue le … », ses
 *    coordonnées et ses repères ; l'historique du client, et « ⋯ » (archiver).
 *    Une demande acceptée y mène à son dossier.
 *  - À cheval sur la bande, la carte du parcours de A à Z, la même que sur
 *    la page d'un dossier (crm/parcours/LigneParcours) : « Demande » en cours,
 *    son détail dit où en est la demande (nouvelle, en analyse, qualifiée),
 *    les étapes du dossier à venir. À son pied, la décision : accepter (le
 *    dossier et l'espace client) ou refuser (perdue). Acceptée, la carte
 *    montre le parcours de son dossier.
 *  - Dessous, le détail de la demande en onglets : infos et évaluation,
 *    analyse, trajet, volume et photos, devis, messages, historique.
 *
 * Plus de frise de statuts propre à la demande (Nouvelle → Gagnée) : « Devis
 * envoyé » et « Gagnée » sont des étapes du dossier.
 */
export default function RequestDetail({
  detail,
  photoUrls,
  espaceClient,
  dossierCrm,
  parcours,
  araignee,
  creagidem,
}: {
  detail: Detail;
  photoUrls: Record<string, string>;
  /** Le dossier de l'espace client déjà ouvert pour cette demande, s'il y en a un. */
  espaceClient: { id: string; reference: string } | null;
  /** Le dossier du CRM créé depuis cette demande, s'il y en a un. */
  dossierCrm: { id: number; ref: string; statut: string } | null;
  /** Les étapes du parcours : celles du dossier si la demande est acceptée, sinon la demande en première étape. */
  parcours: { etapes: Etape[]; perdu: boolean; dossier: boolean };
  /** L'araignée de la demande (six axes), celle de Demandes › Top demandes. */
  araignee: Araignee | null;
  /** Créagidem : le dernier passage de la demande, et si une fiche partirait vraiment (garde-fou). */
  creagidem: EtatCreagidem;
}) {
  const { request: r } = detail;
  const [tab, setTab] = useState<Tab>("Infos");
  const espace = espaceDeLaDemande(r);
  const trace = { ...r, ...traceDeLaDemande(r, espace?.nom) };
  const missing = missingFields(trace);
  const badge = parcoursBadge(trace);
  const analysee = detail.events.some((e) => e.type === "analysis") || r.score_potentiel != null;
  const client = r.client_nom ?? r.client_email ?? "Demande";

  return (
    <div className={s.page}>
      {/* L'en-tête, au nom du client : le bandeau commun, comme la page d'un dossier. */}
      <EnTeteSection
        propre
        surtitre={`Demande du site · reçue le ${recueLe(r.created_at)}`}
        titre={client}
        texte={[r.client_tel, r.client_email].filter(Boolean).join(" · ")}
        etiquettes={[
          sourceLabel(r.source),
          espace && espaceLabel(espace.nom),
          badge,
          (r.depart_ville || r.arrivee_ville) && `${r.depart_ville ?? "?"} → ${r.arrivee_ville ?? "?"}`,
          r.volume_m3 != null && `${r.volume_m3} m³`,
          isIncomplete(trace) ? "Incomplète" : "Complète",
        ]}
        action={dossierCrm ? { label: `Dossier ${dossierCrm.ref}`, href: `/dossiers/${dossierCrm.id}`, icone: "fleche" } : undefined}
      >
        {/* L'historique de l'adresse e-mail (toutes ses demandes, ses devis, sa fiche) : l'ancienne liste « Clients du site » y menait. */}
        {r.client_email && (
          <Link href={`/dashboard/clients/${encodeURIComponent(r.client_email)}`} data-ton="contour">
            Historique du client
          </Link>
        )}
        {/* Archiver : sortir une demande du parcours sans la dire perdue (doublon, essai…) ; elle se rouvre depuis la carte. */}
        {!dossierCrm && r.status !== "archived" && (
          <MenuActions>
            <form action={updateStatus.bind(null, r.id, "archived")}>
              <button>Archiver la demande</button>
            </form>
          </MenuActions>
        )}
      </EnTeteSection>

      <LigneParcours
        etapes={parcours.etapes}
        perdu={parcours.perdu}
        perduTexte={parcours.dossier ? "Dossier perdu" : r.status === "archived" ? "Demande archivée" : "Demande perdue"}
        pied={<DecisionDemande demande={{ id: r.id, client }} statut={r.status} analysee={analysee} dossier={dossierCrm} espace={espaceClient} />}
      />

      {/* Ce qui manque */}
      {missing.length > 0 && <MissingBanner missing={missing} token={r.completion_token} />}

      {/* Le détail de la demande, en onglets : la barre de la fiche d'un dossier. */}
      <nav className={s.barre} role="tablist" aria-label="Détail de la demande">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={s.onglet} onClick={() => setTab(t)}>
            <Icone nom={ICONES[t]} taille={16} />
            {t}
          </button>
        ))}
      </nav>

      <div className={s.panneau} role="tabpanel" aria-label={tab}>
        {tab === "Infos" && <InfosTab detail={detail} araignee={araignee} creagidem={creagidem} />}
        {tab === "Analyse" && <AnalyseTab detail={detail} />}
        {tab === "Trajet" && (
          <Card title="Trajet">
            <p className="-mt-2 mb-4 text-sm text-ink-soft">
              {r.depart_ville ?? "?"} → {r.arrivee_ville ?? "?"}
              {r.distance_km != null ? ` · ${r.distance_km} km` : ""}
            </p>
            <TrajetMap departVille={r.depart_ville} arriveeVille={r.arrivee_ville} distanceKm={r.distance_km} height={480} />
          </Card>
        )}
        {tab === "Volume & photos" && <VolumeTab detail={detail} photoUrls={photoUrls} />}
        {tab === "Devis" && <DevisTab detail={detail} />}
        {tab === "Messages" && <MessagesTab detail={detail} />}
        {tab === "Historique" && <TimelineTab detail={detail} />}
      </div>
    </div>
  );
}

/* ---------- Onglet Infos ---------- */

function InfosTab({ detail, araignee, creagidem }: { detail: Detail; araignee: Araignee | null; creagidem: EtatCreagidem }) {
  const r = detail.request;
  const [notes, setNotes] = useState(r.score_notes ?? "");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card title="Départ">
          <AddressBlock
            adresse={r.depart_adresse}
            cp={r.depart_code_postal}
            ville={r.depart_ville}
            etage={r.depart_etage}
            ascenseur={r.depart_ascenseur}
            type={r.type_logement_depart}
          />
        </Card>
        <Card title="Arrivée">
          <AddressBlock
            adresse={r.arrivee_adresse}
            cp={r.arrivee_code_postal}
            ville={r.arrivee_ville}
            etage={r.arrivee_etage}
            ascenseur={r.arrivee_ascenseur}
            type={r.type_logement_arrivee}
          />
        </Card>
        <Card title="Prestation">
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <Row
              k="Date souhaitée"
              v={
                r.date_souhaitee
                  ? new Date(`${String(r.date_souhaitee).slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                  : "à définir"
              }
            />
            <Row k="Flexibilité" v={r.flexibilite ?? "—"} />
            <Row k="Formule" v={r.formule ?? "—"} />
            <Row k="Distance" v={r.distance_km != null ? `${r.distance_km} km` : "—"} />
            <Row
              k="Services"
              v={
                Object.entries(r.services ?? {})
                  .filter(([, v]) => v)
                  .map(([k]) => k.replace("_", "-"))
                  .join(", ") || "—"
              }
            />
          </dl>
        </Card>
        <CarteCreagidem requestId={r.id} etat={creagidem} modifieeLe={detail.events.filter((e) => e.type === "modified").map((e) => e.created_at).sort().at(-1) ?? null} />
      </div>

      {/* Évaluation automatique (lecture seule) + notes */}
      <Card title="Évaluation">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-paper p-3">
              <div className="eyebrow text-ink-soft">Potentiel</div>
              <div className={`mt-1 font-serif text-2xl ${scoreColor(r.score_potentiel)}`}>{r.score_potentiel ?? "—"}<span className="text-sm text-ink-soft">/100</span></div>
            </div>
            <div className="rounded-xl border border-line bg-paper p-3">
              <div className="eyebrow text-ink-soft">Difficulté</div>
              <div className={`mt-1 font-serif text-2xl ${scoreColor(r.score_difficulte)}`}>{r.score_difficulte ?? "—"}<span className="text-sm text-ink-soft">/100</span></div>
            </div>
          </div>
          <p className="text-xs text-ink-soft">Calculé automatiquement à la qualification. Détail dans l&apos;onglet <span className="font-medium text-ink">Analyse</span>.</p>
          {/* L'araignée de la demande : la même que dans Demandes › Top demandes, six axes de 0 (centre) à 100 (bord). */}
          {araignee && (
            <div className={s.araignee}>
              <Radar araignee={araignee} taille={290} libelles />
              <p className={s.prestige}>{basePrestige(araignee.prestige)}</p>
              <details className={s.regles}>
                <summary>Comment se lit l&apos;araignée</summary>
                <dl>
                  {AXES.map((x) => (
                    <div key={x.cle}>
                      <dt>{x.label}</dt>
                      <dd>{x.regle}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Notes internes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Contexte, points d'attention…"
            />
          </div>
          <button
            onClick={() =>
              start(async () => {
                await updateScores(r.id, r.score_potentiel, r.score_difficulte, notes || null);
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
              })
            }
            disabled={pending}
            className="w-full rounded-xl border border-line-strong px-4 py-2 text-sm font-medium transition hover:bg-subtle disabled:opacity-50"
          >
            {pending ? "…" : saved ? "Enregistré ✓" : "Enregistrer les notes"}
          </button>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Onglet Volume ---------- */

function VolumeTab({ detail, photoUrls }: { detail: Detail; photoUrls: Record<string, string> }) {
  const { request: r, items, photos } = detail;
  // La cote de l'espace pro : le client déclare un volume, le chiffrage en
  // retient un autre. L'équipe voit les deux ; le client, jamais le second.
  const espace = espaceDeLaDemande(r);
  const cote = espace?.ajustement_volume ?? 0;
  const retenu = r.volume_m3 != null && cote !== 0 ? volumeChiffre(Number(r.volume_m3), cote) : null;
  // Un volume déduit du logement est enregistré comme déclaré : la description
  // qui l'accompagne dit à l'équipe que c'est un repère, pas un relevé.
  const repere = (r.raw_payload as { details?: { repere_logement?: { resume?: string } } } | null)?.details
    ?.repere_logement?.resume;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-soft">{retenu != null ? "Volume déclaré" : "Volume total"}</div>
          <div className="font-serif text-4xl">
            {r.volume_m3 ?? "—"} <span className="text-xl text-ink-soft">m³</span>
          </div>
        </div>
        {retenu != null && (
          <div className="border-l border-line pl-6">
            <div className="text-xs uppercase tracking-wide text-ink-soft">Volume chiffré</div>
            <div className="font-serif text-4xl">
              {retenu} <span className="text-xl text-ink-soft">m³</span>
            </div>
          </div>
        )}
        <div className="rounded-full bg-paper px-3 py-1 text-sm text-ink-soft">
          Méthode : {r.volume_method === "ai" ? "photos (IA)" : r.volume_method === "list" ? "liste" : r.volume_method === "explicit" ? (repere ? `estimé d'après le logement (${repere})` : "déclaré") : "—"}
        </div>
      </div>
      {retenu != null && espace && (
        <p className="max-w-[70ch] rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink-soft">
          <span className="font-medium text-ink">
            {cote > 0 ? "Cote" : "Décote"} de {cote > 0 ? "+" : "−"}{Math.abs(cote)} % — espace {espaceLabel(espace.nom)}.
          </span>{" "}
          Le prix est calculé sur {retenu} m³. Le client, lui, ne voit que le volume qu&apos;il a déclaré : ni la cote ni le volume
          chiffré n&apos;apparaissent dans son espace, son mail ou son devis.
        </p>
      )}

      {items.length > 0 && (
        <Card title="Inventaire">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line/70">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="py-2">{it.label}</td>
                  <td className="py-2 text-right tabular-nums text-ink-soft">×{it.quantite}</td>
                  <td className="py-2 text-right tabular-nums">
                    {(it.quantite * it.volume_unitaire_m3).toFixed(1)} m³
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {photos.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {photos.map((p) => (
            <Card key={p.id} title={p.piece ?? "Pièce"}>
              {photoUrls[p.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrls[p.id]}
                  alt={p.piece ?? ""}
                  className="mb-3 aspect-video w-full rounded-xl object-cover"
                />
              )}
              <div className="mb-2 text-right font-serif text-xl">{p.volume_m3} m³</div>
              <ul className="space-y-1 text-sm text-ink-soft">
                {p.ai_analysis?.objets?.map((o, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{o.quantite}× {o.label}</span>
                    <span className="tabular-nums">{o.volume_m3} m³</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {items.length === 0 && photos.length === 0 && (
        <div className="rounded-xl border border-dashed border-line p-8 text-center text-ink-soft">
          Volume renseigné sans détail.
        </div>
      )}
    </div>
  );
}

/* ---------- Onglet Devis ---------- */

function DevisTab({ detail }: { detail: Detail }) {
  const r = detail.request;
  const devis = detail.devis;
  const router = useRouter();
  const [pending, start] = useTransition();
  const complete = r.volume_m3 != null && !!r.depart_ville && !!r.arrivee_ville;

  if (!devis) {
    return (
      <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
        {complete
          ? "Le devis est en cours de génération…"
          : "Le devis PDF est généré automatiquement dès que la demande est complète (volume + adresses)."}
      </div>
    );
  }

  const lignes = Array.isArray(devis.lignes) ? devis.lignes : [];
  // Le statut et la suppression du devis : ce que faisait l'ancienne liste « Devis du site ».
  const changerStatut = (s: DevisStatus) =>
    start(async () => {
      await updateDevisStatus(devis.id, s);
      router.refresh();
    });
  const supprimer = () => {
    if (!window.confirm(`Supprimer le devis ${devis.reference} ?`)) return;
    start(async () => {
      await deleteDevis(devis.id);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card title="Détail du devis">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line/70">
              {lignes.map((l, i) => (
                <tr key={i}>
                  <td className="py-2 text-ink-soft">{l.label}</td>
                  <td className="py-2 text-right tabular-nums">{l.amount.toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line">
                <td className="py-2 text-ink-soft">Total HT</td>
                <td className="py-2 text-right tabular-nums">{devis.montant_ht.toFixed(2)} €</td>
              </tr>
              <tr>
                <td className="py-1 text-ink-soft">TVA</td>
                <td className="py-1 text-right tabular-nums">{devis.montant_tva.toFixed(2)} €</td>
              </tr>
              <tr>
                <td className="pt-2 font-serif text-lg">Total TTC</td>
                <td className="pt-2 text-right font-serif text-lg text-accent tabular-nums">{devis.montant_ttc.toFixed(2)} €</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title={`Devis ${devis.reference}`}>
          <div className="font-serif text-3xl text-accent">
            {Math.round(devis.montant_ttc).toLocaleString("fr-FR")} €<span className="ml-1 text-sm text-ink-soft">TTC</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={devis.status}
              disabled={pending}
              onChange={(e) => changerStatut(e.target.value as DevisStatus)}
              aria-label="Statut du devis"
              className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none ${DEVIS_STATUS[devis.status]?.className ?? ""}`}
            >
              {DEVIS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {DEVIS_STATUS[s].label}
                </option>
              ))}
            </select>
            {devis.valid_until && (
              <span className="text-xs text-ink-soft">valable jusqu&apos;au {new Date(devis.valid_until).toLocaleDateString("fr-FR")}</span>
            )}
            <button onClick={supprimer} disabled={pending} className="ml-auto text-xs text-ink-soft transition hover:text-accent disabled:opacity-50">
              Supprimer
            </button>
          </div>
          <div className="mt-4">
            <ApercuDevis devisId={devis.id} reference={devis.reference} ouvert hauteur={560} />
          </div>
          <p className="mt-3 text-[11px] text-ink-soft">Généré automatiquement à la qualification de la demande.</p>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Informations manquantes ---------- */

type MsgPayload = { channel?: string; template?: string; rule?: string; to?: string; status?: string; erreur?: string | null };

/* ---------- Onglet Analyse (qualification notée) ---------- */

type QualifLine = { key: string; label: string; note: number; poids: number; contribution: number; detail: string };
type QualifPayload = { score: number; difficulte: number; lines: QualifLine[] };

function AnalyseTab({ detail }: { detail: Detail }) {
  const r = detail.request;
  const evt = detail.events.find((e) => e.type === "analysis");
  const complete = r.volume_m3 != null && !!r.depart_ville && !!r.arrivee_ville;

  if (!evt) {
    return (
      <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
        {complete
          ? "Analyse en cours de génération…"
          : "L'estimation et l'évaluation /100 sont générées automatiquement dès que la demande est complète (volume + adresses)."}
      </div>
    );
  }

  const p = (evt.payload ?? {}) as QualifPayload;
  return (
    <div className="space-y-6">
      <div className="grid items-center gap-5 rounded-[18px] bg-card p-6 sm:grid-cols-[auto_1fr]">
        <ScoreRing score={p.score} />
        <div>
          <div className="font-serif text-2xl">Note de qualification</div>
          <p className="mt-1 text-sm text-ink-soft">
            Score global pondéré sur {p.lines?.length ?? 0} critères. Difficulté estimée : <span className="font-medium text-ink">{p.difficulte}/100</span>.
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {(p.lines ?? []).map((l) => (
          <div key={l.key} className="rounded-xl border border-line bg-card p-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="font-medium">{l.label}</span>
              <span className="text-xs text-ink-soft">{l.detail}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
                <div className="h-full rounded-full bg-accent" style={{ width: `${l.note}%` }} />
              </div>
              <span className={`w-9 text-right text-sm font-medium tabular-nums ${scoreColor(l.note)}`}>{l.note}</span>
              <span className="w-16 text-right text-[11px] text-ink-soft">poids {l.poids}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(100, score)) / 100);
  const col = score >= 70 ? "var(--color-good)" : score >= 40 ? "#d97706" : "var(--color-accent)";
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={R} fill="none" stroke="var(--color-line)" strokeWidth="7" />
        <circle cx="40" cy="40" r={R} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-3xl leading-none">{score}</span>
        <span className="text-[10px] text-ink-soft">/ 100</span>
      </div>
    </div>
  );
}

/* ---------- Onglet Messages (emails / SMS envoyés) ---------- */

function MessagesTab({ detail }: { detail: Detail }) {
  const msgs = detail.events.filter((e) => e.type === "message");
  if (msgs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
        Aucun email ni SMS envoyé pour cette demande.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {msgs.map((e) => {
        const p = (e.payload ?? {}) as MsgPayload;
        const failed = p.status === "echec";
        const ignored = p.status === "ignore";
        return (
          <div key={e.id} className="flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3">
            <span className="text-lg">{p.channel === "sms" ? "💬" : "✉️"}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.template ?? p.rule}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${failed ? "bg-warn/15 text-warn" : ignored ? "bg-subtle text-ink-soft" : "bg-good/15 text-good"}`}>
                  {failed ? "échec" : ignored ? "non envoyé" : "envoyé"}
                </span>
                <span className="text-[11px] uppercase text-ink-soft">{p.channel}</span>
              </div>
              <div className="mt-0.5 text-xs text-ink-soft">
                {p.to ? `→ ${p.to} · ` : ""}
                {new Date(e.created_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" })}
              </div>
              {(failed || ignored) && p.erreur && <div className="mt-1 text-xs text-warn">{p.erreur}</div>}
              {p.rule && p.rule !== p.template && <div className="mt-0.5 text-[11px] text-ink-soft/70">Règle : {p.rule}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MissingBanner({ missing, token }: { missing: string[]; token: string | null }) {
  return (
    <div className={s.manque}>
      <b>Informations manquantes :</b>
      {missing.map((m) => (
        <span key={m}>{m}</span>
      ))}
      {token && (
        <a href={`/completer/${token}`} target="_blank" rel="noreferrer">
          Ouvrir le lien de complétion ↗
        </a>
      )}
    </div>
  );
}

/* ---------- Créagidem ---------- */

type EtatCreagidem = { envoie: boolean; environnement: string; motif: string | null; dernier: (EvenementCreagidem & { le: string }) | null };

const STATUT_CREAGIDEM: Record<EvenementCreagidem["statut"], { libelle: string; ton: string }> = {
  envoyee: { libelle: "Envoyée", ton: "bg-good-soft text-good" },
  preparee: { libelle: "Préparée, non envoyée", ton: "bg-paper text-ink-soft" },
  incomplete: { libelle: "En attente de la demande complète", ton: "bg-warn-soft text-warn" },
  echec: { libelle: "Refusée par Créagidem", ton: "bg-danger-soft text-danger" },
};

/**
 * La fiche Créagidem de la demande (lib/creagidem) : où elle en est, la fiche
 * telle qu'elle part, et « Envoyer dans Créagidem ». Hors production, le
 * garde-fou le dit : rien ne part, la fiche est seulement préparée.
 */
function CarteCreagidem({ requestId, etat, modifieeLe }: { requestId: string; etat: EtatCreagidem; modifieeLe: string | null }) {
  const d = etat.dernier;
  const [pending, start] = useTransition();
  const router = useRouter();
  const statut = d ? STATUT_CREAGIDEM[d.statut] : null;
  const quand = d ? new Date(d.le).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }) : null;
  const libelleBouton = !etat.envoie ? "Préparer la fiche" : d?.statut === "envoyee" ? "Renvoyer dans Créagidem" : "Envoyer dans Créagidem";
  return (
    <Card title="Créagidem">
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {statut ? (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statut.ton}`}>{statut.libelle}</span>
          ) : (
            <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-ink-soft">Pas encore préparée</span>
          )}
          {quand && (
            <span className="text-xs text-ink-soft">
              le {quand} · {d!.origine === "manuel" ? `par ${d!.par ?? "l'équipe"}` : "automatiquement"} · {d!.environnement}
            </span>
          )}
        </div>
        {d?.motif && <p className="text-ink-soft">{d.motif}</p>}
        {d?.statut === "envoyee" && modifieeLe && modifieeLe > d.le && (
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
            Le client a modifié sa demande après l&apos;envoi : la fiche de Créagidem n&apos;est plus à jour. « Renvoyer dans Créagidem » crée une seconde fiche.
          </p>
        )}
        {d?.statut === "echec" && d.reponse && <p className="text-xs text-danger">Réponse de Créagidem : {d.reponse}</p>}
        {!etat.envoie && etat.motif && (!d || d.motif !== etat.motif) && <p className="text-ink-soft">{etat.motif}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            className="rounded-full border border-line bg-card px-4 py-1.5 text-sm font-semibold hover:border-ink disabled:opacity-50"
            onClick={() => {
              if (etat.envoie && d?.statut === "envoyee" && !confirm("Cette demande est déjà dans Créagidem. La renvoyer créera une seconde fiche. Continuer ?")) return;
              start(async () => {
                await envoyerDansCreagidem(requestId);
                router.refresh();
              });
            }}
          >
            {pending ? "Un instant…" : libelleBouton}
          </button>
          {!etat.envoie && <span className="text-xs text-ink-soft">Rien ne part vers Créagidem depuis cet environnement.</span>}
        </div>
        {d?.fiche && (
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-ink-soft">Voir la fiche {d.statut === "envoyee" ? "envoyée" : "préparée"}</summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-paper p-3 text-[11px] leading-relaxed">{JSON.stringify(d.fiche, null, 2)}</pre>
          </details>
        )}
      </div>
    </Card>
  );
}

/* ---------- Onglet Historique ---------- */

function TimelineTab({ detail }: { detail: Detail }) {
  // Les envois email/SMS ont leur propre onglet « Messages ».
  const events = detail.events.filter((e) => e.type !== "message" && e.type !== "jeton_modification");
  if (events.length === 0)
    return <div className="text-sm text-ink-soft">Aucun événement.</div>;
  return (
    <div className="relative space-y-4 pl-6">
      <div className="absolute inset-y-1 left-[7px] w-px bg-line" />
      {events.map((e) => {
        const p = (e.payload ?? {}) as { manque?: string[]; rempli?: { champ: string; valeur: string }[]; changes?: { champ: string; avant: string; apres: string }[] };
        const incomplete = e.type === "incomplete";
        const completed = e.type === "completed";
        const modifiee = e.type === "modified";
        return (
          <div key={e.id} className="relative">
            <div className={`absolute -left-6 top-1.5 h-3.5 w-3.5 rounded-full border-2 bg-card ${incomplete ? "border-warn/60" : completed ? "border-good" : "border-accent"}`} />
            <div className="text-sm font-medium">{eventLabel(e.type)}</div>

            {incomplete && Array.isArray(p.manque) && p.manque.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.manque.map((m) => (
                  <span key={m} className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">manque : {m}</span>
                ))}
              </div>
            )}

            {modifiee && (
              <div className="mt-1 space-y-0.5 text-xs">
                {Array.isArray(p.changes) && p.changes.length > 0 ? (
                  p.changes.map((c, i) => (
                    <div key={i} className="text-ink-soft">
                      {c.champ} : <span className="line-through">{c.avant}</span> → <span className="text-ink">{c.apres}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-ink-soft">Renvoyée sans changement des informations principales.</div>
                )}
              </div>
            )}

            {completed && (
              <div className="mt-1 space-y-0.5 text-xs">
                {Array.isArray(p.rempli) && p.rempli.length > 0 ? (
                  p.rempli.map((r, i) => (
                    <div key={i} className="text-ink-soft">✓ {r.champ} : <span className="text-ink">{r.valeur}</span></div>
                  ))
                ) : (
                  <div className="text-ink-soft">Informations confirmées.</div>
                )}
              </div>
            )}

            <div className="text-xs text-ink-soft">
              {new Date(e.created_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function eventLabel(type: string): string {
  const map: Record<string, string> = {
    created: "Demande créée",
    status_changed: "Statut modifié",
    scored: "Évaluation mise à jour",
    estimated: "Estimation calculée",
    note: "Note ajoutée",
    message: "Message envoyé",
    incomplete: "Demande incomplète",
    completed: "Demande complétée",
    rappel: "Demande de rappel",
    analysis: "Analyse de la demande",
    creagidem: "Créagidem",
    modified: "Modifiée par le client depuis son estimation",
  };
  return map[type] ?? type;
}

/* ---------- Primitives ---------- */

/** Une carte du détail, au dessin des sections de la fiche d'un dossier. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={s.carte}>
      <h3 className={s.carteTitre}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-ink-soft">{k}</dt>
      <dd className="text-right text-ink">{v}</dd>
    </>
  );
}

function AddressBlock({
  adresse,
  cp,
  ville,
  etage,
  ascenseur,
  type,
}: {
  adresse: string | null;
  cp: string | null;
  ville: string | null;
  etage: number | null;
  ascenseur: boolean | null;
  type: string | null;
}) {
  return (
    <div className="text-sm">
      <div className="text-ink">{adresse ?? "—"}</div>
      <div className="text-ink-soft">
        {cp} {ville}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {type && <span className="rounded-full bg-paper px-2 py-0.5">{type}</span>}
        <span className="rounded-full bg-paper px-2 py-0.5">Étage {etage ?? 0}</span>
        <span className="rounded-full bg-paper px-2 py-0.5">
          {ascenseur ? "Avec ascenseur" : "Sans ascenseur"}
        </span>
      </div>
    </div>
  );
}
