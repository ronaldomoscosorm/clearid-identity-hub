import { useEffect, useState, type RefObject } from "react";
import { ScanFace } from "lucide-react";
import { loadFaceDetector } from "@/lib/face-detect";
import { useT } from "@/lib/i18n";

/**
 * Silhueta-guia (cabeça + ombros) desenhada sobre o vídeo da câmera. Escurece a
 * área externa ao busto e destaca o contorno; a cor reflete o estado da detecção
 * de pessoa (neutro quando indisponível, verde com pessoa, âmbar sem pessoa).
 */
export function SilhouetteGuide({ state }: { state: "neutral" | "ok" | "warn" }) {
  const stroke =
    state === "ok" ? "#34d399" : state === "warn" ? "#fbbf24" : "rgba(255,255,255,0.75)";
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <mask id="rm-bust-mask">
          <rect width="160" height="90" fill="white" />
          <ellipse cx="80" cy="33" rx="15" ry="19" fill="black" />
          <path d="M53 90 C53 68 64 60 80 60 C96 60 107 68 107 90 Z" fill="black" />
        </mask>
      </defs>
      <rect width="160" height="90" fill="rgba(0,0,0,0.45)" mask="url(#rm-bust-mask)" />
      <g fill="none" stroke={stroke} strokeWidth="0.7" strokeDasharray="2.5 2" strokeLinecap="round">
        <ellipse cx="80" cy="33" rx="15" ry="19" />
        <path d="M53 90 C53 68 64 60 80 60 C96 60 107 68 107 90" />
      </g>
    </svg>
  );
}

/**
 * Detecção de pessoa no vídeo. Retorna `null` enquanto indisponível/carregando
 * (silhueta como guia), `true`/`false` conforme houver rosto enquadrado.
 */
export function usePersonDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  active: boolean,
): boolean | null {
  const [detected, setDetected] = useState<boolean | null>(null);
  useEffect(() => {
    if (!active) {
      setDetected(null);
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    loadFaceDetector().then((det) => {
      if (!det || cancelled) return;
      timer = window.setInterval(async () => {
        const v = videoRef.current;
        if (!v) return;
        try {
          const ok = await det.detect(v);
          if (!cancelled) setDetected(ok);
        } catch {
          /* ignora falhas de frame */
        }
      }, 400);
    });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      setDetected(null);
    };
  }, [active, videoRef]);
  return detected;
}

/** Chip de status ("Pessoa detectada" / "Nenhuma pessoa detectada"). */
export function PersonBadge({ detected }: { detected: boolean | null }) {
  const { t } = useT();
  if (detected === null) return null;
  return (
    <div
      className={
        "absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white backdrop-blur " +
        (detected ? "bg-emerald-500/85" : "bg-amber-500/85")
      }
    >
      <ScanFace className="h-3.5 w-3.5" />
      {detected ? t("picturePanel.person.detected") : t("picturePanel.person.notDetected")}
    </div>
  );
}
