/**
 * Firebase Cloud Functions — Drive Access Viewer
 *
 * Endpoints:
 *   POST /checkSubscription      – is the current user subscribed?
 *   POST /createCheckoutSession  – create Stripe Checkout (promo codes ON)
 *   POST /createPortalSession    – open Stripe Billing Portal
 *   POST /stripeWebhook          – receive Stripe events, write Firestore
 *
 * Environment variables (set with `firebase functions:secrets:set` or .env):
 *   STRIPE_SECRET_KEY          sk_live_...
 *   STRIPE_WEBHOOK_SECRET      whsec_...
 *   STRIPE_PRICE_ID            price_...    (your subscription price)
 *   APP_URL                    https://driveclarity.app
 */

'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin  = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// ── Secrets ─────────────────────────────────────────────────────────────────
const STRIPE_SECRET_KEY     = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const STRIPE_PRICE_ID       = defineSecret('STRIPE_PRICE_ID');
const APP_URL               = defineSecret('APP_URL');

// ── CORS helper ──────────────────────────────────────────────────────────────
function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Google OIDC token verification ──────────────────────────────────────────
// We call Google's tokeninfo endpoint — no external library needed.
// Works with ScriptApp.getIdentityToken() and standard Google ID tokens.
async function verifyGoogleToken(idToken) {
  const { default: fetch } = await import('node-fetch');
  const resp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  const payload = await resp.json();
  if (payload.error || !payload.email_verified) {
    throw new Error('Invalid or unverified Google token');
  }
  return payload; // { email, sub, email_verified, ... }
}

