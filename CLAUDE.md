# Arxiu

Arxiu personal d'un sol usuari per guardar, ordenar i compartir documents. Tota la interfície, els missatges d'error, els comentaris i els commits són **en català**.

## Estructura

- `server/` — API en Node.js 22 (TypeScript executat directament, sense compilar) amb Fastify i `node:sqlite`.
  - `app.ts` (configuració, seguretat, `/api/health`), `routes/` (auth, account, library), `auth/` (scrypt, TOTP, sessions), `files/` (emmagatzematge i detecció de tipus), `cli/` (`user.ts`, `backup.ts`).
- `shared/` — codi compartit entre servidor i web (regles de contrasenya, categories).
- `src/` — web en React 19 + React Router + Vite. Estils a `src/styles.css` amb els tokens del sistema de disseny «Arxiu» (clar i fosc).
- `tests/` — proves de l'API amb Vitest (`app.inject`).
- `deploy/` — desplegament al VPS: Docker Compose (Caddy + arxiu), `Caddyfile`, `backup.sh`, guia `deploy/README.md`.

## Ordres

- `npm run dev` — API (port 3000) + web (port 5173).
- `npm test` i `npm run typecheck` — executa-les abans de cada commit.
- `npm run build` — compila la web a `dist/`.

## Regles

- Imports del servidor amb extensió `.ts` i només sintaxi esborrable (sense `enum` ni propietats als constructors).
- Mai no posis secrets al repositori. `deploy/.env` (servidor) i `.env` (local) no es pugen mai.
- Per gestionar el servidor de producció, segueix la skill `servidor` (`.claude/skills/servidor/SKILL.md`).
