import type { RequestRow, PricingGridRow } from "@/lib/types";

export interface QuoteLine {
  label: string;
  amount: number;
}

export interface QuoteResult {
  lines: QuoteLine[];
  ht: number;
  tva: number;
  ttc: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Calcule une estimation de devis à partir d'une demande et d'une grille.
export function estimateQuote(req: RequestRow, grid: PricingGridRow): QuoteResult {
  const volume = req.volume_m3 ?? 0;
  const distance = req.distance_km ?? 0;
  const services = req.services ?? {};

  const lines: QuoteLine[] = [];

  lines.push({ label: "Forfait de base", amount: grid.base_price });

  // Volume : paliers si définis, sinon prix/m³ unique
  const perM3 = tierRate(volume, grid);
  if (volume > 0) {
    lines.push({ label: `Volume · ${volume} m³ × ${perM3} €`, amount: r2(volume * perM3) });
  }

  if (distance > 0) {
    lines.push({
      label: `Distance · ${distance} km × ${grid.price_per_km} €`,
      amount: r2(distance * grid.price_per_km),
    });
  }

  const floors =
    (req.depart_ascenseur ? 0 : req.depart_etage ?? 0) +
    (req.arrivee_ascenseur ? 0 : req.arrivee_etage ?? 0);
  if (floors > 0 && grid.floor_surcharge > 0) {
    lines.push({
      label: `Étages sans ascenseur · ${floors} × ${grid.floor_surcharge} €`,
      amount: r2(floors * grid.floor_surcharge),
    });
  }

  if (services.emballage && grid.packing_price_per_m3 > 0) {
    lines.push({
      label: `Emballage · ${volume} m³ × ${grid.packing_price_per_m3} €`,
      amount: r2(volume * grid.packing_price_per_m3),
    });
  }

  if (services.monte_meuble && grid.furniture_lift_price > 0) {
    lines.push({ label: "Monte-meuble", amount: grid.furniture_lift_price });
  }

  let ht = r2(lines.reduce((s, l) => s + l.amount, 0));

  if (ht < grid.min_price) {
    lines.push({ label: "Ajustement prix plancher", amount: r2(grid.min_price - ht) });
    ht = grid.min_price;
  }

  const tva = r2((ht * grid.vat_rate) / 100);
  return { lines, ht: r2(ht), tva, ttc: r2(ht + tva) };
}

function tierRate(volume: number, grid: PricingGridRow): number {
  const tiers = Array.isArray(grid.tiers) ? grid.tiers : [];
  const match = tiers.find((t) => volume >= t.min_m3 && volume <= t.max_m3);
  return match ? match.price_per_m3 : grid.price_per_m3;
}
