import "server-only";
import { crc32 } from "node:zlib";
import { lienValide, lireOctets } from "./fichiers";
import { nomClient } from "./format";
import { snapshotDe } from "./lectures";
import { pdfDevis, pdfFacture, pdfTemoin } from "./pdf";
import { fichiersDuDossier, GROUPES_FICHIERS, type FichierDossier } from "./pieces-jointes";
import type { Donnees } from "./types";

/*
 * « Tout télécharger » : toutes les pièces jointes d'UN dossier, en une
 * archive ZIP produite à la volée.
 *
 * - La porte est celle de l'équipe seulement (routes-equipe.ts) : la route
 *   revérifie la session d'un membre de l'équipe, et le lien est signé pour
 *   ce dossier, cinq minutes (lienArchive) — comme chaque fichier.
 * - La liste vient du seul dossier demandé (fichiersDuDossier sur son
 *   instantané) : aucune pièce d'un autre dossier ne peut y entrer.
 * - Les fichiers sont lus un par un et écrits aussitôt : la mémoire ne tient
 *   jamais qu'un fichier à la fois (10 Mo au plus).
 *
 * Le format est le ZIP « stocké », sans compression : PDF et photos sont
 * déjà compressés, et l'archive s'ouvre partout (noms en UTF-8).
 */

const TEXTE = new TextEncoder();

/** Une date ISO, à l'heure de Paris, au format MS-DOS du ZIP. */
function dateDos(iso: string) {
  const d = new Date(iso);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(Number.isNaN(d.getTime()) ? new Date() : d)
      .map((x) => [x.type, Number(x.value)]),
  ) as Record<string, number>;
  return {
    heure: ((p.hour % 24) << 11) | (p.minute << 5) | Math.floor(p.second / 2),
    jour: ((Math.max(p.year, 1980) - 1980) << 9) | (p.month << 5) | p.day,
  };
}

/** Un nom de fichier sûr dans une archive : ni barre, ni caractère de contrôle, ni « .. ». */
const nomSur = (s: string) =>
  s
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "fichier";

const extension = (f: FichierDossier) => {
  const m = /\.([a-z0-9]{2,5})$/i.exec(f.nom);
  if (m) return m[1].toLowerCase();
  return f.mime === "application/pdf" ? "pdf" : f.mime.startsWith("image/") ? f.mime.slice(6).replace("jpeg", "jpg") : "bin";
};

type Entree = { nom: Uint8Array; crc: number; taille: number; heure: number; jour: number; decalage: number };

function enTeteLocal(e: Omit<Entree, "decalage">) {
  const b = Buffer.alloc(30);
  b.writeUInt32LE(0x04034b50, 0);
  b.writeUInt16LE(20, 4); // version requise
  b.writeUInt16LE(0x0800, 6); // noms en UTF-8
  b.writeUInt16LE(0, 8); // stocké
  b.writeUInt16LE(e.heure, 10);
  b.writeUInt16LE(e.jour, 12);
  b.writeUInt32LE(e.crc >>> 0, 14);
  b.writeUInt32LE(e.taille, 18);
  b.writeUInt32LE(e.taille, 22);
  b.writeUInt16LE(e.nom.length, 26);
  b.writeUInt16LE(0, 28);
  return Buffer.concat([b, e.nom]);
}

function enTeteCentral(e: Entree) {
  const b = Buffer.alloc(46);
  b.writeUInt32LE(0x02014b50, 0);
  b.writeUInt16LE(20, 4);
  b.writeUInt16LE(20, 6);
  b.writeUInt16LE(0x0800, 8);
  b.writeUInt16LE(0, 10);
  b.writeUInt16LE(e.heure, 12);
  b.writeUInt16LE(e.jour, 14);
  b.writeUInt32LE(e.crc >>> 0, 16);
  b.writeUInt32LE(e.taille, 20);
  b.writeUInt32LE(e.taille, 24);
  b.writeUInt16LE(e.nom.length, 28);
  // extra, commentaire, disque, attributs : zéro
  b.writeUInt32LE(e.decalage, 42);
  return Buffer.concat([b, e.nom]);
}

function finCentrale(n: number, taille: number, decalage: number) {
  const b = Buffer.alloc(22);
  b.writeUInt32LE(0x06054b50, 0);
  b.writeUInt16LE(n, 8);
  b.writeUInt16LE(n, 10);
  b.writeUInt32LE(taille, 12);
  b.writeUInt32LE(decalage, 16);
  return b;
}

