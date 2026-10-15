import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const SCAN_ROOT = process.env.SCAN_ROOT ?? "/media/sahil/disk";
const SLICE = /_vol_0_(\d{3})$/;

function findVolumeDir(root: string): string | null {
  if (!existsSync(root)) return null;
  for (const top of readdirSync(root)) {
    const topPath = join(root, top);
    if (!statSync(topPath).isDirectory()) continue;
    for (const inner of readdirSync(topPath)) {
      const innerPath = join(topPath, inner);
      if (inner.endsWith("_vol_0") && statSync(innerPath).isDirectory()) return innerPath;
    }
  }
  return null;
}

/** Serves the GALILEOS slice files from the USB at /scan/. Nothing is copied off the USB. */
function usbScan(): Plugin {
  return {
    name: "usb-scan",
    configureServer(server) {
      server.middlewares.use("/scan", (req, res) => {
        const dir = findVolumeDir(SCAN_ROOT);
        if (!dir) {
          res.statusCode = 404;
          res.end("USB scan not found");
          return;
        }
        const name = decodeURIComponent((req.url ?? "/").slice(1));
        if (name === "" || name === "index.json") {
          const slices = readdirSync(dir)
            .filter((f) => SLICE.test(f))
            .sort();
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ slices }));
          return;
        }
        if (!SLICE.test(name) || name.includes("/") || name.includes("..")) {
          res.statusCode = 400;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        createReadStream(join(dir, name)).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), usbScan()],
  server: { host: "127.0.0.1", port: 5173 },
});
