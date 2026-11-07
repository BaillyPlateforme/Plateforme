import "server-only";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { dateLongue, euros, jourLong, nomClient } from "./format";
import { TYPE_FACTURE } from "./libelles";
import { PARAMS_TOURNEE } from "./tournee";
import type { Client, Devis, DocumentFichier, Dossier, Facture, LivraisonCartons } from "./types";

/*
 * Les PDF de l'espace client : devis, factures, bons de livraison des
 * cartons — et, pour les documents de démonstration qui n'ont pas de
 * fichier, une page témoin. @react-pdf/renderer, comme l'estimation des
 * questionnaires (src/lib/DevisPdf.tsx) : la v0 utilisait pdf-lib, imposé par
 * Cloudflare, qui n'a plus lieu d'être ici.
 *
 * Même habit que l'estimation : bandeau noir, logo blanc, filet jaune, Roboto.
 */

const POLICES = path.join(process.cwd(), "public", "fonts");
try {
  Font.register({
    family: "RobotoEC",
    fonts: [
      { src: path.join(POLICES, "Roboto-Regular.woff"), fontWeight: 400 },
      { src: path.join(POLICES, "Roboto-Medium.woff"), fontWeight: 500 },
      { src: path.join(POLICES, "Roboto-Bold.woff"), fontWeight: 700 },
      { src: path.join(POLICES, "Roboto-Black.woff"), fontWeight: 900 },
    ],
  });
  Font.registerHyphenationCallback((mot) => [mot]);
} catch {
  /* polices absentes : Helvetica */
}

const LOGO = path.join(process.cwd(), "public", "marque", "bailly-logo-blanc.png");
export const C = { noir: "#1b1a18", jaune: "#f5d033", gris: "#615f68", trait: "#e9e7e2", fond: "#f6f5f2", creme: "#fdf6d6", or: "#8a6f00" };

const s = StyleSheet.create({
  page: { fontFamily: "RobotoEC", fontSize: 10, color: C.noir, paddingBottom: 60 },
  bandeau: { backgroundColor: C.noir, paddingHorizontal: 40, paddingVertical: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 130, height: 41.5 },
  bandeauDroite: { color: "#ffffff", fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textAlign: "right" },
  bandeauSous: { color: "#c9c5bd", fontSize: 8.5, marginTop: 3, textAlign: "right" },
  filet: { height: 4, backgroundColor: C.jaune },
  corps: { paddingHorizontal: 40, paddingTop: 26 },
  deuxCol: { flexDirection: "row", justifyContent: "space-between" },
  fort: { fontSize: 12, fontWeight: 700 },
  doux: { fontSize: 9.5, color: C.gris, marginTop: 3 },
  titre: { fontSize: 22, fontWeight: 900, letterSpacing: -0.4, marginTop: 26 },
  sousTitre: { fontSize: 9.5, color: C.gris, marginTop: 4 },
  th: { flexDirection: "row", backgroundColor: C.noir, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 10, marginTop: 20 },
  thTexte: { fontSize: 7.5, letterSpacing: 1, color: C.jaune, fontWeight: 500 },
  tr: { flexDirection: "row", paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 0.6, borderBottomColor: C.trait },
  cLib: { flex: 1, paddingRight: 12 },
  cMt: { width: 90, textAlign: "right" },
  lib: { fontSize: 10, fontWeight: 500 },
  det: { fontSize: 8, color: C.gris, marginTop: 2 },
  totaux: { marginTop: 12, alignSelf: "flex-end", width: 240 },
  totalLigne: { flexDirection: "row", paddingVertical: 3 },
  totalLib: { flex: 1, textAlign: "right", color: C.gris, paddingRight: 12 },
  totalVal: { width: 90, textAlign: "right", fontWeight: 500 },
  ttc: { flexDirection: "row", backgroundColor: C.noir, borderRadius: 7, paddingVertical: 8, paddingHorizontal: 10, marginTop: 6 },
  ttcLib: { flex: 1, color: C.jaune, fontWeight: 500, fontSize: 9 },
  ttcVal: { color: "#ffffff", fontSize: 14, fontWeight: 900 },
  encadre: { marginTop: 18, backgroundColor: C.creme, borderLeftWidth: 3, borderLeftColor: C.jaune, borderRadius: 8, padding: 12, fontSize: 9, lineHeight: 1.45 },
  pied: { position: "absolute", bottom: 22, left: 40, right: 40, borderTopWidth: 0.6, borderTopColor: C.trait, paddingTop: 8, fontSize: 7.5, color: C.gris },
  cle: { width: 130, fontSize: 9.5, color: C.gris },
  val: { flex: 1, fontSize: 11.5, fontWeight: 700 },
  ligneKv: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.6, borderBottomColor: C.trait },
});

