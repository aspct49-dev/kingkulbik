# Hosting King Kulbik on a VPS

The whole site runs as one Node process (`server/standalone.ts`): the pages, every `/api` route and
uploaded images. nginx sits in front for HTTPS. The database stays on Neon, so nothing has to be
copied over: the VPS reads the same data the Vercel site does.

Tested target: **Hostinger KVM 2, Ubuntu 24.04 LTS**.

```
browser ──HTTPS──> nginx (:443) ──> Node server (127.0.0.1:3000) ──> Neon, Stake, BotRix, Kick
```

## 1. Before you start

- A domain (e.g. `kingkulbik.com`). In its DNS, add **A records** for `@` and `www` pointing at the
  VPS's IP address (shown in the Hostinger panel).
- From Vercel (Project → Settings → Environment Variables), copy the values of every variable,
  including **`DATABASE_URL`** and **`BLOB_READ_WRITE_TOKEN`**.
- On the **Discord** app (discord.com/developers) and the **Kick** app, add these redirect URLs:
  - `https://yourdomain.com/api/auth/discord/callback`
  - `https://yourdomain.com/api/auth/kick/callback`

## 2. Set up the server (once)

SSH in as root (`ssh root@<vps-ip>`), then:

```bash
apt-get update && apt-get -y install git
git clone https://github.com/aspct49-dev/kingkulbik.git /tmp/kk-setup 2>/dev/null \
  || echo "Private repo: copy deploy/setup.sh over with scp instead"
bash /tmp/kk-setup/deploy/setup.sh yourdomain.com you@email.com
```

If the repo is private, copy the script from your PC instead:
`scp deploy/setup.sh root@<vps-ip>:/root/` then `bash /root/setup.sh yourdomain.com you@email.com`.

The script installs Node 24, nginx and certbot, turns on the firewall (SSH, HTTP and HTTPS only),
creates a `kingkulbik` user and sets up the service. Partway through it prints a **deploy key**: add it
on GitHub under the repo → **Settings → Deploy keys** (read-only), then press Enter so it can clone.

## 3. Fill in the secrets

```bash
sudo -u kingkulbik nano /opt/kingkulbik/.env
```

Paste the values from Vercel / `.env.local`. On the VPS also set:

```
AUTH_URL=https://yourdomain.com
SITE_URL=https://yourdomain.com
DATA_DIR=/var/lib/kingkulbik
PORT=3000
```

## 4. Build and start

```bash
sudo bash /opt/kingkulbik/deploy/update.sh
```

It pulls `main`, installs, builds and restarts, then checks the site answers. Open
`https://yourdomain.com`.

`SITE_URL` puts your domain in the search and share tags (sitemap, link previews). Once the site
is live, submit `https://yourdomain.com/sitemap.xml` in Google Search Console.

## Updating later

After pushing to GitHub: `sudo bash /opt/kingkulbik/deploy/update.sh`. If a build fails, the restart
is skipped and the previous version keeps running.

## Useful commands

| | |
|---|---|
| Live logs | `sudo journalctl -u kingkulbik -f` |
| Status | `sudo systemctl status kingkulbik` |
| Restart | `sudo systemctl restart kingkulbik` |
| Renew HTTPS (automatic, to test) | `sudo certbot renew --dry-run` |

## Files

- `server/standalone.ts`: the production server, built to `dist-server/server.mjs` by `npm run build:server`
- `deploy/setup.sh`: one-time server setup
- `deploy/update.sh`: deploy the latest `main`
- `deploy/nginx.conf`: the nginx site (HTTPS added by certbot)
- `deploy/kingkulbik.service`: the systemd service

## Notes

- **Vercel keeps working** alongside the VPS (same code, same database). Once the domain points at the
  VPS and sign-in works there, the Vercel project can be paused.
- **Kick data** (socials page follower count and past streams) comes from Kick's public API, which
  sometimes blocks server IPs. If it does, the page still shows the live player and links to Kick.
- To try the production build on your PC: `npm run build:vps`, then
  `node --env-file=.env.local dist-server/server.mjs` and open http://localhost:3000.
