import { useState } from "react";
import { RmLogo } from "./RmLogo";

// "Powered by" com o ícone da R&M. Usa a imagem em public/rm-tecnologia-logo.png
// se existir; senão cai no ícone SVG (RmLogo), que sempre renderiza.
export function PoweredBy() {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className="flex items-center justify-center gap-1.5 py-4 text-[11px] text-muted-foreground">
      <span>Powered by</span>
      {imgOk ? (
        <img
          src="/rm-tecnologia-logo.png"
          alt="R&M Tecnologia"
          className="h-6 w-auto opacity-80"
          loading="lazy"
          onError={() => setImgOk(false)}
        />
      ) : (
        <span className="inline-flex items-center gap-1 font-semibold text-[#f4571f]">
          <RmLogo className="h-4 w-4" />
          R&amp;M Tecnologia
        </span>
      )}
    </div>
  );
}
