# Publicar l'Arxiu en un VPS

Aquesta guia serveix per a qualsevol VPS amb Ubuntu: Hostinger, OVHcloud, Hetzner, DigitalOcean… El servidor queda preparat per allotjar **més webs** en el futur: **Caddy** rep tot el trànsit, posa HTTPS automàticament i el reparteix a cada web, i cada aplicació viu en el seu propi contenidor Docker.

```
Internet ──443──▶ Caddy ──▶ arxiu (Node.js)          dades: volum «arxiu-data»
                        ├─▶ www  (web estàtica)       còpies: deploy/backups
                        └─▶ blog (una altra app)
```

Temps aproximat: 30 minuts. Les ordres marcades «al teu PC» s'escriuen al PowerShell de Windows. Totes les altres, al servidor.

## 1. Contracta el VPS

- **Hostinger**: VPS → *KVM 1* (n'hi ha prou). Sistema operatiu: **Ubuntu 24.04** (o la plantilla «Ubuntu 24.04 with Docker»). Ubicació: Europa.
- Apunta't la **IP pública** (p. ex. `1.2.3.4`) i la contrasenya de `root` que t'hagin donat.
- Si el proveïdor ofereix còpies de seguretat automàtiques del servidor, activa-les.

## 2. Crea una clau SSH (al teu PC)

```bash
ssh-keygen -t ed25519
```

Prem Enter a totes les preguntes (o posa-hi una contrasenya). Mostra la clau pública:

```bash
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

Copia-la. A Hostinger es pot enganxar a *VPS → Configuració → Claus SSH*. Si no, la posarem al pas 3.

## 3. Primera connexió i seguretat bàsica

Al teu PC:

```bash
ssh root@1.2.3.4
```

Ja al servidor, crea el teu usuari (substitueix `deulo` si vols un altre nom):

```bash
adduser deulo
```

```bash
usermod -aG sudo deulo
```

Copia-li la clau SSH. Si no la vas posar al panell, primer enganxa-la a `/root/.ssh/authorized_keys` amb `nano`.

```bash
rsync --archive --chown=deulo:deulo /root/.ssh /home/deulo
```

Actualitza el sistema i instal·la el tallafoc i la protecció contra intents d'entrada:

```bash
apt update && apt -y upgrade && apt -y install ufw fail2ban unattended-upgrades
```

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

```bash
dpkg-reconfigure -plow unattended-upgrades
```

Desactiva l'entrada amb contrasenya i com a `root` (només amb la teva clau). **Abans**, obre una altra finestra i comprova que `ssh deulo@1.2.3.4` funciona.

```bash
printf 'PasswordAuthentication no\nPermitRootLogin no\n' > /etc/ssh/sshd_config.d/99-arxiu.conf && systemctl restart ssh
```

A partir d'ara, entra sempre amb:

```bash
ssh deulo@1.2.3.4
```

## 4. Instal·la Docker

Si has triat la plantilla amb Docker, salta aquest pas.

```bash
curl -fsSL https://get.docker.com | sudo sh
```

```bash
sudo usermod -aG docker $USER
```

Surt (`exit`) i torna a entrar perquè el canvi faci efecte.

## 5. Descarrega l'Arxiu i configura'l

El repositori és privat. Crea un *token* de només lectura a GitHub: *Settings → Developer settings → Fine-grained tokens*, amb accés només a `Arxiu` i permís *Contents: Read*. Fes-lo servir com a contrasenya quan `git clone` la demani.

```bash
git clone https://github.com/deulo-git/Arxiu.git && cd Arxiu/deploy
```

```bash
cp .env.example .env && nano .env
```

Omple:
- `ARXIU_DOMAIN` i `PUBLIC_URL`. Sense domini, fes servir la IP amb guions i `sslip.io`: si la IP és `1.2.3.4`, posa `arxiu.1-2-3-4.sslip.io` i `https://arxiu.1-2-3-4.sslip.io`.
- `ACME_EMAIL`: el teu correu.
- `SMTP_URL` i `MAIL_FROM`: el correu de recuperació (vegeu l'apartat 8). Ho pots fer més tard.

Guarda amb `Ctrl+O`, Enter, `Ctrl+X`.

## 6. Arrenca

```bash
mkdir -p backups && sudo chown 1000:1000 backups
```

```bash
docker compose up -d --build
```

La primera vegada triga uns minuts. Comprova que tot funciona (`arxiu` ha de sortir com a *healthy*):

```bash
docker compose ps
```

Obté l'enllaç per crear el compte i **obre'l de seguida**: qui el tingui pot crear el compte.

```bash
docker compose logs arxiu | grep configura
```

Crea el compte i, a *Seguretat i compte*, **activa la verificació en dos passos**.

## 7. Còpies de seguretat

Fes-ne una ara per provar-ho:

```bash
./backup.sh
```

Programa-la cada nit a les 3:30:

```bash
crontab -e
```

Afegeix aquesta línia (canvia `deulo` pel teu usuari):

```
30 3 * * * /home/deulo/Arxiu/deploy/backup.sh >> /home/deulo/Arxiu/deploy/backups/backup.log 2>&1
```

Les còpies es guarden a `deploy/backups`, una per dia, durant 14 dies. Són al mateix servidor: per tenir-ne també fora, descarrega'n una de tant en tant al teu PC:

```bash
scp deulo@1.2.3.4:Arxiu/deploy/backups/arxiu-*.tar.gz .
```

També pots fer servir el botó *Exporta-ho tot* de l'aplicació.

**Restaurar una còpia:**

```bash
docker compose stop arxiu
```

```bash
docker run --rm -v deploy_arxiu-data:/data -v "$PWD/backups:/b" alpine sh -c "rm -rf /data/files /data/thumbs /data/arxiu.db* && tar -xzf /b/NOM-DE-LA-COPIA.tar.gz -C /data && chown -R 1000:1000 /data"
```

```bash
docker compose start arxiu
```

## 8. Correu de recuperació (Gmail)

1. Al teu compte de Google, activa la *Verificació en dos passos*.
2. Ves a *Compte de Google → Seguretat → Contrasenyes d'aplicació* i crea'n una amb el nom «Arxiu». Et donarà 16 lletres.
3. A `deploy/.env` (l'`@` s'escriu `%40` i les 16 lletres van sense espais):
   ```
   SMTP_URL=smtps://tu%40gmail.com:abcdabcdabcdabcd@smtp.gmail.com:465
   MAIL_FROM=Arxiu <tu@gmail.com>
   ```
4. Aplica el canvi:
   ```bash
   docker compose up -d
   ```
5. Prova «He oblidat la contrasenya» a la pantalla d'entrada.

## 9. Actualitzar l'Arxiu

```bash
cd ~/Arxiu && git pull && cd deploy && docker compose up -d --build
```

## 10. Afegir una altra web

- **Web estàtica (HTML)**: copia-la a `deploy/sites/web` i afegeix al `Caddyfile`:
  ```
  www.elteudomini.cat {
  	root * /srv/web
  	file_server
  }
  ```
- **Una altra aplicació en Docker**: afegeix-la com a servei a `compose.yaml` (hi ha un exemple comentat) i al `Caddyfile`:
  ```
  blog.elteudomini.cat {
  	reverse_proxy blog:2368
  }
  ```

Després, recarrega-ho:

```bash
docker compose up -d && docker compose restart caddy
```

Sense domini, cada web pot tenir el seu nom amb sslip.io (`blog.1-2-3-4.sslip.io`). Amb un domini propi (~10 €/any), crea registres DNS de tipus **A** que apuntin a la IP del servidor (`arxiu`, `www`, `blog`…) i canvia els noms al `Caddyfile` i al `.env`.

## Si alguna cosa falla

```bash
docker compose ps
```

```bash
docker compose logs --tail=100 caddy arxiu
```

- **Caddy no aconsegueix el certificat**: comprova que els ports 80 i 443 són oberts (`sudo ufw status`, i el tallafoc del panell del proveïdor) i que el domini apunta a la IP.
- **Has perdut el mòbil de la verificació en dos passos**:
  ```bash
  docker compose exec arxiu npm run user:disable-2fa
  ```
- **Has oblidat la contrasenya i el correu no funciona**:
  ```bash
  docker compose exec -it arxiu npm run user:password
  ```
