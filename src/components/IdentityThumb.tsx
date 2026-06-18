import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { argusApi } from "@/lib/argus-client";
import { useArgusEnv } from "@/lib/argus-env";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  identityId: string;
  className?: string;
}

export function IdentityThumb({ identityId, className }: Props) {
  const { env } = useArgusEnv();
  const [url, setUrl] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["identity-picture", env, identityId],
    queryFn: () => argusApi.getIdentityPicture(identityId),
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!q.data) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(q.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [q.data]);

  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted",
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <User className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}