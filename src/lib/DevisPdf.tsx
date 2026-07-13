import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { DevisRow, SettingsRow } from "@/lib/types";

const C = {
  ink: "#211f1b",
  soft: "#7d7566",
  sage: "#4a5541",
  line: "#e6dfd2",
  cream: "#f7f4ef",
};

const s = StyleSheet.create({
  page: { padding: 42, fontSize: 10, color: C.ink, fontFamily: "Helvetica" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.ink },
  soft: { color: C.soft },
  title: { fontSize: 26, fontFamily: "Helvetica-Bold", color: C.sage },
  block: { marginTop: 6 },
  label: { fontSize: 8, color: C.soft, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
  card: { border: `1 solid ${C.line}`, borderRadius: 6, padding: 12, marginTop: 8 },
  th: { flexDirection: "row", backgroundColor: C.cream, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4 },
  tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 10, borderBottom: `1 solid ${C.line}` },
  cLabel: { flex: 1 },
  cAmt: { width: 90, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
  totalLabel: { width: 120, textAlign: "right", color: C.soft, paddingRight: 12 },
  totalVal: { width: 90, textAlign: "right" },
  ttc: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.sage },
  footer: { position: "absolute", bottom: 32, left: 42, right: 42, fontSize: 8, color: C.soft, borderTop: `1 solid ${C.line}`, paddingTop: 8 },
});

const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fdate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

export function DevisPdf({ devis, settings }: { devis: DevisRow; settings: SettingsRow }) {
  const lignes =
    devis.lignes && devis.lignes.length > 0
      ? devis.lignes
      : [{ label: "Prestation de déménagement (forfait)", amount: devis.montant_ht }];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* En-tête */}
        <View style={s.row}>
          <View>
            <Text style={s.brand}>{settings.entreprise_nom || "Bailly Déménagement"}</Text>
            {settings.entreprise_adresse ? <Text style={[s.soft, s.block]}>{settings.entreprise_adresse}</Text> : null}
            <Text style={s.soft}>
              {[settings.entreprise_email, settings.entreprise_tel].filter(Boolean).join(" · ")}
            </Text>
            {settings.siret ? <Text style={s.soft}>SIRET {settings.siret}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.title}>DEVIS</Text>
            <Text style={[s.soft, s.block]}>N° {devis.reference}</Text>
            <Text style={s.soft}>Date : {fdate(devis.created_at)}</Text>
            <Text style={s.soft}>Valable jusqu&apos;au {fdate(devis.valid_until)}</Text>
          </View>
        </View>

        {/* Client */}
        <View style={s.card}>
          <Text style={s.label}>Client</Text>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{devis.client_nom || "—"}</Text>
          {devis.client_email ? <Text style={s.soft}>{devis.client_email}</Text> : null}
        </View>

        {/* Détail */}
        <View style={{ marginTop: 18 }}>
          <View style={s.th}>
            <Text style={s.cLabel}>Désignation</Text>
            <Text style={s.cAmt}>Montant HT</Text>
          </View>
          {lignes.map((l, i) => (
            <View style={s.tr} key={i}>
              <Text style={s.cLabel}>{l.label}</Text>
              <Text style={s.cAmt}>{eur(l.amount)}</Text>
            </View>
          ))}
        </View>

        {/* Totaux */}
        <View style={{ marginTop: 14 }}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total HT</Text>
            <Text style={s.totalVal}>{eur(devis.montant_ht)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TVA</Text>
            <Text style={s.totalVal}>{eur(devis.montant_tva)}</Text>
          </View>
          <View style={[s.totalRow, { marginTop: 6 }]}>
            <Text style={[s.totalLabel, s.ttc]}>Total TTC</Text>
            <Text style={[s.totalVal, s.ttc]}>{eur(devis.montant_ttc)}</Text>
          </View>
        </View>

        {/* Signature */}
        {settings.signature_email ? (
          <View style={{ marginTop: 30 }}>
            <Text style={s.soft}>{settings.signature_email}</Text>
          </View>
        ) : null}

        <Text style={s.footer}>
          Devis établi par {settings.entreprise_nom || "Bailly Déménagement"}. Prix fermes et définitifs
          dans la limite de validité indiquée. TVA {devis.montant_ht > 0 ? Math.round((devis.montant_tva / devis.montant_ht) * 100) : 20}%.
        </Text>
      </Page>
    </Document>
  );
}
