import type { Lang } from "@/lib/i18n";

// Bandeiras em SVG inline (renderizam igual em qualquer SO; Windows não
// exibe emoji de bandeira). Proporção 3:2, cantos arredondados.
export function FlagIcon({ lang, className }: { lang: Lang; className?: string }) {
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        width: "1.25rem",
        height: "0.833rem",
        borderRadius: "2px",
        overflow: "hidden",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1)",
        flexShrink: 0,
        lineHeight: 0,
      }}
      aria-hidden
    >
      {lang === "pt-BR" && <Brazil />}
      {lang === "en-US" && <Usa />}
      {lang === "es-ES" && <Spain />}
    </span>
  );
}

function Brazil() {
  return (
    <svg viewBox="0 0 24 16" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="16" fill="#009C3B" />
      <polygon points="12,2 22,8 12,14 2,8" fill="#FFDF00" />
      <circle cx="12" cy="8" r="3.4" fill="#002776" />
    </svg>
  );
}

function Usa() {
  const stripe = 16 / 13;
  return (
    <svg viewBox="0 0 24 16" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      {Array.from({ length: 13 }).map((_, i) => (
        <rect
          key={i}
          x="0"
          y={i * stripe}
          width="24"
          height={stripe}
          fill={i % 2 === 0 ? "#B22234" : "#FFFFFF"}
        />
      ))}
      <rect x="0" y="0" width="10" height={stripe * 7} fill="#3C3B6E" />
      {[1.6, 4, 6.4, 8.4].map((cx, r) =>
        [1.4, 3.4, 5.4].map((cy, c) => (
          <circle key={`${r}-${c}`} cx={cx} cy={cy + (r % 2) * 1} r="0.5" fill="#FFFFFF" />
        )),
      )}
    </svg>
  );
}

function Spain() {
  return (
    <svg viewBox="0 0 24 16" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="16" fill="#AA151B" />
      <rect y="4" width="24" height="8" fill="#F1BF00" />
    </svg>
  );
}
