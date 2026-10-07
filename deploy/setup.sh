#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VPS for King Kulbik. Run as root:
#
#   curl -fsSL https://raw.githubusercontent.com/... (or copy this file over), then
#   sudo bash setup.sh yourdomain.com you@email.com
#
# Installs Node 24, nginx and certbot; creates the kingkulbik user, the app
# folder (/opt/kingkulbik) and data folder (/var/lib/kingkulbik); clones the
# repo with a read-only deploy key; sets up nginx, the firewall and the
# systemd service. Safe to run again: finished steps are skipped.
#
# Afterwards: fill in /opt/kingkulbik/.env, then run deploy/update.sh.
set -euo pipefail

DOMAIN="${1:?Usage: sudo bash setup.sh yourdomain.com [email-for-https-certificate]}"
EMAIL="${2:-}"
REPO="git@github.com:aspct49-dev/kingkulbik.git"
APP=/opt/kingkulbik
DATA=/var/lib/kingkulbik
USER_NAME=kingkulbik

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)."; exit 1; }

echo "==> Packages"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -y upgrade
DEBIAN_FRONTEND=noninteractive apt-get -y install curl git nginx ufw ca-certificates certbot python3-certbot-nginx

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  echo "==> Node 24"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  DEBIAN_FRONTEND=noninteractive apt-get -y install nodejs
fi
node -v

echo "==> User and folders"
id "$USER_NAME" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/home/$USER_NAME" --shell /bin/bash "$USER_NAME"
mkdir -p "$APP" "$DATA"
chown "$USER_NAME:$USER_NAME" "$APP" "$DATA"
chmod 750 "$DATA"

echo "==> GitHub deploy key"
KEY="/home/$USER_NAME/.ssh/id_ed25519"
if [ ! -f "$KEY" ]; then
  sudo -u "$USER_NAME" mkdir -p "/home/$USER_NAME/.ssh"
  sudo -u "$USER_NAME" ssh-keygen -t ed25519 -N "" -C "kingkulbik-vps" -f "$KEY" >/dev/null
fi
sudo -u "$USER_NAME" bash -c "ssh-keyscan -H github.com >> ~/.ssh/known_hosts 2>/dev/null; sort -u -o ~/.ssh/known_hosts ~/.ssh/known_hosts"

if [ ! -d "$APP/.git" ]; then
  echo
  echo "Add this key on GitHub: repo aspct49-dev/kingkulbik -> Settings -> Deploy keys -> Add deploy key"
  echo "(title: VPS, leave 'Allow write access' OFF):"
  echo
  cat "$KEY.pub"
  echo
  read -r -p "Press Enter once the key is added... "
  sudo -u "$USER_NAME" git clone "$REPO" "$APP"
fi

if [ ! -f "$APP/.env" ]; then
  sudo -u "$USER_NAME" cp "$APP/.env.example" "$APP/.env"
  chmod 600 "$APP/.env"
  NEW_ENV=1
fi

echo "==> nginx"
sed "s/DOMAIN/$DOMAIN/g" "$APP/deploy/nginx.conf" > /etc/nginx/sites-available/kingkulbik
ln -sf /etc/nginx/sites-available/kingkulbik /etc/nginx/sites-enabled/kingkulbik
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Firewall (SSH, HTTP, HTTPS only)"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> Service"
cp "$APP/deploy/kingkulbik.service" /etc/systemd/system/kingkulbik.service
systemctl daemon-reload
systemctl enable kingkulbik

echo "==> HTTPS certificate"
if [ -n "$EMAIL" ]; then
  if certbot --nginx -n --agree-tos -m "$EMAIL" --redirect -d "$DOMAIN" -d "www.$DOMAIN"; then
    echo "HTTPS is on."
  else
    echo "Certificate failed: point $DOMAIN and www.$DOMAIN at this server's IP, wait for DNS, then run:"
    echo "  sudo certbot --nginx --redirect -d $DOMAIN -d www.$DOMAIN"
  fi
else
  echo "No email given. Once DNS points here, run: sudo certbot --nginx --redirect -d $DOMAIN -d www.$DOMAIN"
fi

echo
echo "Setup done."
if [ "${NEW_ENV:-}" = 1 ]; then
  echo "Next: fill in the secrets in $APP/.env (sudo -u $USER_NAME nano $APP/.env),"
  echo "then build and start the site: sudo bash $APP/deploy/update.sh"
else
  echo "Next: sudo bash $APP/deploy/update.sh"
fi