const refus = (texte: string, status: number) => new Response(texte, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * L'archive d'un dossier, une fois le lien vérifié. L'appelant a déjà
 * établi que c'est l'équipe (session vérifiée) : ici, le lien et le dossier.
 * `noter` : pour le journal, le nombre de fichiers partis.
 */
export async function servirArchive(d: Donnees, dossierId: string, url: URL, noter?: (info: { reference: string; crm: number | null; fichiers: number }) => Promise<void>): Promise<Response> {
  if (!lienValide("archive", dossierId, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return refus("Lien expiré ou invalide : rechargez la page pour en obtenir un nouveau.", 403);
  }
  const s = snapshotDe(d, dossierId);
  if (!s) return refus("Introuvable.", 404);
  const fichiers = fichiersDuDossier(s, d.conseillers);
  if (!fichiers.length) return refus("Ce dossier n'a encore aucune pièce jointe.", 404);

  // Les noms dans l'archive : un dossier par groupe, sans doublon.
  const pris = new Set<string>();
  const nomDans = (f: FichierDossier) => {
    const dossier = GROUPES_FICHIERS.find((g) => g.cle === f.groupe)!.dossier;
    const base = nomSur(f.libelle === f.nom ? f.libelle.replace(/\.[a-z0-9]{2,5}$/i, "") : f.libelle);
    const ext = extension(f);
    let nom = `${dossier}/${base}.${ext}`;
    for (let i = 2; pris.has(nom.toLowerCase()); i++) nom = `${dossier}/${base} (${i}).${ext}`;
    pris.add(nom.toLowerCase());
    return nom;
  };

  /** Les octets d'une pièce : le seau, sinon le PDF produit, sinon la page témoin (documents du jeu de démonstration). */
  const octets = async (f: FichierDossier): Promise<Buffer | null> => {
    if (f.type === "devis") {
      const v = s.devis.find((x) => x.id === f.id)!;
      return pdfDevis(s.client, s.dossier, v);
    }
    if (f.type === "facture") {
      const x = s.factures.find((y) => y.id === f.id)!;
      return pdfFacture(s.client, s.dossier, x);
    }
    const lu = f.chemin ? await lireOctets(f.chemin) : null;
    if (lu) return lu.donnees;
    const doc = f.type === "doc" ? s.documents.find((x) => x.id === f.id) : null;
    return doc ? pdfTemoin(s.dossier, doc) : null;
  };

  const entrees: Entree[] = [];
  const absents: string[] = [];
  let decalage = 0;
  let i = 0;
  let fini = false;

  const flux = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      if (fini) return;
      // Un fichier par appel : lu, puis écrit aussitôt.
      while (i < fichiers.length) {
        const f = fichiers[i++];
        const donnees = await octets(f).catch(() => null);
        if (!donnees) {
          absents.push(`${f.libelle} (${f.nom})`);
          continue;
        }
        const nomFichier = nomDans(f);
        const { heure, jour } = dateDos(f.le);
        const e = { nom: TEXTE.encode(nomFichier), crc: crc32(donnees), taille: donnees.length, heure, jour };
        const tete = enTeteLocal(e);
        entrees.push({ ...e, decalage });
        decalage += tete.length + donnees.length;
        ctrl.enqueue(new Uint8Array(tete));
        ctrl.enqueue(new Uint8Array(donnees));
        return;
      }
      // Les pièces introuvables dans le stockage : dites, plutôt que de disparaître en silence.
      if (absents.length) {
        const texte = Buffer.from(`Ces pièces n'ont pas pu être lues dans le stockage au moment de l'archive :\r\n\r\n${absents.map((a) => `- ${a}`).join("\r\n")}\r\n`, "utf8");
        const { heure, jour } = dateDos(new Date().toISOString());
        const e = { nom: TEXTE.encode("Pièces manquantes dans l'archive.txt"), crc: crc32(texte), taille: texte.length, heure, jour };
        const tete = enTeteLocal(e);
        entrees.push({ ...e, decalage });
        decalage += tete.length + texte.length;
        ctrl.enqueue(new Uint8Array(tete));
        ctrl.enqueue(new Uint8Array(texte));
        absents.length = 0;
        return;
      }
      const centrale = Buffer.concat(entrees.map(enTeteCentral));
      ctrl.enqueue(new Uint8Array(centrale));
      ctrl.enqueue(new Uint8Array(finCentrale(entrees.length, centrale.length, decalage)));
      fini = true;
      ctrl.close();
      await noter?.({ reference: s.dossier.reference, crm: s.dossier.crm_dossier_id ?? null, fichiers: entrees.length }).catch(() => undefined);
    },
  });

  const nom = `${s.dossier.reference} - ${s.client.societe || nomClient(s.client)} - pièces jointes.zip`;
  const ascii = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.() -]+/g, "_");
  return new Response(flux, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
