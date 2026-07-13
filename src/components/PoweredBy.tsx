import { useState } from "react";

// Logo servida estaticamente de public/rm-tecnologia-logo.png.
// (A antiga URL /__l5e/... da Lovable não existe no build de produção.)
export function PoweredBy() {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-muted-foreground">
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
        <span className="font-semibold text-[#FC5201]">R&amp;M Tecnologia</span>
      )}
    </div>
  );
}
