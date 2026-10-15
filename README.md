# misbah-cbct

Browser viewer for a Sirona GALILEOS dental CBCT exported to USB. React, Vite, and TypeScript. The scan stays on the USB; this app only reads it.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173 with the USB plugged in. If the drive is mounted somewhere else, set `SCAN_ROOT` to that path before starting, or use the folder picker on the page.
