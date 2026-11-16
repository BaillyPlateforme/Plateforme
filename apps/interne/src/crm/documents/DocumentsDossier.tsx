/* eslint-disable @typescript-eslint/no-explicit-any -- les lignes SQL du CRM ne sont pas typées */
import { dateFr, eur, m3, nomClient, TYPES } from "@/crm/lib/format";
import { emballages } from "@/crm/lib/tarif";
import { telephoneEtLibelle, telLisible } from "@/crm/clients/telephones";
import { Cases, Encadre, FeuilleBailly, Section, Signatures, Tableau } from "./FeuilleBailly";
import { m3Client, volumeClient } from "./volume-client";

/*
 * Les documents imprimés d'un dossier, aux couleurs de Bailly : la fiche de
 * visite, la lettre de voiture (ordre de mission et quatre exemplaires) et la
 * proposition de sous-traitance. Même contenu qu'avant, rien d'inventé : ce
 * que le dossier contient.
 */

const GENRE: Record<string, string> = { depart: "Départ", garde_meuble: "Garde-meuble", arrivee: "Arrivée", autre: "Étape" };
const etage = (e: unknown) => {
  const t = String(e ?? "").trim();
  return !t ? "" : /^(rdc|0|rez)/i.test(t) ? "Rez-de-chaussée" : `Étage ${t}`;
};
const contact = (d: any) => [d.civilite, d.prenom, d.nom].filter(Boolean).join(" ");
const periode = (d: any) => d.periode ?? (d.date_chargement ? dateFr(d.date_chargement, { day: "numeric", month: "long", year: "numeric" }) : "À convenir");

/** Oui ou non, comme les cases de la fiche Créagidem. */
const ouiNon = (v: unknown) => (v ? "oui" : "non");

/**
 * Toutes les adresses du dossier, dans l'ordre du trajet — plusieurs
 * chargements et plusieurs livraisons compris —, chacune avec ce que la fiche
 * du premier appel en note (retours de Céline, 16/11/2026) : étage,
 * ascenseur et sa taille, monte-meubles, transbordement, portage, code
 * d'accès, surface habitable, accès en camion, précisions.
 */
function Itineraire({ d }: { d: any }) {
  const km = d.distance_km != null ? `${Number(d.distance_km).toLocaleString("fr-FR")} km par la route` : null;
  return (
    <Section titre={km ? `Itinéraire · ${km}` : "Itinéraire"}>
      <Tableau
        entetes={["Étape", "Adresse", "Accès"]}
        lignes={(d.stops as any[]).map((e) => [
          <b key="g">{GENRE[e.genre] ?? "Étape"}</b>,
          [e.adresse, [e.code_postal && !String(e.adresse ?? "").includes(e.code_postal) ? e.code_postal : null, e.ville && !String(e.adresse ?? "").toLowerCase().includes(String(e.ville).toLowerCase()) ? e.ville : null].filter(Boolean).join(" ")]
            .filter(Boolean)
            .join(" · ") || "—",
          e.genre === "garde_meuble"
            ? ""
            : [
                etage(e.etage),
                e.ascenseur ? `ascenseur : oui${e.ascenseur_taille ? ` (${e.ascenseur_taille} pers.)` : ""}` : "ascenseur : non",
                `monte-meubles : ${e.monte_meuble === "a_evaluer" ? "à évaluer" : ouiNon(e.monte_meuble === "oui")}`,
                `transbordement : ${ouiNon(e.transbordement)}`,
                `portage : ${ouiNon(e.portage)}${e.portage_m != null ? ` (${e.portage_m} m)` : ""}`,
                e.monte_charge ? "monte-charge" : null,
                e.code_acces ? `code d’accès : ${e.code_acces}` : null,
                e.surface_m2 != null ? `surface habitable : ${e.surface_m2} m²` : null,
                e.acces_camion ? `accès camion : ${e.acces_camion}` : null,
                e.acces,
              ]
                .filter(Boolean)
                .join(" · "),
        ])}
      />
    </Section>
  );
}

