/**
 * Config.gs — Centralized configuration for Stripe integration.
 *
 * Script properties required:
 *   STRIPE_SECRET_KEY — Your Stripe secret key (sk_live_...)
 *   STRIPE_PRICE_ID   — The price ID for the subscription (price_...)
 *   APP_URL           — (Optional) Where to redirect after checkout.
 */

const Config = (function () {

  function get(key) {
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  }

  return {
    STRIPE_SECRET_KEY: function () {
      return get('STRIPE_SECRET_KEY');
    },
    STRIPE_PRICE_ID: function () {
      return get('STRIPE_PRICE_ID');
    },
    APP_URL: function () {
      return get('APP_URL') || 'https://drive.google.com';
    },
  };

})();
