import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { TEL_AGENCE } from "@/lib/messaging";
import type { FactureComplete, Mentions } from "./donnees";
import { totaux, libelleMode, GENRE, type GenreFacture } from "./calcul";

/*
 * La facture en PDF, pour la facture électronique (Factur-X) : le même
 * contenu que la facture imprimée (documents/FactureBailly.tsx), aux couleurs
 * de Bailly, dessiné avec react-pdf, qui embarque ses polices (une exigence
 * du PDF/A-3). Seules les mentions renseignées sont imprimées.
 */

const POLICES = path.join(process.cwd(), "public", "fonts");
try {
  Font.register({
    family: "Roboto",
    fonts: [
      { src: path.join(POLICES, "Roboto-Regular.woff"), fontWeight: 400 },
      { src: path.join(POLICES, "Roboto-Medium.woff"), fontWeight: 500 },
      { src: path.join(POLICES, "Roboto-Bold.woff"), fontWeight: 700 },
      { src: path.join(POLICES, "Roboto-Black.woff"), fontWeight: 900 },
    ],
  });
  Font.registerHyphenationCallback((mot) => [mot]);
} catch {
  /* déjà enregistrée */
}

const C = { noir: "#1b1a18", jaune: "#f5d033", gris: "#615f68", trait: "#e9e7e2", fond: "#f6f5f2", creme: "#fdf6d6", blanc: "#ffffff" };
const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Roboto", fontSize: 9, color: C.noir },
  entete: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 18, borderBottom: `1 solid ${C.trait}` },
  logo: { width: 140 },
  agence: { marginTop: 8, fontSize: 7.5, color: C.gris, lineHeight: 1.5 },
  ref: { alignItems: "flex-end" },
  etiquette: { backgroundColor: C.jaune, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, fontSize: 7, fontWeight: 900, letterSpacing: 1.2 },
  numero: { marginTop: 8, fontSize: 19, fontWeight: 900 },
  petit: { fontSize: 8, color: C.gris, marginTop: 2 },
  parties: { flexDirection: "row", marginTop: 18 },
  case: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: C.fond },
  client: { backgroundColor: C.noir, color: C.blanc, marginRight: 8 },
  surtitre: { fontSize: 6.5, fontWeight: 700, letterSpacing: 1.2, color: C.gris },
  surtitreJaune: { fontSize: 6.5, fontWeight: 700, letterSpacing: 1.2, color: C.jaune },
  nom: { fontSize: 11, fontWeight: 700, marginTop: 3, marginBottom: 2 },
  ligneClaire: { fontSize: 8, color: "#d8d6d0", marginTop: 1 },
  ligneGrise: { fontSize: 8, color: C.gris, marginTop: 1 },
  titre: { marginTop: 18, marginBottom: 6, fontSize: 11, fontWeight: 900 },
  th: { flexDirection: "row", borderBottom: `1.2 solid ${C.noir}`, paddingVertical: 5, fontSize: 6.5, fontWeight: 700, color: C.gris, letterSpacing: 0.8 },
  tr: { flexDirection: "row", borderBottom: `0.6 solid ${C.trait}`, paddingVertical: 6 },
  deduction: { backgroundColor: C.creme },
  colDes: { flex: 1, paddingRight: 6 },
  colN: { width: 52, textAlign: "right" },
  colQ: { width: 30, textAlign: "right" },
  colT: { width: 34, textAlign: "right" },
  totaux: { marginTop: 10, marginLeft: "auto", width: 210 },
  totalLigne: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, color: C.gris },
  total: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, padding: 8, borderRadius: 6, backgroundColor: C.noir, color: C.blanc, fontWeight: 700 },
  totalMontant: { color: C.jaune, fontWeight: 900, fontSize: 12 },
  bas: { flexDirection: "row", marginTop: 16 },
  situation: { flex: 1.2, padding: 10, borderRadius: 8, backgroundColor: C.fond, marginRight: 8 },
  reglement: { flex: 1, padding: 10, borderRadius: 8, border: `1.2 solid ${C.noir}` },
  reste: { marginTop: 4, padding: 8, borderRadius: 6, backgroundColor: C.jaune },
  pied: { position: "absolute", left: 40, right: 40, bottom: 26, paddingTop: 8, borderTop: `0.6 solid ${C.trait}`, fontSize: 6.5, color: C.gris, lineHeight: 1.5 },
});