/** La fiche de visite : le client, l'itinéraire, l'inventaire et les emballages. */
export function FicheVisiteBailly({ d }: { d: any }) {
  const emb = emballages(d.volume);
  const pieces = [...new Set((d.inv as any[]).map((i) => i.piece))] as string[];
  return (
    <FeuilleBailly
      etiquette="Fiche de visite"
      titre={nomClient(d)}
      sousTitre={`Dossier ${d.ref} · ${TYPES[d.type] ?? ""}`}
      details={[d.commercial && `Commercial : ${d.commercial}`, d.origine_demande && `Origine : ${d.origine_demande}`]}
    >
      <Cases
        items={[
          {
            label: "Client",
            valeur: nomClient(d),
            // Tous ses téléphones, chacun avec ce qu'il désigne (la page d'impression les lit : telephonesDuClient).
            detail: [contact(d) !== nomClient(d) ? contact(d) : null, ...(d.telephones ?? (d.telephone ? [{ numero: telLisible(d.telephone), libelle: "" }] : [])).map(telephoneEtLibelle), d.email].filter(Boolean).join(" · ") || "—",
            fonce: true,
          },
          { label: "Période", valeur: periode(d), detail: "Pour tout le déménagement" },
          // Un CIMOB/DICOM : ses droits (le volume accordé par l'administration) ; le volume réel, pour l'équipe.
          d.volume_droits != null
            ? { label: "Droits", valeur: m3(Number(d.volume_droits)), detail: `Volume réel : ${m3(d.volume)}` }
            : { label: "Volume", valeur: m3(d.volume), detail: "Volume estimé" },
          { label: "Traité par", valeur: d.traite_par ?? "—", detail: d.commercial ? `Commercial : ${d.commercial}` : undefined },
        ]}
      />
      <Itineraire d={d} />
      {d.observations && (
        <Section titre="Observations">
          <Encadre>{d.observations}</Encadre>
        </Section>
      )}
      <Section titre={`Inventaire · ${m3(d.volume)}`}>
        {d.inv.length === 0 ? (
          <Encadre>Aucun objet saisi.</Encadre>
        ) : (
          <Tableau
            entetes={["Pièce", "Objet", "Qté", "Destination", "Démontage", "Volume"]}
            droite={[2, 5]}
            lignes={pieces.flatMap((p) =>
              (d.inv as any[])
                .filter((i) => i.piece === p)
                .map((i) => [p, i.libelle, i.quantite, i.destination ?? "—", i.demontage ? "Oui" : "—", m3(i.volume * i.quantite)]),
            )}
          />
        )}
      </Section>
      <Section titre="Emballages à prévoir">
        <Cases
          items={[
            { label: "Cartons standard", valeur: emb.cartonsStandard },
            { label: "Cartons livres", valeur: emb.cartonsLivres },
            { label: "Penderies", valeur: emb.penderies },
            { label: "Papier bulle", valeur: `${emb.bulle} rouleaux` },
          ]}
        />
      </Section>
    </FeuilleBailly>
  );
}

/**
 * La lettre de voiture : l'ordre de mission (interne) puis deux exemplaires au chargement et deux à la livraison.
 * Les exemplaires sont remis au client : pour un client CIMOB/DICOM, ils portent ses droits et jamais son volume
 * réel, ni le volume objet par objet qui le recompose (volume-client.ts) ; l'ordre de mission garde le volume réel.
 */
