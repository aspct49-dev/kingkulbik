#!/usr/bin/env bash
# Put the site's database on the VPS itself. Run as root, once:
#
#   sudo bash /opt/kingkulbik/deploy/postgres.sh
#
# Installs PostgreSQL (only reachable from this server), creates the
# kingkulbik database and user with a random password, points DATABASE_URL in
# /opt/kingkulbik/.env at it, and sets up a daily backup (14 days kept in
# /var/lib/kingkulbik/backups). Safe to run again: it keeps the existing
# database and password.
#
# To bring your existing data over afterwards: deploy/copy-data.mjs (see deploy/README.md).
set -euo pipefail

APP=/opt/kingkulbik
DATA=/var/lib/kingkulbik
ENV_FILE="$APP/.env"
DB=kingkulbik
DB_USER=kingkulbik

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)."; exit 1; }
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE is missing: run deploy/setup.sh first."; exit 1; }

echo "==> PostgreSQL"
DEBIAN_FRONTEND=noninteractive apt-get -y install postgresql postgresql-contrib
systemctl enable --now postgresql

echo "==> Database and user"
CURRENT_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- || true)"
if [[ "$CURRENT_URL" == postgresql://$DB_USER:*@127.0.0.1:5432/$DB ]]; then
  echo "DATABASE_URL already points at this server's database; keeping it."
  PASSWORD=""
else
  PASSWORD="$(openssl rand -hex 24)"
fi

if [ -n "$PASSWORD" ]; then
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    sudo -u postgres psql -qc "ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$PASSWORD'"
  else
    sudo -u postgres psql -qc "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$PASSWORD'"
  fi
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
  sudo -u postgres createdb -O "$DB_USER" "$DB"
fi

if [ -n "$PASSWORD" ]; then
  echo "==> Pointing the site at it"
  NEW_URL="postgresql://$DB_USER:$PASSWORD@127.0.0.1:5432/$DB"
  if grep -qE '^#? ?DATABASE_URL=' "$ENV_FILE"; then
    sed -i -E "s|^#? ?DATABASE_URL=.*|DATABASE_URL=$NEW_URL|" "$ENV_FILE"
  else
    echo "DATABASE_URL=$NEW_URL" >> "$ENV_FILE"
  fi
  # A previous Neon address stays in the file, commented out, for the one-off copy
  if [ -n "$CURRENT_URL" ] && [[ "$CURRENT_URL" != postgresql://$DB_USER:*@127.0.0.1* ]]; then
    echo "# OLD_DATABASE_URL=$CURRENT_URL" >> "$ENV_FILE"
  fi
  chown kingkulbik:kingkulbik "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

echo "==> Daily backup"
# Written by root (cron), readable by root only
mkdir -p "$DATA/backups"
chown root:root "$DATA/backups"
chmod 700 "$DATA/backups"
cat > /etc/cron.daily/kingkulbik-db-backup <<'CRON'
#!/bin/sh
# Daily dump of the King Kulbik database; 14 days kept
set -e
DIR=/var/lib/kingkulbik/backups
sudo -u postgres pg_dump -Fc kingkulbik > "$DIR/kingkulbik-$(date -u +%Y-%m-%d).dump"
find "$DIR" -name 'kingkulbik-*.dump' -mtime +14 -delete
CRON
chmod 755 /etc/cron.daily/kingkulbik-db-backup

echo
echo "Database ready. Restart the site to use it:  systemctl restart kingkulbik"
echo "Then check:  journalctl -u kingkulbik -n 5 --no-pager | grep store   (should say PostgreSQL)"
