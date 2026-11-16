/*
 * Les photos de la visite qui n'ont pas encore rejoint le serveur, gardées
 * sur la tablette (IndexedDB : quelques centaines de Ko par photo, trop pour
 * le localStorage). Une photo prise sans réseau y attend son envoi ; elle
 * survit à la fermeture de l'onglet et à la veille, et part d'elle-même au
 * retour du réseau. Elle en sort dès que le serveur l'a reçue.
 *
 * Si le navigateur refuse IndexedDB (navigation privée…), chaque fonction
 * échoue sans bruit : la photo reste dans la mémoire de l'onglet, comme avant.
 */

export interface PhotoLocale {
  cle: string;
  visite: number;
  piece: string;
  photo: Blob;
  vignette: Blob | null;
  largeur?: number;
  hauteur?: number;
  le: number;
}

const BASE = "bailly-tablette";
const MAGASIN = "photos";

let ouverture: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB absent"));
  ouverture ??= new Promise<IDBDatabase>((ok, ko) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(MAGASIN)) db.createObjectStore(MAGASIN, { keyPath: "cle" }).createIndex("visite", "visite");
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
    r.onblocked = () => ko(new Error("IndexedDB bloquée"));
  }).catch((e) => {
    ouverture = null;
    throw e;
  });
  return ouverture;
}

function demande<T>(mode: IDBTransactionMode, faire: (m: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return ouvrir().then(
    (db) =>
      new Promise<T>((ok, ko) => {
        const t = db.transaction(MAGASIN, mode);
        const r = faire(t.objectStore(MAGASIN));
        t.oncomplete = () => ok(r.result);
        t.onerror = () => ko(t.error);
        t.onabort = () => ko(t.error);
      }),
  );
}

/** Garde une photo sur la tablette. Rend faux si ce n'est pas possible (elle reste alors en mémoire). */
export async function garderPhoto(p: PhotoLocale): Promise<boolean> {
  try {
    await demande("readwrite", (m) => m.put(p));
    return true;
  } catch {
    return false;
  }
}

/** Les photos d'une visite qui attendent encore leur envoi, dans l'ordre où elles ont été prises. */
export async function photosLocales(visite: number): Promise<PhotoLocale[]> {
  try {
    const l = await demande<PhotoLocale[]>("readonly", (m) => m.index("visite").getAll(visite));
    return l.sort((a, b) => a.le - b.le);
  } catch {
    return [];
  }
}

/** Retire une photo de la tablette (reçue par le serveur, ou retirée par le commercial). */
export async function oublierPhoto(cle: string) {
  try {
    await demande("readwrite", (m) => m.delete(cle));
  } catch {
    // Rien à faire : au pire, elle sera renvoyée, et le serveur la reconnaîtra à sa clé.
  }
}
