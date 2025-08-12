# 🎧 Figma for Music – Multiplayer Patch + Studio (Fixed)

## Run
```bash
npm install
npm run dev
```
Studio: http://localhost:5173/
Patch:  http://localhost:5173/#/patch (open twice for co‑presence)

## Troubleshooting
- TS cannot find module '*.vue' → fixed with `src/env.d.ts`.
- Node 20+ recommended. If you use nvm: `nvm use 20`.
- Yjs demo websocket might be blocked by corporate networks; change `src/realtime/yDoc.ts`.
- Allow mic permissions and click once to start audio.