// ── Stripe customer helpers ──────────────────────────────────────────────────
async function getOrCreateCustomer(stripe, email) {
  const ref  = db.collection('subscriptions').doc(email);
  const snap = await ref.get();

  if (snap.exists && snap.data().stripeCustomerId) {
    return snap.data().stripeCustomerId;
  }

  const customer = await stripe.customers.create({ email });
  await ref.set({ email, stripeCustomerId: customer.id }, { merge: true });
  return customer.id;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. checkSubscription
// ═══════════════════════════════════════════════════════════════════════════
exports.checkSubscription = onRequest(
  { secrets: [STRIPE_SECRET_KEY] },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST')    return res.status(405).send('Method not allowed');

    try {
      const { idToken } = req.body;
      if (!idToken) return res.status(400).json({ error: 'idToken required' });

      const { email } = await verifyGoogleToken(idToken);
      const snap = await db.collection('subscriptions').doc(email).get();

      if (!snap.exists) return res.json({ subscribed: false });

      const data       = snap.data();
      const subscribed = data.status === 'active' || data.status === 'trialing';
      return res.json({
        subscribed,
        status : data.status  || null,
        plan   : data.plan    || null,
        endsAt : data.currentPeriodEnd ? data.currentPeriodEnd.toDate().toISOString() : null,
      });
    } catch (e) {
      console.error('checkSubscription:', e.message);
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 2. createCheckoutSession   (allow_promotion_codes: true)
// ═══════════════════════════════════════════════════════════════════════════
exports.createCheckoutSession = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_PRICE_ID, APP_URL] },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST')    return res.status(405).send('Method not allowed');

    try {
      const { idToken } = req.body;
      if (!idToken) return res.status(400).json({ error: 'idToken required' });

      const { email } = await verifyGoogleToken(idToken);
      const stripe     = require('stripe')(STRIPE_SECRET_KEY.value());
      const customerId = await getOrCreateCustomer(stripe, email);
      const appUrl     = APP_URL.value() || 'https://driveclarity.app';

      const session = await stripe.checkout.sessions.create({
        customer                : customerId,
        payment_method_types    : ['card'],
        line_items              : [{ price: STRIPE_PRICE_ID.value(), quantity: 1 }],
        mode                    : 'subscription',
        allow_promotion_codes   : true,   // ← promo / discount codes enabled
        client_reference_id     : email,
        success_url             : `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url              : `${appUrl}/cancel`,
        subscription_data       : {
          metadata: { email },
        },
      });

      return res.json({ url: session.url });
    } catch (e) {
      console.error('createCheckoutSession:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 3. createPortalSession  (manage / cancel subscription)
// ═══════════════════════════════════════════════════════════════════════════
exports.createPortalSession = onRequest(
  { secrets: [STRIPE_SECRET_KEY, APP_URL] },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST')    return res.status(405).send('Method not allowed');

    try {
      const { idToken } = req.body;
      if (!idToken) return res.status(400).json({ error: 'idToken required' });

      const { email } = await verifyGoogleToken(idToken);
      const snap       = await db.collection('subscriptions').doc(email).get();

      if (!snap.exists || !snap.data().stripeCustomerId) {
        return res.status(404).json({ error: 'No subscription found for this account' });
      }

      const stripe  = require('stripe')(STRIPE_SECRET_KEY.value());
      const appUrl  = APP_URL.value() || 'https://driveclarity.app';

      const portal = await stripe.billingPortal.sessions.create({
        customer   : snap.data().stripeCustomerId,
        return_url : appUrl,
      });

      return res.json({ url: portal.url });
    } catch (e) {
      console.error('createPortalSession:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 4. stripeWebhook  (receive events from Stripe → update Firestore)
// ═══════════════════════════════════════════════════════════════════════════
exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');

    const stripe    = require('stripe')(STRIPE_SECRET_KEY.value());
    const sig       = req.headers['stripe-signature'];
    let   event;

    try {
      // req.rawBody is provided by Firebase Functions automatically.
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (e) {
      console.error('Webhook signature error:', e.message);
      return res.status(400).send(`Webhook Error: ${e.message}`);
    }

    try {
      switch (event.type) {

        // ── Checkout completed → subscription created ─────────────────────
        case 'checkout.session.completed': {
          const session        = event.data.object;
          const email          = session.client_reference_id;
          const subscriptionId = session.subscription;
          if (!email || !subscriptionId) break;

          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await db.collection('subscriptions').doc(email).set({
            email,
            status              : sub.status,
            plan                : sub.items.data[0].price.id,
            stripeCustomerId    : session.customer,
            stripeSubscriptionId: subscriptionId,
            currentPeriodEnd    : admin.firestore.Timestamp.fromMillis(sub.current_period_end * 1000),
          }, { merge: true });
          console.log(`Subscription activated for ${email}`);
          break;
        }

        // ── Subscription updated (renewal, plan change, etc.) ─────────────
        case 'customer.subscription.updated': {
          const sub      = event.data.object;
          const customer = await stripe.customers.retrieve(sub.customer);
          const email    = customer.email;
          if (!email) break;

          await db.collection('subscriptions').doc(email).set({
            status          : sub.status,
            plan            : sub.items.data[0].price.id,
            currentPeriodEnd: admin.firestore.Timestamp.fromMillis(sub.current_period_end * 1000),
          }, { merge: true });
          console.log(`Subscription updated for ${email}: ${sub.status}`);
          break;
        }

        // ── Subscription cancelled / expired ──────────────────────────────
        case 'customer.subscription.deleted': {
          const sub      = event.data.object;
          const customer = await stripe.customers.retrieve(sub.customer);
          const email    = customer.email;
          if (!email) break;

          await db.collection('subscriptions').doc(email).set({
            status          : 'canceled',
            currentPeriodEnd: admin.firestore.Timestamp.fromMillis(sub.current_period_end * 1000),
          }, { merge: true });
          console.log(`Subscription canceled for ${email}`);
          break;
        }

        // ── Invoice payment failed ─────────────────────────────────────────
        case 'invoice.payment_failed': {
          const invoice  = event.data.object;
          const customer = await stripe.customers.retrieve(invoice.customer);
          const email    = customer.email;
          if (!email) break;

          await db.collection('subscriptions').doc(email).set({
            status: 'past_due',
          }, { merge: true });
          console.warn(`Payment failed for ${email}`);
          break;
        }

        default:
          console.log(`Unhandled event: ${event.type}`);
      }
    } catch (e) {
      console.error('Webhook handler error:', e.message);
      return res.status(500).send('Internal error');
    }

    return res.json({ received: true });
  }
);
