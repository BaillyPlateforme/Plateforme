import path from "node:path";
import {
  Document,
  Defs,
  Font,
  Image,
  LinearGradient,
  Page,
  Path,
  RadialGradient,
  Rect,
  StyleSheet,
  Stop,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type { DevisRow, SettingsRow } from "@/lib/types";

export type PdfTrajet = { depart: string | null; arrivee: string | null; volume: number | null; quand: string | null };

/* ─────────────────────────── Marque ─────────────────────────── */

const C = {
  noir: "#1b1a18",
  noirDoux: "#2a2823",
  jaune: "#f5d033",
  jauneSombre: "#c9a200",
  gris: "#615f68",
  grisClair: "#9b98a1",
  trait: "#e9e7e2",
  fond: "#f6f5f2",
  creme: "#fdf6d6",
  blanc: "#ffffff",
};

// Roboto est la police de la marque (voir charte-graphique/README.md).
// Les fichiers vivent dans `public/` : c'est ce que le déploiement emporte.
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
  // Roboto n'a pas de césure automatique : sans cela, react-pdf coupe les mots
  // au milieu pour les faire tenir.
  Font.registerHyphenationCallback((mot) => [mot]);
} catch {
  /* polices absentes : react-pdf retombe sur Helvetica */
}

const LARGEUR = 595.28; // A4 en points
const MARGE = 40;

const s = StyleSheet.create({
  page: { fontFamily: "Roboto", fontSize: 9.5, color: C.noir, backgroundColor: C.blanc, paddingBottom: 68 },

  /* En-tête */
  hero: { position: "relative", height: 198 },
  heroFond: { position: "absolute", top: 0, left: 0 },
  heroContenu: { position: "absolute", top: 30, left: MARGE, right: MARGE },
  logo: { width: 136, height: 43 },
  heroTitre: { fontFamily: "Roboto", fontWeight: 900, fontSize: 30, color: C.blanc, letterSpacing: -0.6 },
  heroSous: { fontSize: 9, color: "#c9c5bd", marginTop: 3 },

  /* Carte du montant, posée à cheval sur l'en-tête */
  prixOmbre: { position: "absolute", top: 150, left: MARGE + 3, right: MARGE - 3, height: 104, backgroundColor: "#dedbd4", borderRadius: 14 },
  prix: { position: "absolute", top: 146, left: MARGE, right: MARGE, backgroundColor: C.blanc, borderRadius: 14, padding: 18, flexDirection: "row", alignItems: "center" },
  prixLabel: { fontSize: 7.5, letterSpacing: 1.4, color: C.gris, fontWeight: 500 },
  prixValeur: { fontFamily: "Roboto", fontWeight: 900, fontSize: 32, color: C.noir, letterSpacing: -1, marginTop: 2 },
  prixDetail: { fontSize: 8.5, color: C.gris, marginTop: 3 },

  corps: { paddingHorizontal: MARGE, marginTop: 68 },

  /* Bandes de chiffres */
  stats: { flexDirection: "row", gap: 8, marginTop: 4 },
  stat: { flex: 1, backgroundColor: C.fond, borderRadius: 10, padding: 11 },
  statLabel: { fontSize: 7, letterSpacing: 1.1, color: C.gris, fontWeight: 500 },
  statValeur: { fontSize: 12.5, fontWeight: 700, marginTop: 4 },

  /* Titres de section */
  section: { marginTop: 18 },
  sectionTitre: { fontSize: 11.5, fontWeight: 700, letterSpacing: -0.1 },
  sectionTrait: { height: 2.5, width: 26, backgroundColor: C.jaune, borderRadius: 2, marginTop: 5, marginBottom: 11 },

  /* Tableau */
  th: { flexDirection: "row", backgroundColor: C.noir, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  thTexte: { fontSize: 7.5, letterSpacing: 1.1, color: C.jaune, fontWeight: 500 },
  tr: { flexDirection: "row", paddingVertical: 9, paddingHorizontal: 12, alignItems: "flex-start" },
  trPaire: { backgroundColor: "#fbfaf8" },
  cLabel: { flex: 1, paddingRight: 14 },
  cAmt: { width: 86, textAlign: "right" },
  ligneLabel: { fontSize: 10, fontWeight: 500 },
  ligneDetail: { fontSize: 8, color: C.gris, marginTop: 2, lineHeight: 1.35 },
  montant: { fontSize: 10.5, fontWeight: 700 },

  /* Totaux */
  totaux: { marginTop: 10, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", width: 230, paddingVertical: 4 },
  totalLabel: { flex: 1, textAlign: "right", color: C.gris, fontSize: 9.5, paddingRight: 14 },
  totalVal: { width: 86, textAlign: "right", fontSize: 9.5, fontWeight: 500 },
  ttcBloc: { marginTop: 7, flexDirection: "row", width: 230, backgroundColor: C.noir, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 12 },
  ttcLabel: { flex: 1, color: C.jaune, fontSize: 9, fontWeight: 500, letterSpacing: 0.4 },
  ttcVal: { color: C.blanc, fontSize: 14, fontWeight: 900, textAlign: "right" },

  /* Mentions */
  mentions: { marginTop: 14, backgroundColor: C.creme, borderRadius: 11, padding: 12, borderLeftWidth: 3, borderLeftColor: C.jaune },
  mentionTitre: { fontSize: 9.5, fontWeight: 700, marginBottom: 5 },
  mention: { fontSize: 8, color: "#5b5750", lineHeight: 1.45, marginBottom: 2 },

  /* Pied de page */
  pied: { position: "absolute", bottom: 0, left: 0, right: 0 },
  piedTexte: { position: "absolute", bottom: 20, left: MARGE, right: MARGE, flexDirection: "row", alignItems: "flex-end" },
  piedNom: { color: C.blanc, fontSize: 9, fontWeight: 700 },
  piedLigne: { color: "#8d897f", fontSize: 7.5, marginTop: 2, lineHeight: 1.45 },
});

/* ─────────────────────────── Dessins ─────────────────────────── */

/**
 * Le bandeau de tête : un dégradé du noir au brun chaud, traversé d'une
 * diagonale jaune et d'un halo doré. react-pdf ne connaît pas les dégradés CSS,
 * mais il sait dessiner du SVG — c'est par là que ça passe.
 */
function FondHero() {
  return (
    <Svg width={LARGEUR} height={198} style={s.heroFond}>
      <Defs>
        <LinearGradient id="fondHero" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={C.noir} />
          <Stop offset="0.55" stopColor={C.noirDoux} />
          <Stop offset="1" stopColor="#3a3426" />
        </LinearGradient>
        <RadialGradient id="halo" cx="0.82" cy="0.2" r="0.6">
          <Stop offset="0" stopColor={C.jaune} stopOpacity={0.4} />
          <Stop offset="1" stopColor={C.jaune} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="biais" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.jaune} stopOpacity={0.9} />
          <Stop offset="1" stopColor={C.jauneSombre} stopOpacity={0.15} />
        </LinearGradient>
      </Defs>

      <Rect x={0} y={0} width={LARGEUR} height={198} fill="url(#fondHero)" />
      <Rect x={0} y={0} width={LARGEUR} height={198} fill="url(#halo)" />
      {/* Deux biais qui filent vers le coin, pour donner du mouvement. */}
      <Path d={`M${LARGEUR - 250} 198 L${LARGEUR - 120} 0 L${LARGEUR - 86} 0 L${LARGEUR - 216} 198 Z`} fill="url(#biais)" opacity={0.18} />
      <Path d={`M${LARGEUR - 190} 198 L${LARGEUR - 60} 0 L${LARGEUR - 44} 0 L${LARGEUR - 174} 198 Z`} fill="url(#biais)" opacity={0.12} />
      <Rect x={0} y={195} width={LARGEUR} height={3} fill={C.jaune} />
    </Svg>
  );
}

/** Le pied de page : la même nuit, retournée. */
function FondPied() {
  return (
    <Svg width={LARGEUR} height={58} style={s.pied}>
      <Defs>
        <LinearGradient id="fondPied" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.noir} />
          <Stop offset="1" stopColor="#332f26" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={LARGEUR} height={58} fill="url(#fondPied)" />
      <Rect x={0} y={0} width={LARGEUR} height={2} fill={C.jaune} />
    </Svg>
  );
}

