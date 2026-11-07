# Arxiu

Arxiu personal i privat per guardar, ordenar i compartir documents: cartes, nòmines, factures, contractes… És una aplicació web d'un sol usuari que pots allotjar tu mateix.

Implementa el disseny «Arxiu — prototip» (escriptori i mòbil) amb el sistema de disseny *Arxiu* (tons cafè i caramel, tipografia Poppins, mode clar i fosc).

## Què fa

- **Accés segur**: correu + contrasenya (mín. 12 caràcters, majúscules/minúscules i número o símbol), sense comptes de tercers.
- **Verificació en dos passos** opcional amb qualsevol app TOTP (codi QR als ajustos).
- **Recuperació de contrasenya per correu** amb enllaç d'un sol ús que caduca en 30 minuts; en restablir-la es tanquen totes les sessions.
- **Tancament automàtic** de la sessió per inactivitat (5, 15, 30 o 60 minuts) i llista de **sessions obertes** per tancar-les a distància.
- **Pujada d'arxius** (PDF, JPG, PNG, HEIC, WEBP; fins a 50 MB): arrossegar i deixar anar a l'ordinador; càmera, galeria o arxius al mòbil. La categoria s'endevina pel nom i es pot canviar abans de pujar.
- **Biblioteca** agrupada per mesos, en quadrícula o llista, amb cerca, ordenació, categories (crear, reanomenar, eliminar) i filtres per període o rang de dates. Els filtres es guarden a la URL.
- **Visor** de PDF (pàgina a pàgina, amb pdf.js) i d'imatges, amb navegació anterior/següent, canvi de categoria i data, descàrrega i eliminació.
- **Compartir** amb enllaços temporals (24 h) que es poden revocar.
- **Còpia de seguretat**: exporta tots els documents en un `.zip` ordenat per categories.

## Tecnologia

- **Servidor**: Node.js 22 (≥ 22.18) amb TypeScript executat directament, [Fastify](https://fastify.dev) i SQLite integrat de Node (`node:sqlite`). Sense dependències natives.
- **Web**: React 19 + React Router + Vite. pdf.js per a les previsualitzacions i les miniatures (es generen al navegador abans de pujar).
- Els documents es guarden a disc (`DATA_DIR/files`), amb les metadades a `DATA_DIR/arxiu.db`.

## Posar-lo en marxa

```bash
npm install
```

```bash
npm run dev
```

Això arrenca l'API a `http://127.0.0.1:3000` i la web a `http://localhost:5173`. La primera vegada, el servidor escriu al registre un enllaç `…/configura?token=…` per crear el compte. També el pots crear des del terminal:

```bash
npm run user:create
```

Sense `SMTP_URL`, els correus (recuperació de contrasenya, canvi de correu) no s'envien: el seu contingut, amb l'enllaç, apareix al registre del servidor.

### Producció

```bash
npm run build
```

```bash
PUBLIC_URL=https://arxiu.exemple.cat npm start
```

O amb Docker:

```bash
docker build -t arxiu .
```

```bash
docker run -d -p 3000:3000 -v arxiu-data:/data -e PUBLIC_URL=https://arxiu.exemple.cat arxiu
```

Posa-hi un proxy invers amb HTTPS (Caddy, nginx…) al davant: amb `PUBLIC_URL` en `https://` la galeta de sessió es marca com a `Secure`. Totes les opcions són a [`.env.example`](.env.example).

### Ordres útils al servidor

| Ordre | Per a què |
| --- | --- |
| `npm run user:create` | Crea el compte (si encara no n'hi ha) |
| `npm run user:password` | Canvia la contrasenya i tanca totes les sessions |
| `npm run user:disable-2fa` | Desactiva la verificació en dos passos (si has perdut el mòbil) |
| `npm test` | Proves de l'API |
| `npm run typecheck` | Comprovació de tipus |

## Seguretat

- Contrasenyes amb `scrypt`; tokens de sessió i d'enllaços desats només com a hash.
- Galeta `HttpOnly`, `SameSite=Strict`; les peticions que modifiquen dades necessiten una capçalera pròpia (protecció CSRF).
- Límit d'intents a l'inici de sessió i a la recuperació.
- El tipus de cada arxiu es comprova pels primers bytes: només s'accepten PDF i imatges.
- Capçaleres `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy: no-referrer` i `nosniff`.

## Pendent

- Desbloqueig amb biometria al mòbil (WebAuthn / claus d'accés), que surt al prototip.
- Codis de recuperació per a la verificació en dos passos.
- Cerca dins del text dels documents (OCR).