const euros = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n).replace(/ /g, " ");
const date = (j: string | null) => (j ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${j}T00:00:00Z`)) : "—");
const pct = (n: number) => `${String(n).replace(".", ",")} %`;
/** La flèche « → » manque à Roboto : un tiret la remplace dans le PDF. */
const sans = (x: string | null | undefined) => (x ?? "").replace(/\s*→\s*/g, " – ");

export function FacturePdf({ f, m, refDossier, trajet }: { f: FactureComplete; m: Mentions; refDossier: string | null; trajet: string | null }) {
  const avoir = f.genre === "avoir";
  const t = totaux(f.lignes.map((l) => ({ genre: l.genre as "prestation", libelle: l.libelle, quantite: l.quantite, prixUnitaireHt: l.prixUnitaireHt, tauxTva: l.tauxTva })));
  const p = f.payeur ?? f.origine;
  const adresse = m.adresse ? [m.adresse, [m.codePostal, m.ville].filter(Boolean).join(" "), m.pays].filter(Boolean).join(", ") : m.adresseLibre;
  const legales = [
    [m.nom, m.formeJuridique].filter(Boolean).join(", "), m.capital && `au capital de ${m.capital}`, m.rcs && `RCS ${m.rcs}`,
    m.siret ? `SIRET ${m.siret}` : m.siren && `SIREN ${m.siren}`, m.tvaIntracom && `TVA intracommunautaire ${m.tvaIntracom}`, m.codeApe && `APE ${m.codeApe}`,
  ].filter(Boolean).join(" · ");
  const regle = f.reglements.reduce((a, r) => a + r.montant, 0);
  return (
    <Document title={`${avoir ? "Avoir" : "Facture"} ${f.numero}`} author={m.nom} creator="BaillyCRM" producer="BaillyCRM" language="fr-FR">
      <Page size="A4" style={s.page}>
        <View style={s.entete}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- image de react-pdf, pas une balise HTML */}
            <Image src={path.join(process.cwd(), "public", "marque", "bailly-logo.png")} style={s.logo} />
            <Text style={s.agence}>
              {m.nom} · BD Moving Group{adresse ? `\n${adresse}` : ""}{`\n${TEL_AGENCE} · demenagements-bailly.com`}
              {m.siret || m.siren ? `\n${m.siret ? `SIRET ${m.siret}` : `SIREN ${m.siren}`}${m.tvaIntracom ? ` · TVA ${m.tvaIntracom}` : ""}` : ""}
            </Text>
          </View>
          <View style={s.ref}>
            <Text style={s.etiquette}>{(avoir ? "AVOIR" : (GENRE[f.genre as GenreFacture] ?? "Facture").toUpperCase())}</Text>
            <Text style={s.numero}>{f.numero}</Text>
            <Text style={s.petit}>Émis{avoir ? "" : "e"} le {date(f.emiseLe)}</Text>
            {f.echeanceLe && !avoir && <Text style={s.petit}>Échéance le {date(f.echeanceLe)}</Text>}
            {refDossier && <Text style={s.petit}>Dossier {refDossier}</Text>}
            {f.bonCommande && <Text style={s.petit}>Bon de commande {f.bonCommande}</Text>}
            {avoir && f.origineNumero && <Text style={s.petit}>Annule la facture {f.origineNumero}</Text>}
          </View>
        </View>

        <View style={s.parties}>
          <View style={[s.case, s.client]}>
            <Text style={s.surtitreJaune}>{avoir ? "AU BÉNÉFICE DE" : "FACTURÉ À"}</Text>
            <Text style={s.nom}>{p?.nom ?? "—"}</Text>
            {p?.contact && <Text style={s.ligneClaire}>{p.contact}</Text>}
            {p?.adresse && <Text style={s.ligneClaire}>{p.adresse}</Text>}
            {(p?.codePostal || p?.ville) && <Text style={s.ligneClaire}>{[p?.codePostal, p?.ville].filter(Boolean).join(" ")}{p?.pays ? ` · ${p.pays}` : ""}</Text>}
            {(p?.siren || p?.tvaIntracom) && <Text style={s.ligneClaire}>{[p?.siren && `SIREN ${p.siren}`, p?.tvaIntracom && `TVA ${p.tvaIntracom}`].filter(Boolean).join(" · ")}</Text>}
          </View>
          <View style={s.case}>
            <Text style={s.surtitre}>PRESTATION</Text>
            <Text style={s.nom}>{f.gardeMeuble ? "Garde-meuble" : "Déménagement"}</Text>
            {f.origine && f.payeur && f.origine.clientId !== f.payeur.clientId && <Text style={s.ligneGrise}>Pour le compte de {f.origine.nom}</Text>}
            {trajet && <Text style={s.ligneGrise}>{sans(trajet)}</Text>}
            <Text style={s.ligneGrise}>{sans(f.objet)}</Text>
          </View>
        </View>

        <Text style={s.titre}>Détail</Text>
        <View style={s.th}>
          <Text style={s.colDes}>DÉSIGNATION</Text><Text style={s.colQ}>QTÉ</Text><Text style={s.colN}>PU HT</Text><Text style={s.colT}>TVA</Text><Text style={s.colN}>TOTAL HT</Text><Text style={s.colN}>TOTAL TTC</Text>
        </View>
        {t.lignes.map((l, i) =>
          l.genre === "texte" ? (
            <View key={i} style={s.tr}><Text style={[s.colDes, { color: C.gris }]}>{sans(l.libelle)}{f.lignes[i].detail ? ` · ${sans(f.lignes[i].detail)}` : ""}</Text></View>
          ) : (
            <View key={i} style={l.genre === "deduction" ? [s.tr, s.deduction] : s.tr} wrap={false}>
              <Text style={s.colDes}>{sans(l.libelle)}{f.lignes[i].detail ? `\n${sans(f.lignes[i].detail)}` : ""}</Text>
              <Text style={s.colQ}>{String(l.quantite).replace(".", ",")}</Text>
              <Text style={s.colN}>{euros(l.prixUnitaireHt)}</Text>
              <Text style={s.colT}>{pct(l.tauxTva)}</Text>
              <Text style={s.colN}>{euros(l.ht)}</Text>
              <Text style={[s.colN, { fontWeight: 700 }]}>{euros(l.ttc)}</Text>
            </View>
          ),
        )}
        <View style={s.totaux}>
          {t.parTaux.map((g) => (
            <View key={g.taux} style={s.totalLigne}><Text>Base HT {pct(g.taux)} · TVA {euros(g.tva)}</Text><Text>{euros(g.base)}</Text></View>
          ))}
          <View style={s.totalLigne}><Text>Total HT</Text><Text>{euros(t.ht)}</Text></View>
          <View style={s.totalLigne}><Text>Total TVA</Text><Text>{euros(t.tva)}</Text></View>
          <View style={s.total}><Text>{avoir ? "Total de l'avoir TTC" : "Total TTC"}</Text><Text style={s.totalMontant}>{euros(f.ttc)}</Text></View>
        </View>

        <View style={s.bas} wrap={false}>
          <View style={s.situation}>
            <Text style={{ fontWeight: 700, marginBottom: 4 }}>{avoir ? "Motif" : "Règlements reçus sur ce document"}</Text>
            {avoir ? <Text>{f.motif ?? "—"}</Text> : f.reglements.map((r) => (
              <View key={r.id} style={s.totalLigne}><Text>{libelleMode(r.mode)}{r.numeroCheque ? ` n° ${r.numeroCheque}` : ""} · le {date(r.recuLe)}</Text><Text>− {euros(r.montant)}</Text></View>
            ))}
            {!avoir && f.reglements.length === 0 && <Text style={{ color: C.gris }}>Aucun règlement reçu</Text>}
          </View>
          <View style={s.reglement}>
            <Text style={{ fontWeight: 700 }}>{avoir ? "Avoir" : "Règlement"}</Text>
            <View style={s.reste}>
              <Text style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: 1 }}>{avoir ? "MONTANT DE L'AVOIR" : regle > 0 ? "NET À PAYER" : "À PAYER"}</Text>
              <Text style={{ fontSize: 15, fontWeight: 900 }}>{euros(avoir ? f.ttc : f.statut === "annulee" ? 0 : f.reste)}</Text>
            </View>
            {(f.conditions || m.conditions) && !avoir && <Text style={{ marginTop: 6, color: C.gris }}>{f.conditions || m.conditions}</Text>}
            {m.iban && !avoir && <Text style={{ marginTop: 3, color: C.gris }}>IBAN {m.iban}{m.bic ? ` · BIC ${m.bic}` : ""}</Text>}
            {m.penalites && !avoir && <Text style={{ marginTop: 3, color: C.gris }}>{m.penalites}</Text>}
            {m.indemnite && !avoir && <Text style={{ marginTop: 3, color: C.gris }}>{m.indemnite}</Text>}
            {m.escompte && !avoir && <Text style={{ marginTop: 3, color: C.gris }}>{m.escompte}</Text>}
          </View>
        </View>

        <Text style={s.pied} fixed>
          {legales || `${m.nom} · BD Moving Group`}{m.pied ? `\n${m.pied}` : ""}{"\n"}Membre IAM et de la Chambre Syndicale du Déménagement · ISO 9001, 14001, 45001
        </Text>
      </Page>
    </Document>
  );
}