export function LettreVoitureBailly({ d, lv }: { d: any; lv: any }) {
  const emb = emballages(d.volume);
  const demont = (d.inv as any[]).filter((i) => i.demontage);
  const droits = volumeClient(d).droits;
  const feuilles: { titre: string; sous: string; genre: "mission" | "charg" | "livr" }[] = [
    { titre: "Ordre de mission", sous: "Document interne : ne pas remettre au client", genre: "mission" },
    { titre: "Chargement", sous: "Exemplaire 1 sur 2 · à signer au départ", genre: "charg" },
    { titre: "Chargement", sous: "Exemplaire 2 sur 2 · à signer au départ", genre: "charg" },
    { titre: "Livraison", sous: "Exemplaire 1 sur 2 · à signer à l’arrivée", genre: "livr" },
    { titre: "Livraison", sous: "Exemplaire 2 sur 2 · à signer à l’arrivée", genre: "livr" },
  ];
  return (
    <>
      {feuilles.map((f, i) => (
        <FeuilleBailly
          key={i}
          saut={i < feuilles.length - 1}
          etiquette={f.genre === "mission" ? "Ordre de mission" : "Lettre de voiture"}
          titre={f.genre === "mission" ? `Mission ${lv.numero}` : `${f.titre} · ${lv.numero}`}
          sousTitre={f.sous}
          details={[`Dossier ${d.ref}`]}
        >
          <Cases
            items={[
              { label: "Client", valeur: nomClient(d), detail: d.telephone ?? undefined, fonce: true },
              { label: "Chargement", valeur: lv.date_chargement ? dateFr(lv.date_chargement) : "—" },
              { label: "Livraison", valeur: lv.date_livraison ? dateFr(lv.date_livraison) : "—" },
              f.genre === "mission" ? { label: "Volume", valeur: m3(d.volume) } : { label: volumeClient(d).libelle, valeur: m3Client(d) },
            ]}
          />
          <Section titre="Transport">
            <Tableau
              entetes={["Trajet", "Transporteur", "Camion", "Équipe"]}
              lignes={[[lv.trajet ?? "—", lv.prestataire ?? "—", lv.immatriculation ?? "—", lv.equipe ?? "—"]]}
            />
          </Section>
          {f.genre === "mission" ? (
            <>
              <Section titre="Instructions aux déménageurs">
                <Encadre>{[lv.instructions, d.observations].filter(Boolean).join("\n\n") || "—"}</Encadre>
              </Section>
              <Section titre="Démontage et remontage à prévoir">
                {demont.length === 0 ? <Encadre>Aucun.</Encadre> : <Tableau entetes={["Pièce", "Objet", "Qté"]} droite={[2]} lignes={demont.map((x) => [x.piece, x.libelle, x.quantite])} />}
              </Section>
              <Section titre="Matériel à emporter">
                <Cases
                  items={[
                    { label: "Cartons standard", valeur: emb.cartonsStandard },
                    { label: "Cartons livres", valeur: emb.cartonsLivres },
                    { label: "Penderies", valeur: emb.penderies },
                    { label: "Papier bulle", valeur: `${emb.bulle} rouleaux` },
                  ]}
                />
                {d.vehicule && <Encadre>Véhicule à transporter : carte grise et attestation d’assurance à récupérer.</Encadre>}
              </Section>
            </>
          ) : (
            <>
              {droits ? (
                <Section titre="Objets">
                  <Tableau entetes={["Pièce", "Objet", "Qté"]} droite={[2]} lignes={(d.inv as any[]).map((x) => [x.piece, x.libelle, x.quantite])} />
                </Section>
              ) : (
                <Section titre={`Objets · ${m3(d.volume)}`}>
                  <Tableau entetes={["Pièce", "Objet", "Qté", "Volume"]} droite={[2, 3]} lignes={(d.inv as any[]).map((x) => [x.piece, x.libelle, x.quantite, m3(x.volume * x.quantite)])} />
                </Section>
              )}
              <Section titre={f.genre === "charg" ? "Réserves à l’enlèvement" : "Réserves à la livraison"}>
                <Encadre hauteur="24mm" />
              </Section>
              <Signatures cases={["Signature du client", "Signature du déménageur"]} />
            </>
          )}
        </FeuilleBailly>
      ))}
    </>
  );
}

/** La proposition de sous-traitance : le client, l'itinéraire et la prestation confiée. */
export function SousTraitanceBailly({ d, lv }: { d: any; lv: any }) {
  return (
    <FeuilleBailly etiquette="Proposition de sous-traitance" titre={lv ? `Lettre ${lv.numero}` : d.ref} sousTitre={`Dossier ${d.ref} · ${nomClient(d)}`} details={[d.commercial && `Commercial : ${d.commercial}`]}>
      {lv && (
        <Cases
          items={[
            { label: "Prix proposé", valeur: lv.prix_sous_traitance != null ? eur(lv.prix_sous_traitance) : "À définir", fonce: true },
            { label: "Chargement", valeur: lv.date_chargement ? dateFr(lv.date_chargement) : "—" },
            { label: "Livraison", valeur: lv.date_livraison ? dateFr(lv.date_livraison) : "—" },
            { label: "Volume", valeur: m3(d.volume) },
          ]}
        />
      )}
      <Itineraire d={d} />
      {lv && (
        <Section titre="Prestation confiée">
          <Tableau entetes={["Lettre de voiture", "Prestataire", "Trajet"]} lignes={[[lv.numero, lv.prestataire ?? "—", lv.trajet ?? "—"]]} />
        </Section>
      )}
      {d.observations && (
        <Section titre="Consignes">
          <Encadre>{d.observations}</Encadre>
        </Section>
      )}
      <Signatures cases={["Bon pour accord du prestataire", "Bailly Déménagement"]} />
    </FeuilleBailly>
  );
}
