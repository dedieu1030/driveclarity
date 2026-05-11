#!/usr/bin/env bash
# Déploie les Cloud Functions Drive Access Viewer après avoir configuré les secrets Stripe.
#
# PRÉREQUIS :
#   - Firebase CLI : firebase login
#   - Projet Blaze : driveaccessviewer-dedieu
#   - Clés Stripe (mode test ou live) sous la main
#
# USAGE :
#   export STRIPE_SECRET_KEY='sk_live_...'    # ou sk_test_... depuis https://dashboard.stripe.com/apikeys
#   export STRIPE_WEBHOOK_SECRET='whsec_...' # depuis Developers → Webhooks → ton endpoint (après création)
#   ./scripts/firebase-stripe-secrets-and-deploy.sh
#
# Si tu n’as pas encore le webhook, crée d’abors l’endpoint dans Stripe pointant vers :
#   https://us-central1-driveaccessviewer-dedieu.cloudfunctions.net/stripeWebhook
# puis copie le "Signing secret".

set -euo pipefail

PROJECT_ID="driveaccessviewer-dedieu"
REGION_URL="https://us-central1-${PROJECT_ID}.cloudfunctions.net/stripeWebhook"

# Prix Stripe (déjà utilisé côté projet — tu peux changer si besoin)
DEFAULT_PRICE_ID="price_1TVvsBKBtJH3vPx6PGJWG0x4"
DEFAULT_APP_URL="https://driveclarity.app"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
  echo "❌ Définis STRIPE_SECRET_KEY (clé secrète Stripe, commence par sk_live_ ou sk_test_)."
  echo "   Dashboard : https://dashboard.stripe.com/apikeys"
  exit 1
fi

if [[ -z "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
  echo "❌ Définis STRIPE_WEBHOOK_SECRET (whsec_... du webhook Stripe)."
  echo "   Crée d’abord le webhook vers : ${REGION_URL}"
  echo "   Puis Developers → Webhooks → [ton endpoint] → Signing secret"
  exit 1
fi

echo "→ Secrets Firebase (projet ${PROJECT_ID})…"

printf '%s' "$STRIPE_SECRET_KEY" | firebase functions:secrets:set STRIPE_SECRET_KEY --project "$PROJECT_ID" --data-file=-
printf '%s' "$STRIPE_WEBHOOK_SECRET" | firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project "$PROJECT_ID" --data-file=-

PRICE_ID="${STRIPE_PRICE_ID:-$DEFAULT_PRICE_ID}"
printf '%s' "$PRICE_ID" | firebase functions:secrets:set STRIPE_PRICE_ID --project "$PROJECT_ID" --data-file=-

APP_URL="${APP_URL:-$DEFAULT_APP_URL}"
printf '%s' "$APP_URL" | firebase functions:secrets:set APP_URL --project "$PROJECT_ID" --data-file=-

echo "→ Déploiement des fonctions…"
firebase deploy --only functions --project "$PROJECT_ID"

echo ""
echo "✅ Terminé."
echo "   Webhook Stripe URL : ${REGION_URL}"
echo "   Apps Script → Script property : FIREBASE_FUNCTIONS_BASE_URL = https://us-central1-${PROJECT_ID}.cloudfunctions.net"
