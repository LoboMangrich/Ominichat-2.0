import { useEffect, useState } from "react";

/** Data/hora atual (ms) que se atualiza a cada `intervalMs` — para regras que mudam com a tela aberta. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
