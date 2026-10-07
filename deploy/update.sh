#!/usr/bin/env bash
# Deploy the latest main to the VPS: pull, install, build, restart. Run as root:
#
#   sudo bash /opt/kingkulbik/deploy/update.sh
#
# The old version keeps serving until the new build is ready; a failed build
# stops before the restart, so the site stays up on the previous version.
set -euo pipefail

APP=/opt/kingkulbik
USER_NAME=kingkulbik
as_app() { sudo -u "$USER_NAME" -H bash -c "cd $APP && $1"; }

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)."; exit 1; }
grep -q '^SESSION_SECRET=.\+' "$APP/.env" || { echo "Fill in $APP/.env first (SESSION_SECRET is empty)."; exit 1; }

echo "==> Pull"
as_app "git pull --ff-only"
echo "==> Install"
as_app "npm ci --no-audit --no-fund"
echo "==> Build"
as_app "npm run build:vps"

# The service file may have changed in the repo
cp "$APP/deploy/kingkulbik.service" /etc/systemd/system/kingkulbik.service
systemctl daemon-reload

echo "==> Restart"
systemctl restart kingkulbik
sleep 2
if systemctl is-active --quiet kingkulbik && curl -fsS -o /dev/null http://127.0.0.1:3000/api/originals/rules; then
  echo "Live: $(as_app 'git log -1 --format="%h %s"')"
else
  echo "The site did not come up. Logs:"
  journalctl -u kingkulbik -n 40 --no-pager
  exit 1
fi