export function Entete({ droite, sous }: { droite: string; sous?: string }) {
  return (
    <>
      <View style={s.bandeau}>
        {/* Le composant Image de react-pdf n'a pas d'attribut alt. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={LOGO} style={s.logo} />
        <View>
          <Text style={s.bandeauDroite}>{droite}</Text>
          {sous ? <Text style={s.bandeauSous}>{sous}</Text> : null}
        </View>
      </View>
      <View style={s.filet} />
    </>
  );
}

export function Pied({ texte }: { texte: string }) {
  return (
    <Text style={s.pied} fixed>
      {texte}
    </Text>
  );
}

function BlocClient({ client, dossier }: { client: Client; dossier: Dossier }) {
  return (
    <View style={s.deuxCol}>
      <View>
        <Text style={s.fort}>{client.societe ?? nomClient(client)}</Text>
        <Text style={s.doux}>{client.societe ? nomClient(client) : client.email}</Text>
      </View>
      <View>
        <Text style={[s.fort, { textAlign: "right" }]}>Dossier {dossier.reference}</Text>
        <Text style={[s.doux, { textAlign: "right" }]}>
          {dossier.ville_depart} → {dossier.ville_arrivee}
        </Text>
      </View>
    </View>
  );
}

export const enBuffer = async (doc: React.ReactElement) => Buffer.from(await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]));

export function pdfDevis(client: Client, dossier: Dossier, devis: Devis) {
  return enBuffer(
    <Document title={`Devis ${devis.numero}`} author="Bailly Déménagement">
      <Page size="A4" style={s.page}>
        <Entete droite={`DEVIS ${devis.numero}`} sous={`Émis le ${dateLongue(devis.emis_le)}`} />
        <View style={s.corps}>
          <BlocClient client={client} dossier={dossier} />
          <Text style={s.titre}>Formule {devis.formule}</Text>
          <Text style={s.sousTitre}>
            Valable jusqu&apos;au {dateLongue(devis.valide_jusqu_au)} · {dossier.volume_m3} m³
          </Text>
          <View style={s.th}>
            <Text style={[s.thTexte, s.cLib]}>PRESTATION</Text>
            <Text style={[s.thTexte, s.cMt]}>MONTANT HT</Text>
          </View>
          {devis.lignes.map((l, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <View style={s.cLib}>
                <Text style={s.lib}>{l.libelle}</Text>
                {l.detail ? <Text style={s.det}>{l.detail}</Text> : null}
              </View>
              <Text style={[s.cMt, { fontWeight: 700 }]}>{l.montant_ht ? euros(l.montant_ht) : "Offert"}</Text>
            </View>
          ))}
          <View style={s.totaux}>
            <View style={s.totalLigne}>
              <Text style={s.totalLib}>Total HT</Text>
              <Text style={s.totalVal}>{euros(devis.montant_ht)}</Text>
            </View>
            <View style={s.totalLigne}>
              <Text style={s.totalLib}>TVA 20 %</Text>
              <Text style={s.totalVal}>{euros(devis.montant_ttc - devis.montant_ht)}</Text>
            </View>
            <View style={s.ttc}>
              <Text style={s.ttcLib}>TOTAL TTC</Text>
              <Text style={s.ttcVal}>{euros(devis.montant_ttc)}</Text>
            </View>
          </View>
          {devis.arrhes_pourcentage > 0 ? (
            <Text style={s.encadre}>
              Arrhes de {devis.arrhes_pourcentage} % ({euros(Math.round(devis.montant_ttc * devis.arrhes_pourcentage) / 100)}) à régler à la commande, en ligne depuis votre espace client.
            </Text>
          ) : null}
        </View>
        <Pied texte="Bailly Déménagement · Ce devis est consultable à tout moment dans votre espace client." />
      </Page>
    </Document>,
  );
}

export function pdfFacture(client: Client, dossier: Dossier, f: Facture) {
  return enBuffer(
    <Document title={`Facture ${f.numero}`} author="Bailly Déménagement">
      <Page size="A4" style={s.page}>
        <Entete droite={`FACTURE ${f.numero}`} sous={`Émise le ${dateLongue(f.emise_le)}`} />
        <View style={s.corps}>
          <BlocClient client={client} dossier={dossier} />
          <Text style={s.titre}>{TYPE_FACTURE[f.type]}</Text>
          <Text style={s.sousTitre}>Échéance le {dateLongue(f.echeance)}</Text>
          <View style={s.th}>
            <Text style={[s.thTexte, s.cLib]}>LIBELLÉ</Text>
            <Text style={[s.thTexte, s.cMt]}>MONTANT TTC</Text>
          </View>
          <View style={s.tr}>
            <Text style={[s.lib, s.cLib]}>{f.libelle}</Text>
            <Text style={[s.cMt, { fontWeight: 700 }]}>{euros(f.montant_ttc)}</Text>
          </View>
          <Text style={s.encadre}>
            {f.statut === "payee" ? `Réglée le ${dateLongue(f.payee_le!)} · référence ${f.paiement_ref}.` : "À régler en ligne depuis votre espace client."}
          </Text>
        </View>
        <Pied texte="Bailly Déménagement · Facture disponible dans votre espace client." />
      </Page>
    </Document>,
  );
}

/** Les documents du jeu de démonstration n'ont pas de fichier : une page en tient lieu. */
export function pdfTemoin(dossier: Dossier, doc: Pick<DocumentFichier, "libelle" | "nom_fichier" | "source" | "created_at">) {
  return enBuffer(
    <Document title={doc.libelle} author="Bailly Déménagement">
      <Page size="A4" style={s.page}>
        <Entete droite={doc.libelle.toUpperCase().slice(0, 42)} sous={`Dossier ${dossier.reference}`} />
        <View style={s.corps}>
          <Text style={s.titre}>{doc.libelle}</Text>
          <Text style={s.sousTitre}>
            {dossier.ville_depart} → {dossier.ville_arrivee} · déposé par {doc.source === "equipe" ? "l'équipe Bailly" : "le client"} le {dateLongue(doc.created_at)}
          </Text>
          <Text style={s.encadre}>
            Document de démonstration. Dans l&apos;espace client réel, ce lien ouvre le fichier « {doc.nom_fichier} », conservé dans un espace de stockage privé et servi par un lien signé valable cinq minutes.
          </Text>
        </View>
        <Pied texte="Bailly Déménagement · Démonstration, données fictives." />
      </Page>
    </Document>,
  );
}

export type BonCartons = { l: LivraisonCartons; dossier: Dossier; client: Client };

/** La veille : une page récapitulative (cartons à préparer, ordre de passage), puis un bon par client. */
export function pdfBons(samedi: string, bons: BonCartons[]) {
  const total = bons.reduce((n, b) => n + (b.l.nb_cartons ?? 0), 0);
  const jour = jourLong(samedi);
  return enBuffer(
    <Document title={`Bons de livraison de cartons — ${samedi}`} author="Bailly Déménagement">
      <Page size="A4" style={s.page}>
        <Entete droite={`TOURNÉE DU ${samedi.split("-").reverse().join("/")}`} sous={`Départ ${PARAMS_TOURNEE.depot.nom} à ${PARAMS_TOURNEE.heureDepart.replace(":", " h ")}`} />
        <View style={s.corps}>
          <Text style={[s.titre, { marginTop: 0, textTransform: "capitalize" }]}>{jour}</Text>
          <View style={[s.ttc, { marginTop: 14, paddingVertical: 14 }]}>
            <Text style={[s.ttcLib, { fontSize: 11 }]}>CARTONS À PRÉPARER</Text>
            <Text style={[s.ttcVal, { fontSize: 22 }]}>{total}</Text>
          </View>
          <Text style={s.sousTitre}>
            {bons.length} client{bons.length > 1 ? "s" : ""} · {bons.filter((b) => !b.l.nb_cartons).length} nombre(s) encore à saisir
          </Text>
          <View style={s.th}>
            <Text style={[s.thTexte, { width: 26 }]}>#</Text>
            <Text style={[s.thTexte, { width: 120 }]}>CLIENT</Text>
            <Text style={[s.thTexte, { flex: 1 }]}>ADRESSE</Text>
            <Text style={[s.thTexte, { width: 74 }]}>CRÉNEAU</Text>
            <Text style={[s.thTexte, { width: 50, textAlign: "right" }]}>CARTONS</Text>
          </View>
          {bons.map(({ l }) => (
            <View key={l.id} style={s.tr} wrap={false}>
              <Text style={{ width: 26, fontWeight: 900, color: C.or }}>{l.ordre_passage ?? "–"}</Text>
              <Text style={{ width: 120, fontWeight: 700 }}>{l.contact_nom}</Text>
              <Text style={{ flex: 1, fontSize: 9 }}>{l.adresse}</Text>
              <Text style={{ width: 74, fontSize: 9 }}>{l.creneau_debut ? `${l.creneau_debut}–${l.creneau_fin}` : "à calculer"}</Text>
              <Text style={{ width: 50, textAlign: "right", fontWeight: 700 }}>{l.nb_cartons ?? "?"}</Text>
            </View>
          ))}
        </View>
        <Pied texte="Bailly Déménagement · Ordre de passage calculé par l'optimiseur de tournée." />
      </Page>
      {bons.map(({ l, dossier }) => (
        <Page key={l.id} size="A4" style={s.page}>
          <Entete droite={`BON DE LIVRAISON · ARRÊT ${l.ordre_passage ?? "–"}`} sous={`Dossier ${dossier.reference}`} />
          <View style={s.corps}>
            <Text style={[s.titre, { marginTop: 0 }]}>Livraison de cartons</Text>
            <Text style={s.sousTitre}>{jour}</Text>
            <View style={{ marginTop: 18 }}>
              {(
                [
                  ["Personne présente", l.contact_nom],
                  ["Téléphone", l.contact_tel],
                  ["Adresse", l.adresse],
                  ["Complément", l.complement ?? "—"],
                  ["Code d'accès", l.code_acces ?? "—"],
                  ["Créneau annoncé", l.creneau_debut ? `${l.creneau_debut} – ${l.creneau_fin}` : "à définir"],
                ] as const
              ).map(([k, v]) => (
                <View key={k} style={s.ligneKv}>
                  <Text style={s.cle}>{k}</Text>
                  <Text style={s.val}>{v}</Text>
                </View>
              ))}
            </View>
            <View style={[s.ttc, { marginTop: 20, paddingVertical: 16, width: 260 }]}>
              <Text style={[s.ttcLib, { fontSize: 11 }]}>CARTONS</Text>
              <Text style={[s.ttcVal, { fontSize: 26 }]}>{l.nb_cartons ?? "?"}</Text>
            </View>
            <Text style={[s.doux, { marginTop: 28 }]}>Signature du client à la réception :</Text>
            <View style={{ marginTop: 8, width: 260, height: 90, borderWidth: 0.8, borderColor: C.trait, borderRadius: 6 }} />
          </View>
          <Pied texte="Bailly Déménagement · cartons fournis dans le cadre de votre déménagement." />
        </Page>
      ))}
    </Document>,
  );
}

export function reponsePdf(donnees: Buffer, nom: string, telecharger = false) {
  return new Response(new Uint8Array(donnees), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="${nom.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
