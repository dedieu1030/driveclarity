/**
 * Config.gs — Centralized configuration for Firebase + Stripe integration.
 *
 * Script property (optional override):
 *   FIREBASE_FUNCTIONS_BASE_URL — if empty, uses DEFAULT_FIREBASE_FUNCTIONS_URL below.
 */

const Config = (function () {

  /** Production Firebase project (must match Cloud Functions deployment). */
  var DEFAULT_FIREBASE_FUNCTIONS_URL =
    'https://us-central1-driveaccessviewer-dedieu.cloudfunctions.net';

  function get(key) {
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  }

  return {
    FIREBASE_FUNCTIONS_BASE_URL: function () {
      return get('FIREBASE_FUNCTIONS_BASE_URL') || DEFAULT_FIREBASE_FUNCTIONS_URL;
    },
    APP_URL: function () {
      return get('APP_URL') || 'https://driveclarity.app';
    },
  };

})();
