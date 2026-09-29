# AI Workspace frontend

React and Vite frontend for the existing FastAPI backend. The workspace contains Chat, Image generation, and a LiveKit voice session.

## Run locally

Use Node.js 22.22 or newer. Start the backend on `http://127.0.0.1:8000`, then run:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` and `/health` to the local backend. For a different backend origin, copy `.env.example` to `.env` and set `VITE_API_BASE_URL`. Only put a public backend URL there: `VITE_` values are included in browser code.

Voice requires a secure browser context (`localhost` works), microphone permission, and working audio output. Start and End from the Voice workspace. Leaving that workspace also ends its active session.

## Verify

```powershell
npm test
npm run build
```

For a manual check, send a chat message, generate an image, and start a voice session. Speak and listen for the agent reply, then End and confirm the browser microphone indicator turns off. Repeat at desktop, tablet, and mobile widths.
