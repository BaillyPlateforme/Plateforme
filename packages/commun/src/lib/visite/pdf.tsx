import "server-only";
import { Document, Image, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { C, Entete, enBuffer } from "../espace-client/pdf";
import { jourVisite, m3, m3Fin, momentVisite, resumeAcces, type ContenuCompteRendu } from "./regles";

/*
 * Le compte-rendu de visite technique, en PDF, tel que le client le reçoit
 * dans son espace : même habit que les devis et les factures de l'espace
 * (bandeau noir, logo blanc, filet jaune, Roboto).
 *
 * Il ne met en page que le contenu figé à la signature : les pièces, le
 * métré, les accès, les options proposées, les remarques, quelques photos
 * par pièce, puis la signature (nom, image, heure du serveur) et l'empreinte
 * SHA-256 du contenu signé. Il est produit une fois, à la signature, et
 * rangé dans le seau privé : il ne change plus.
 */

const s = StyleSheet.create({
  page: { fontFamily: "RobotoEC", fontSize: 9.5, color: C.noir, paddingBottom: 64 },
  corps: { paddingHorizontal: 40, paddingTop: 24 },
  deuxCol: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  fort: { fontSize: 12, fontWeight: 700 },
  doux: { fontSize: 9, color: C.gris, marginTop: 3 },
  titre: { fontSize: 21, fontWeight: 900, letterSpacing: -0.4, marginTop: 20 },
  sousTitre: { fontSize: 9.5, color: C.gris, marginTop: 4 },
  chiffres: { flexDirection: "row", marginTop: 16 },
  chiffreNoir: { flex: 1.5, backgroundColor: C.noir, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 14, marginRight: 8 },
  chiffreClair: { flex: 1, backgroundColor: C.fond, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 14, marginRight: 8 },
  chiffreEtiquette: { fontSize: 7, letterSpacing: 1, fontWeight: 500, color: C.gris },
  chiffreValeur: { fontSize: 18, fontWeight: 900, marginTop: 3 },
  section: { flexDirection: "row", alignItems: "center", marginTop: 20, marginBottom: 8 },
  barre: { width: 6, height: 13, borderRadius: 2, backgroundColor: C.jaune, marginRight: 7 },
  sectionTexte: { fontSize: 11.5, fontWeight: 900 },
  etape: { flexDirection: "row", paddingVertical: 7, borderBottomWidth: 0.6, borderBottomColor: C.trait },
  point: { width: 17, height: 17, borderRadius: 9, backgroundColor: C.jaune, color: C.noir, fontSize: 8, fontWeight: 900, textAlign: "center", paddingTop: 3.5, marginRight: 9 },
  genre: { width: 70, fontSize: 7.5, letterSpacing: 0.8, fontWeight: 700, color: C.gris, paddingTop: 3 },
  adresse: { fontSize: 10, fontWeight: 700 },
  acces: { fontSize: 8.5, color: C.gris, marginTop: 2 },
  th: { flexDirection: "row", backgroundColor: C.noir, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  thTexte: { fontSize: 7, letterSpacing: 1, color: C.jaune, fontWeight: 500 },
  piece: { flexDirection: "row", backgroundColor: C.fond, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 10, marginTop: 8 },
  pieceNom: { flex: 1, fontSize: 10, fontWeight: 900 },
  pieceVol: { width: 70, textAlign: "right", fontSize: 10, fontWeight: 900 },
  tr: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: C.trait },
  cLib: { flex: 1, paddingRight: 8 },
  cQte: { width: 40, textAlign: "right" },
  cU: { width: 60, textAlign: "right", color: C.gris },
  cVol: { width: 70, textAlign: "right", fontWeight: 700 },
  marque: { fontSize: 7, color: C.or, fontWeight: 700, letterSpacing: 0.5 },
  remarque: { fontSize: 8.5, color: C.gris, paddingHorizontal: 10, paddingTop: 5 },
  photos: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 10, paddingTop: 6 },
  photo: { width: 118, height: 88, borderRadius: 4, marginRight: 6, marginBottom: 6, objectFit: "cover" },
  option: { flexDirection: "row", paddingVertical: 3 },
  coche: { width: 11, height: 11, borderRadius: 3, backgroundColor: C.jaune, marginRight: 7 },
  encadre: { backgroundColor: C.creme, borderLeftWidth: 3, borderLeftColor: C.jaune, borderRadius: 6, padding: 11, fontSize: 9.5, lineHeight: 1.45 },
  signature: { flexDirection: "row", marginTop: 22, borderWidth: 0.8, borderColor: C.trait, borderRadius: 8, padding: 14 },
  signatureImage: { width: 230, height: 92, objectFit: "contain" },
  cadreImage: { width: 240, height: 100, borderRadius: 6, backgroundColor: "#ffffff", borderWidth: 0.8, borderColor: C.trait, alignItems: "center", justifyContent: "center" },
  empreinte: { fontSize: 7.5, color: C.gris, marginTop: 8, letterSpacing: 0.4 },
  pied: { position: "absolute", bottom: 22, left: 40, right: 40, borderTopWidth: 0.6, borderTopColor: C.trait, paddingTop: 8, fontSize: 7.5, color: C.gris, flexDirection: "row", justifyContent: "space-between" },
});

