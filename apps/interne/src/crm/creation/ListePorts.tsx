import { PORTS } from "@/lib/ports";

/**
 * Les suggestions d'une case Port (Céline, 18/11/2026) : les ports du
 * référentiel (lib/ports.ts), chacun avec son département ou son territoire.
 * Une liste du navigateur, reliée aux cases par `list` : la saisie libre
 * reste possible (un port étranger, un port absent de la liste).
 */
export default function ListePorts({ id }: { id: string }) {
  return (
    <datalist id={id}>
      {PORTS.map((p) => (
        <option key={p.nom} value={p.nom}>
          {p.lieu}
        </option>
      ))}
    </datalist>
  );
}
