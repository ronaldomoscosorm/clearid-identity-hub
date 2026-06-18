import rmLogo from "@/assets/rm-tecnologia-logo.png.asset.json";

export function PoweredBy() {
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-muted-foreground">
      <span>Powered by</span>
      <img
        src={rmLogo.url}
        alt="R&M Tecnologia"
        className="h-6 w-auto opacity-80"
        loading="lazy"
      />
    </div>
  );
}