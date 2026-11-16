import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, "..");
const commun = path.join(racine, "packages/commun/src");

/** Les alias des deux apps (leurs tsconfig.json) : @/lib et @/components vers le code partagé, @/ vers l'app. */
const alias = (app: "externe" | "interne") => [
  { find: /^server-only$/, replacement: path.join(ici, "outils/server-only.ts") },
  { find: /^@\/lib\/(.*)$/, replacement: `${commun}/lib/$1` },
  { find: /^@\/components\/(.*)$/, replacement: `${commun}/components/$1` },
  { find: /^@\/(.*)$/, replacement: `${path.join(racine, "apps", app, "src")}/$1` },
];

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: alias("externe") },
        test: {
          name: "unitaires",
          include: ["unitaires/commun/**/*.test.ts", "unitaires/externe/**/*.test.ts"],
          environment: "node",
          setupFiles: [path.join(ici, "outils/env-unitaires.ts")],
        },
      },
      {
        resolve: { alias: alias("interne") },
        test: {
          name: "unitaires-interne",
          include: ["unitaires/interne/**/*.test.ts"],
          environment: "node",
          setupFiles: [path.join(ici, "outils/env-unitaires.ts")],
        },
      },
      {
        resolve: { alias: alias("externe") },
        test: {
          name: "base",
          include: ["base/**/*.test.ts"],
          environment: "node",
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
