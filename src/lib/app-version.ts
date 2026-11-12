// Detecta que uma versão mais nova do front foi publicada enquanto a aba estava
// aberta. Uma aba antiga continua rodando o código antigo até ser recarregada —
// e pode gravar com regras que já foram corrigidas.
//
// A "versão" é o arquivo de entrada com hash (/assets/index-XXXX.js): ele muda a
// cada publicação. Compara o que esta aba carregou com o que o servidor entrega
// agora no HTML. Em `vite dev` não há arquivo com hash, então nada é verificado.
import { useEffect, useState } from "react";

const ENTRY = /<script[^>]+src="(\/assets\/index-[^"]+\.js)"/;
const INTERVAL_MS = 5 * 60_000;

/** Arquivo de entrada carregado nesta aba (null em desenvolvimento). */
function loadedEntry(): string | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]');
  if (!el?.src) return null;
  try {
    return new URL(el.src).pathname;
  } catch {
    return null;
  }
}

/** Arquivo de entrada que o servidor entrega agora (null se não der para saber). */
async function deployedEntry(): Promise<string | null> {
  try {
    const res = await fetch(`/?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return ENTRY.exec(await res.text())?.[1] ?? null;
  } catch {
    return null; // sem rede: não é motivo para bloquear o usuário
  }
}

/**
 * true quando há uma versão publicada diferente da que esta aba está rodando.
 * Verifica ao abrir, a cada 5 minutos e sempre que a aba volta a ficar visível.
 */
export function useNewVersionAvailable(): boolean {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    const mine = loadedEntry();
    if (!mine) return;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      const current = await deployedEntry();
      if (!stopped && current && current !== mine) {
        stopped = true;
        setOutdated(true);
      }
    };
    void check();
    const timer = window.setInterval(check, INTERVAL_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return outdated;
}
