import { useSyncExternalStore } from "react";

export type ArgusEnvKey = "demo" | "prod";

export interface ArgusEnvConfig {
  baseUrl: string;
  apiKey: string;
}

const ENV_KEY = "argus.env";
const CFG_KEY = "argus.config";

const DEFAULTS: Record<ArgusEnvKey, ArgusEnvConfig> = {
  demo: { baseUrl: "https://argusclearidapi.rmtecho.com.br", apiKey: "" },
  prod: { baseUrl: "https://argusclearidapi.rmtecho.com.br", apiKey: "" },
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function getCurrentEnv(): ArgusEnvKey {
  if (!isBrowser()) return "demo";
  const v = localStorage.getItem(ENV_KEY);
  return v === "prod" ? "prod" : "demo";
}

export function setCurrentEnv(env: ArgusEnvKey) {
  if (!isBrowser()) return;
  localStorage.setItem(ENV_KEY, env);
  notify();
}

export function getAllConfigs(): Record<ArgusEnvKey, ArgusEnvConfig> {
  if (!isBrowser()) return DEFAULTS;
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Record<ArgusEnvKey, ArgusEnvConfig>>;
    return {
      demo: { ...DEFAULTS.demo, ...(parsed.demo ?? {}) },
      prod: { ...DEFAULTS.prod, ...(parsed.prod ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

export function getEnvConfig(env: ArgusEnvKey = getCurrentEnv()): ArgusEnvConfig {
  return getAllConfigs()[env];
}

export function saveConfigs(cfg: Record<ArgusEnvKey, ArgusEnvConfig>) {
  if (!isBrowser()) return;
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  notify();
}

// Pub/sub for useSyncExternalStore
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === ENV_KEY || e.key === CFG_KEY) cb();
  };
  if (isBrowser()) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (isBrowser()) window.removeEventListener("storage", onStorage);
  };
}

export function useArgusEnv() {
  const env = useSyncExternalStore(
    subscribe,
    () => getCurrentEnv(),
    () => "demo" as ArgusEnvKey,
  );
  const config = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(getEnvConfig(env)),
    () => JSON.stringify(DEFAULTS.demo),
  );
  return {
    env,
    setEnv: setCurrentEnv,
    config: JSON.parse(config) as ArgusEnvConfig,
  };
}

export function useArgusConfigs() {
  const data = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(getAllConfigs()),
    () => JSON.stringify(DEFAULTS),
  );
  return JSON.parse(data) as Record<ArgusEnvKey, ArgusEnvConfig>;
}