/* ─────────────────────────── Formats ─────────────────────────── */

/**
 * Le sous-ensemble Roboto embarqué n'a ni l'espace fine insécable des milliers
 * ni la flèche : l'une s'affichait à largeur nulle (« 3468,00 »), l'autre en
 * apostrophe. On les remplace par des caractères que la police possède.
 */
const eur = (n: number) =>
  `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ")} €`;
const vers = (a: string | null, b: string | null) => `${a ?? "—"}  —  ${b ?? "—"}`;
/** Tout texte venant du moteur passe par là : il formate aussi en fr-FR. */
const net = (t: string) => t.replace(/[\u202f\u00a0]/g, " ");
const fdate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

/* ─────────────────────────── Document ─────────────────────────── */

export function DevisPdf({ devis, settings, trajet }: { devis: DevisRow; settings: SettingsRow; trajet?: PdfTrajet }) {
  const lignes =
    devis.lignes && devis.lignes.length > 0
      ? devis.lignes
      : [{ label: "Prestation de déménagement (forfait)", detail: undefined, amount: devis.montant_ht }];

  const nom = settings.entreprise_nom || "Bailly Déménagement";
  const tauxTva = devis.montant_ht > 0 ? Math.round((devis.montant_tva / devis.montant_ht) * 100) : 20;
  const logo = path.join(process.cwd(), "public", "marque", "bailly-logo-blanc.png");

  return (
    <Document title={`Estimation ${devis.reference}`} author={nom}>
      <Page size="A4" style={s.page}>
        {/* ── En-tête ── */}
        <View style={s.hero} fixed={false}>
          <FondHero />
          <View style={s.heroContenu}>
            <Image src={logo} style={s.logo} />
            <View style={{ marginTop: 16, flexDirection: "row", alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <Text style={s.heroTitre}>ESTIMATION</Text>
                <Text style={s.heroSous}>
                  N° {devis.reference} · établie le {fdate(devis.created_at)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[s.heroSous, { color: C.jaune, fontWeight: 500 }]}>
                  Valable jusqu&apos;au {fdate(devis.valid_until)}
                </Text>
                <Text style={s.heroSous}>{devis.client_nom || "—"}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Le montant, en carte posée à cheval ── */}
        <View style={s.prixOmbre} />
        <View style={s.prix}>
          <View style={{ flex: 1 }}>
            <Text style={s.prixLabel}>MONTANT ESTIMÉ TTC</Text>
            <Text style={s.prixValeur}>{eur(devis.montant_ttc)}</Text>
            <Text style={s.prixDetail}>
              {eur(devis.montant_ht)} HT · TVA {tauxTva} % : {eur(devis.montant_tva)}
            </Text>
          </View>
          <Svg width={62} height={62}>
            <Defs>
              <LinearGradient id="pastille" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={C.jaune} />
                <Stop offset="1" stopColor={C.jauneSombre} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={62} height={62} rx={16} fill="url(#pastille)" />
            <Path
              d="M18 40 V24 a2 2 0 0 1 2 -2 h16 v18 M36 29 h7 l5 5.5 V40 h-3"
              stroke={C.noir}
              strokeWidth={2.2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <Path d="M24 43.5 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0" fill={C.noir} />
            <Path d="M40 43.5 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0" fill={C.noir} />
          </Svg>
        </View>

        <View style={s.corps}>
          {/* ── Le chantier en trois chiffres ── */}
          <View style={s.stats}>
            <View style={s.stat}>
              <Text style={s.statLabel}>TRAJET</Text>
              <Text style={s.statValeur}>{vers(trajet?.depart ?? null, trajet?.arrivee ?? null)}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>VOLUME</Text>
              <Text style={s.statValeur}>{trajet?.volume != null ? `${trajet.volume} m³` : "—"}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>DATE SOUHAITÉE</Text>
              <Text style={s.statValeur}>{trajet?.quand || "à définir"}</Text>
            </View>
          </View>

          {/* ── Le détail ── */}
          <View style={s.section}>
            <Text style={s.sectionTitre}>Le détail du chiffrage</Text>
            <View style={s.sectionTrait} />

            <View style={s.th}>
              <Text style={[s.cLabel, s.thTexte]}>DÉSIGNATION</Text>
              <Text style={[s.cAmt, s.thTexte]}>MONTANT HT</Text>
            </View>

            {lignes.map((l, i) => (
              <View style={[s.tr, i % 2 === 1 ? s.trPaire : {}]} key={i} wrap={false}>
                <View style={s.cLabel}>
                  <Text style={s.ligneLabel}>{net(l.label)}</Text>
                  {l.detail ? <Text style={s.ligneDetail}>{net(l.detail)}</Text> : null}
                </View>
                <Text style={[s.cAmt, s.montant]}>{eur(l.amount)}</Text>
              </View>
            ))}

            <View style={s.totaux}>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Total HT</Text>
                <Text style={s.totalVal}>{eur(devis.montant_ht)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>TVA {tauxTva} %</Text>
                <Text style={s.totalVal}>{eur(devis.montant_tva)}</Text>
              </View>
              <View style={s.ttcBloc}>
                <Text style={s.ttcLabel}>TOTAL TTC</Text>
                <Text style={s.ttcVal}>{eur(devis.montant_ttc)}</Text>
              </View>
            </View>
          </View>

          {/* ── Ce qu'il faut savoir ── */}
          <View style={s.mentions} wrap={false}>
            <Text style={s.mentionTitre}>Ce qu&apos;il faut savoir</Text>
            <Text style={s.mention}>
              • Établie sur notre grille tarifaire, à partir de ce que vous nous avez communiqué, et
              pour des conditions normales d&apos;accès.
            </Text>
            <Text style={s.mention}>
              • Indicative : elle ne vaut pas devis contractuel. Un conseiller la confirme après
              échange — visite technique gratuite et sans engagement.
            </Text>
            <Text style={s.mention}>
              • Frais de stationnement facturés par la mairie : refacturés à l&apos;euro près, sur
              justificatif.
            </Text>
          </View>

          {settings.signature_email ? (
            <Text style={[s.mention, { marginTop: 14, color: C.gris }]}>{settings.signature_email}</Text>
          ) : null}
        </View>

        {/* ── Pied de page ── */}
        <View style={s.pied} fixed>
          <FondPied />
          <View style={s.piedTexte}>
            <View style={{ flex: 1 }}>
              <Text style={s.piedNom}>{nom}</Text>
              <Text style={s.piedLigne}>
                {[settings.entreprise_adresse, settings.entreprise_tel, settings.entreprise_email]
                  .filter(Boolean)
                  .join("  ·  ")}
              </Text>
              {settings.siret ? <Text style={s.piedLigne}>SIRET {settings.siret}</Text> : null}
            </View>
            <Text
              style={[s.piedLigne, { width: 70, textAlign: "right" }]}
              render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
              fixed
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}