function Section({ children }: { children: string }) {
  return (
    <View style={s.section} wrap={false}>
      <View style={s.barre} />
      <Text style={s.sectionTexte}>{children}</Text>
    </View>
  );
}

export interface SignatureCompteRendu {
  signataire: string;
  signeLe: string;
  empreinte: string;
  /** L'image PNG du tracé. */
  image: Buffer;
}

/** Les vignettes à joindre, par pièce (clé de la pièce) : quatre au plus par pièce. */
export type PhotosParPiece = Map<string, Buffer[]>;

export function pdfCompteRendu(c: ContenuCompteRendu, sig: SignatureCompteRendu, photos: PhotosParPiece = new Map()) {
  const nbPieces = c.pieces.length;
  // Depuis le 18/11/2026 : le volume transporté, distingué de ce qui ne l'est pas (destinations hors adresse).
  // Client CIMOB/DICOM : ses droits seulement, aucun volume relevé (regles.ts, droits_cimob).
  const cimob = c.droits_cimob;
  const distingue = !cimob && (c.volume_non_transporte != null || c.volume_debarras != null || c.volume_a_confirmer != null);
  const vol = (v: number) => (cimob ? " " : m3(v));
  return enBuffer(
    <Document title={`Compte-rendu de visite ${c.dossier.ref}`} author="Bailly Déménagement" subject="Compte-rendu de visite technique">
      <Page size="A4" style={s.page}>
        <Entete droite="COMPTE-RENDU DE VISITE" sous={`Dossier ${c.dossier.ref}`} />
        <View style={s.corps}>
          <View style={s.deuxCol}>
            <View>
              <Text style={s.fort}>{c.dossier.client}</Text>
              <Text style={s.doux}>{[c.dossier.contact, c.dossier.telephone, c.dossier.email].filter(Boolean).join(" · ") || " "}</Text>
            </View>
            <View>
              <Text style={[s.fort, { textAlign: "right" }]}>Dossier {c.dossier.ref}</Text>
              <Text style={[s.doux, { textAlign: "right" }]}>{c.visite.commercial ? `Conseiller : ${c.visite.commercial}` : " "}</Text>
            </View>
          </View>

          <Text style={s.titre}>Visite technique du {jourVisite(c.visite.le, true)}</Text>
          <Text style={s.sousTitre}>
            {c.visite.mode === "visio" ? "En visio" : "Sur place"} · {momentVisite(c.visite.le)}
            {c.visite.commercial ? ` · ${c.visite.commercial}` : ""}
          </Text>

          <View style={s.chiffres}>
            <View style={s.chiffreNoir}>
              <Text style={[s.chiffreEtiquette, { color: C.jaune }]}>{cimob ? "VOS DROITS" : distingue ? "VOLUME TRANSPORTÉ" : "VOLUME RELEVÉ"}</Text>
              <Text style={[s.chiffreValeur, { color: "#ffffff" }]}>{cimob ? (cimob.volume ? m3(cimob.volume) : "—") : m3(c.volume)}</Text>
            </View>
            <View style={s.chiffreClair}>
              <Text style={s.chiffreEtiquette}>PIÈCES</Text>
              <Text style={s.chiffreValeur}>{nbPieces}</Text>
            </View>
            <View style={s.chiffreClair}>
              <Text style={s.chiffreEtiquette}>OBJETS</Text>
              <Text style={s.chiffreValeur}>{c.nb_objets}</Text>
            </View>
            <View style={[s.chiffreClair, { marginRight: 0 }]}>
              <Text style={s.chiffreEtiquette}>PHOTOS</Text>
              <Text style={s.chiffreValeur}>{c.nb_photos}</Text>
            </View>
          </View>

          {distingue && (
            <>
              <Section>Volume transporté et non transporté</Section>
              <View style={s.tr} wrap={false}>
                <View style={s.cLib}>
                  <Text>Volume transporté</Text>
                  {c.volume_debarras || c.volume_a_confirmer ? (
                    <Text style={s.marque}>
                      {[c.volume_debarras ? `DONT DÉBARRAS ${m3(c.volume_debarras)}` : null, c.volume_a_confirmer ? `DONT À CONFIRMER ${m3(c.volume_a_confirmer)}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  ) : null}
                </View>
                <Text style={s.cQte}> </Text>
                <Text style={s.cU}> </Text>
                <Text style={s.cVol}>{m3(c.volume)}</Text>
              </View>
              {c.volume_non_transporte != null && (
                <View style={s.tr} wrap={false}>
                  <View style={s.cLib}>
                    <Text>Non transporté</Text>
                    <Text style={s.marque}>À LAISSER SUR PLACE, PRIS EN CHARGE PAR LE CLIENT</Text>
                  </View>
                  <Text style={s.cQte}> </Text>
                  <Text style={s.cU}> </Text>
                  <Text style={s.cVol}>{m3(c.volume_non_transporte)}</Text>
                </View>
              )}
            </>
          )}

          {c.destinations && c.destinations.length > 0 && (
            <>
              <Section>{cimob ? "Objets par destination" : "Volume par destination"}</Section>
              {c.destinations.map((d) => (
                <View key={d.libelle} style={s.tr} wrap={false}>
                  <Text style={s.cLib}>
                    {d.libelle}
                    {d.non_transporte ? <Text style={{ color: C.gris }}> · non transporté</Text> : null}
                  </Text>
                  <Text style={s.cQte}>{d.objets}</Text>
                  <Text style={s.cU}> </Text>
                  <Text style={s.cVol}>{vol(d.volume)}</Text>
                </View>
              ))}
            </>
          )}

          {c.trajet.length > 0 && (
            <>
              <Section>Adresses et accès</Section>
              {c.trajet.map((e, i) => (
                <View key={i} style={s.etape} wrap={false}>
                  <Text style={s.point}>{i + 1}</Text>
                  <Text style={s.genre}>{e.libelle.toUpperCase()}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.adresse}>{e.adresse}</Text>
                    <Text style={s.acces}>{resumeAcces(e) || "Accès non précisés"}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          <Section>Inventaire pièce par pièce</Section>
          <View style={s.th}>
            <Text style={[s.thTexte, s.cLib]}>OBJET</Text>
            <Text style={[s.thTexte, s.cQte]}>QTÉ</Text>
            <Text style={[s.thTexte, s.cU]}>{cimob ? " " : "UNITAIRE"}</Text>
            <Text style={[s.thTexte, s.cVol]}>{cimob ? " " : "VOLUME"}</Text>
          </View>
          {c.pieces.length === 0 && <Text style={[s.doux, { paddingHorizontal: 10, paddingTop: 8 }]}>Aucun objet relevé.</Text>}
          {c.pieces.map((p) => {
            const vignettes = (photos.get(p.cle) ?? []).slice(0, 4);
            return (
              <View key={p.cle}>
                <View style={s.piece} wrap={false}>
                  <Text style={s.pieceNom}>{p.nom}</Text>
                  <Text style={s.pieceVol}>{vol(p.volume)}</Text>
                </View>
                {p.objets.map((o, i) => (
                  <View key={i} style={s.tr} wrap={false}>
                    <View style={s.cLib}>
                      <Text>
                        {o.libelle}
                        {o.libelle_en ? <Text style={{ color: C.gris }}> / {o.libelle_en}</Text> : null}
                      </Text>
                      {(o.demontage || o.fragile || o.note || o.destination) && (
                        <Text style={s.marque}>
                          {[o.demontage ? "DÉMONTAGE" : null, o.fragile ? "FRAGILE" : null, o.note, o.destination ? `→ ${o.destination}` : null].filter(Boolean).join(" · ")}
                        </Text>
                      )}
                    </View>
                    <Text style={s.cQte}>{o.quantite}</Text>
                    <Text style={s.cU}>{cimob ? " " : o.hors_cubage ? "—" : m3Fin(o.volume_unitaire)}</Text>
                    <Text style={s.cVol}>{cimob ? " " : o.hors_cubage ? "non compté" : m3(o.volume)}</Text>
                  </View>
                ))}
                {p.remarque ? <Text style={s.remarque}>{p.remarque}</Text> : null}
                {vignettes.length > 0 && (
                  <View style={s.photos} wrap={false}>
                    {vignettes.map((b, i) => (
                      // Le composant Image de react-pdf n'a pas d'attribut alt.
                      // eslint-disable-next-line jsx-a11y/alt-text
                      <Image key={i} src={{ data: b, format: "jpg" }} style={s.photo} />
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          {(c.options.length > 0 || c.formule) && (
            <>
              <Section>Prestations proposées</Section>
              {c.formule && (
                <Text style={{ marginBottom: 6 }}>
                  Formule envisagée : <Text style={{ fontWeight: 700 }}>{c.formule.nom}</Text> · {c.formule.sous.toLowerCase()}
                </Text>
              )}
              {c.options.map((o) => (
                <View key={o} style={s.option} wrap={false}>
                  <View style={s.coche}>
                    <Svg width={11} height={11} viewBox="0 0 24 24">
                      <Path d="m5 12.5 4.5 4.5L19 7.5" stroke={C.noir} strokeWidth={3.4} fill="none" />
                    </Svg>
                  </View>
                  <Text>{o}</Text>
                </View>
              ))}
            </>
          )}

          {c.remarques && (
            <>
              <Section>Remarques</Section>
              <Text style={s.encadre}>{c.remarques}</Text>
            </>
          )}

          <View style={s.signature} wrap={false}>
            <View style={{ flex: 1, paddingRight: 14 }}>
              <Text style={s.chiffreEtiquette}>COMPTE-RENDU SIGNÉ PAR</Text>
              <Text style={[s.fort, { marginTop: 4 }]}>{sig.signataire}</Text>
              <Text style={s.doux}>Le {momentVisite(sig.signeLe, true)} (heure du serveur)</Text>
              <Text style={s.empreinte}>Empreinte SHA-256 du contenu signé :</Text>
              <Text style={[s.empreinte, { marginTop: 2, color: C.noir }]}>{(sig.empreinte.match(/.{1,8}/g) ?? []).join(" ")}</Text>
            </View>
            <View style={s.cadreImage}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={{ data: sig.image, format: "png" }} style={s.signatureImage} />
            </View>
          </View>
        </View>
        <View style={s.pied} fixed>
          <Text>Bailly Déménagement · Compte-rendu de visite technique · signature électronique simple</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}
