/**
 * Config.gs — Centralized configuration for Firebase + Stripe integration.
 *
 * ─── How to configure ────────────────────────────────────────────────────────
 * Set each value as a Script Property in Apps Script:
 *   Extensions → Apps Script → Project Settings → Script Properties
 *
 *   FIREBASE_FUNCTIONS_BASE_URL   https://us-central1-YOUR_PROJECT.cloudfunctions.net
 *   STRIPE_PRICE_ID               price_xxxxxxxxxxxxxxxxxxxx
 *   APP_URL                       https://driveclarity.app
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Config = (function () {

  function get(key) {
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  }

  return {
    FIREBASE_FUNCTIONS_BASE_URL: function () {
      return get('FIREBASE_FUNCTIONS_BASE_URL');
    },
    APP_URL: function () {
      return get('APP_URL') || 'https://driveclarity.app';
    },
  };

})();
