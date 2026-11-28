# Arxiu

Arxiu personal i privat per guardar, ordenar i compartir documents: cartes, nòmines, factures, contractes… És una aplicació web d'un sol usuari que pots allotjar tu mateix.

Implementa el disseny «Arxiu — prototip» (escriptori i mòbil) amb el sistema de disseny *Arxiu* (tons cafè i caramel, tipografia Poppins, mode clar i fosc).

## Què fa

- **Accés segur**: correu + contrasenya (mín. 12 caràcters, majúscules/minúscules i número o símbol), sense comptes de tercers.
- **Verificació en dos passos** opcional amb qualsevol app TOTP (codi QR als ajustos).
- **Recuperació de contrasenya per correu** amb enllaç d'un sol ús que caduca en 30 minuts; en restablir-la es tanquen totes les sessions.
- **Tancament automàtic** de la sessió per inactivitat (5, 15, 30 o 60 minuts) i llista de **sessions obertes** per tancar-les a distància.
- **Pujada d'arxius** (PDF, JPG, PNG, HEIC, WEBP; fins a 50 MB): arrossegar i deixar anar a l'ordinador; càmera, galeria o arxius al mòbil. La categoria s'endevina pel nom i es pot canviar abans de pujar.
- **Etiquetes i persones**: cada document pot tenir, a més de la categoria, etiquetes lliures (#urgent, #hisenda…) i persones relacionades. Es creen al moment en pujar i es poden filtrar des del menú, la cerca o la URL.
- **Pujada guiada**: per a cada arxiu has de decidir el **nom**, la **categoria** (o crear-ne una de nova allà mateix), les etiquetes i les persones. Es pot aplicar la mateixa tria a tots els arxius d'una tanda.
- **Configuració extensa**: categories (nom, color, ordre), etiquetes i persones (nom, color, notes, fusionar, eliminar), tema clar/fosc, vista, ordre i agrupació per defecte, opcions de pujada, durada dels enllaços i seguretat.
- **Aplicació instal·lable (PWA)** per al mòbil: icona pròpia, pantalla completa i drecera «Puja un document». Cal servir-la amb https o des de localhost.
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

### En local (Windows), mentre no hi ha servidor

Fes doble clic a `local/arxiu-local.bat`: instal·la les dependències, compila la web, arrenca l'Arxiu a `http://localhost:3000` (només accessible des del teu ordinador) i obre el navegador. Les dades queden a la carpeta `data/`. El límit per arxiu en local és de 500 MB (variable `MAX_UPLOAD_MB` a l'`.bat`); si el canvies, executa `reconstruir`. Després d'actualitzar el codi, executa `local\arxiu-local.bat reconstruir`.

**Quan tinguis el servidor**: tanca l'Arxiu local, fes una còpia (`npm run backup` o l'exportació `.zip` als ajustos) i restaura-la al VPS seguint [deploy/README.md](deploy/README.md) (secció de còpies). També pots copiar la carpeta `data/` sencera al volum del servidor.

### Producció

```bash
npm run build
```

```bash
PUBLIC_URL=https://arxiu.exemple.cat npm start
```

Per publicar-lo a internet en un VPS (Hostinger, OVHcloud, Hetzner…) amb HTTPS, còpies de seguretat diàries i espai per a més webs, segueix la guia [**deploy/README.md**](deploy/README.md).

### Ordres útils al servidor

| Ordre | Per a què |
| --- | --- |
| `npm run user:create` | Crea el compte (si encara no n'hi ha) |
| `npm run user:password` | Canvia la contrasenya i tanca totes les sessions |
| `npm run user:disable-2fa` | Desactiva la verificació en dos passos (si has perdut el mòbil) |
| `npm run backup` | Còpia de la base de dades i els documents a `backups/` |
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
- Rebre fitxers des de «Comparteix» del mòbil (Web Share Target).
