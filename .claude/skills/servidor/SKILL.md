---
name: servidor
description: Gestionar el servidor de producció de l'Arxiu (VPS amb Docker Compose i Caddy) per SSH. Fes-la servir quan l'usuari demani actualitzar o desplegar l'Arxiu, mirar si funciona, veure registres, fer o restaurar còpies de seguretat, afegir una altra web o domini, configurar el correu, desbloquejar el compte, o qualsevol feina al «servidor», «VPS» o «Hostinger».
---

# Gestionar el servidor de l'Arxiu

El servidor és un VPS Ubuntu. L'Arxiu i Caddy funcionen amb Docker Compose a `~/Arxiu/deploy`. Caddy publica les webs amb HTTPS automàtic; l'Arxiu no té ports oberts a fora.

## Connexió

- Totes les ordres es fan amb `ssh arxiu "…"`. L'àlies `arxiu` és a `~/.ssh/config` de l'usuari, i la clau és a l'agent SSH de 1Password.
- Cada connexió pot demanar confirmació a 1Password: avisa l'usuari abans de connectar-te.
- Si `ssh arxiu` falla, no provis altres usuaris ni contrasenyes. Comprova l'àlies i que `ssh-add -l` mostri la clau, i explica què passa.
- Fes servir només ordres no interactives. Agrupa-les en una sola connexió quan puguis:
  ```
  ssh arxiu "cd ~/Arxiu/deploy && docker compose ps && curl -fsS -o /dev/null -w '%{http_code}' https://\$(grep ^ARXIU_DOMAIN .env | cut -d= -f2)/api/health"
  ```

## Accions sense confirmació (només llegeixen)

- Estat: `docker compose ps`, `docker compose logs --tail=100 arxiu caddy`, `df -h`, `free -h`, `uptime`.
- Còpies: `ls -lh ~/Arxiu/deploy/backups`, `tail ~/Arxiu/deploy/backups/backup.log`.
- Seguretat: `sudo ufw status`, `sudo fail2ban-client status sshd`.

## Accions que requereixen el sí explícit de l'usuari

Descriu primer què faràs i per què, i espera que l'usuari hi estigui d'acord:

- **Actualitzar l'Arxiu.** Primer fes una còpia, i després:
  ```
  cd ~/Arxiu/deploy && ./backup.sh && cd .. && git pull && cd deploy && docker compose up -d --build && docker compose ps
  ```
  Comprova `/api/health` al final.
- **Reiniciar serveis:** `docker compose restart arxiu` (o `caddy`).
- **Editar `Caddyfile`, `compose.yaml` o `.env`.** Mostra el canvi abans d'aplicar-lo. Després, `docker compose up -d` i `docker compose restart caddy`. Mai no mostris el contingut de `.env` al xat (té secrets): llegeix-ne o canvia-ne només la línia necessària.
- **Afegir una web.** Afegeix un bloc al `Caddyfile` i, si és una aplicació, un servei a `compose.yaml` (en tots dos fitxers hi ha exemples comentats). Sense domini, fes servir `nom.<ip-amb-guions>.sslip.io`.
- **Actualitzar el sistema:** `sudo apt update && sudo apt -y upgrade`. Si cal reiniciar (`/var/run/reboot-required`), demana-ho.
- **Desbloquejar el compte:**
  - `docker compose exec -T arxiu npm run -s user:disable-2fa`
  - Per canviar la contrasenya, l'usuari ha d'executar ell mateix `docker compose exec -it arxiu npm run user:password`, perquè és interactiu.

## No ho facis mai sense una ordre explícita i repetida

- `docker compose down -v`, `docker volume rm` o res que esborri el volum `deploy_arxiu-data` (hi ha tots els documents).
- Esborrar còpies a `deploy/backups`.
- Restaurar una còpia, que substitueix totes les dades actuals. El procediment és a `deploy/README.md`, secció 7. Fes abans una còpia de l'estat actual.
- Obrir ports al tallafoc, canviar la configuració d'SSH (`/etc/ssh`) o desactivar `ufw`/`fail2ban`.
- Copiar documents de l'usuari fora del servidor o mostrar-ne el contingut.

## Si alguna cosa falla

- L'Arxiu no surt com a *healthy*: `docker compose logs --tail=200 arxiu`.
- Error de certificat: `docker compose logs caddy | grep -i -E "error|acme"`. Revisa que els ports 80 i 443 siguin oberts i que el domini apunti a la IP.
- Disc ple (`df -h`): mira la mida de `deploy/backups` i proposa solucions. No esborris res sense permís.
