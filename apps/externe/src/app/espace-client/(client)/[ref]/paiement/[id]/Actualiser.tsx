"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Tant que le paiement attend sa confirmation, la page se relit toute seule
 * — toutes les quatre secondes, une minute au plus : au-delà, c'est un
 * paiement différé, que l'e-mail de confirmation annoncera.
 */
export function Actualiser() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      if (n > 15) clearInterval(t);
      else router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
