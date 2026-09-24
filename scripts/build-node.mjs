// Build para servidor Node (deploy em IIS via reverse proxy).
// - Força o preset Nitro "node-server" (o default do projeto é Cloudflare).
// - Invoca o Vite via `node node_modules/vite/bin/vite.js` para não quebrar em
//   caminhos com "&" (ex.: "R&M Tecnologia") no Windows.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = resolve(root, "node_modules/vite/bin/vite.js");

const result = spawnSync(process.execPath, [viteBin, "build"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NITRO_PRESET: "node-server" },
});

process.exit(result.status ?? 1);
