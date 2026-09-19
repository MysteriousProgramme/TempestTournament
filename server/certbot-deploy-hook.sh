#!/bin/sh
# ============================================================
# Tempest — certbot deploy hook
# ============================================================
# Let's Encrypt stores the private key root-only (/etc/letsencrypt/archive is
# 0700), and Tempest deliberately does not run as root. So on every issue and
# every renewal, copy the pair somewhere the service user can read and restart
# it to pick them up.
#
# Install:
#   sudo install -m 755 server/certbot-deploy-hook.sh \
#        /etc/letsencrypt/renewal-hooks/deploy/tempest.sh
#
# Anything in renewal-hooks/deploy runs after a successful renewal, so this is
# what stops the certificate silently going stale in ninety days.
set -eu

DOMAIN=43-210-250-181.sslip.io
DEST=/opt/tempest/server/tls
OWNER=tempest

# RENEWED_LINEAGE is set by certbot; fall back for a manual run.
SRC=${RENEWED_LINEAGE:-/etc/letsencrypt/live/$DOMAIN}

# On renewal certbot may hand us a lineage that is not ours - leave it alone.
case "$SRC" in
  *"$DOMAIN") ;;
  *) exit 0 ;;
esac

mkdir -p "$DEST"
cp "$SRC/fullchain.pem" "$DEST/fullchain.pem"
cp "$SRC/privkey.pem"   "$DEST/privkey.pem"
chown "$OWNER:$OWNER" "$DEST/fullchain.pem" "$DEST/privkey.pem"
chmod 644 "$DEST/fullchain.pem"
chmod 600 "$DEST/privkey.pem"
chown "$OWNER:$OWNER" "$DEST"
chmod 750 "$DEST"

systemctl restart tempest
echo "tempest: installed $DOMAIN certificate and restarted"
