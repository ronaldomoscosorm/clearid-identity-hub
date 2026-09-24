// Marca da R&M Tecnologia recriada em SVG (renderiza em qualquer ambiente,
// sem depender de arquivo/CDN). Usada como ícone do "Powered by".
export function RmLogo({ className }: { className?: string }) {
  const navy = "#17324a";
  const orange = "#f4571f";
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="R&M Tecnologia"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 4 pétalas navy em pinwheel (canto externo arredondado) */}
      <path
        fill={navy}
        d="M38 6 H40 A6 6 0 0 1 46 12 V44 A2 2 0 0 1 44 46 H12 A6 6 0 0 1 6 40 V38 A32 32 0 0 1 38 6 Z"
      />
      <path
        fill={navy}
        d="M60 6 H62 A32 32 0 0 1 94 38 V40 A6 6 0 0 1 88 46 H56 A2 2 0 0 1 54 44 V12 A6 6 0 0 1 60 6 Z"
      />
      <path
        fill={navy}
        d="M12 54 H44 A2 2 0 0 1 46 56 V88 A6 6 0 0 1 40 94 H38 A32 32 0 0 1 6 62 V60 A6 6 0 0 1 12 54 Z"
      />
      <path
        fill={navy}
        d="M56 54 H88 A6 6 0 0 1 94 60 V62 A32 32 0 0 1 62 94 H60 A6 6 0 0 1 54 88 V56 A2 2 0 0 1 56 54 Z"
      />
      {/* círculo branco + estrela laranja na pétala superior esquerda */}
      <circle cx="26" cy="26" r="15" fill="#fff" />
      <path
        fill={orange}
        d="M26 15 C27 22 30 25 37 26 C30 27 27 30 26 37 C25 30 22 27 15 26 C22 25 25 22 26 15 Z"
      />
    </svg>
  );
}
