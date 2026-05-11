/**
 * Subscription.gs — Firebase / Stripe subscription state for Drive Access Viewer.
 *
 * All network calls hit Firebase Cloud Functions (functions/index.js).
 * Results are cached in UserCache for 5 minutes to minimise latency.
 *
 * Public API:
 *   Subscription.isActive()        → boolean
 *   Subscription.getCheckoutUrl()  → string | null   (Stripe Checkout, promo codes ON)
 *   Subscription.getPortalUrl()    → string | null   (Stripe Billing Portal)
 *   Subscription.invalidateCache() → void
 */

const Subscription = (function () {

  const CACHE_KEY    = 'dav_sub_status';
  const CACHE_TTL_S  = 300; // 5 min

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function baseUrl() {
    return Config.FIREBASE_FUNCTIONS_BASE_URL();
  }

  /** Google OIDC token identifying the current Apps Script user. */
  function idToken() {
    return ScriptApp.getIdentityToken();
  }

  /**
   * POST to a Cloud Function and return the parsed JSON response.
   * Returns null on any network / auth error.
   */
  function callFunction(path, extra) {
    try {
      const body = Object.assign({ idToken: idToken() }, extra || {});
      const resp = UrlFetchApp.fetch(baseUrl() + path, {
        method            : 'post',
        contentType       : 'application/json',
        payload           : JSON.stringify(body),
        muteHttpExceptions: true,
      });
      if (resp.getResponseCode() !== 200) return null;
      return JSON.parse(resp.getContentText());
    } catch (e) {
      console.error('Subscription.callFunction error:', path, e.message);
      return null;
    }
  }

  // ─── Public ────────────────────────────────────────────────────────────────

  /**
   * Returns true when the current user has an active or trialling subscription.
   * Result is cached for CACHE_TTL_S seconds per user.
   */
  function isActive() {
    const cache  = CacheService.getUserCache();
    const cached = cache.get(CACHE_KEY);
    if (cached !== null) return cached === 'true';

    const data       = callFunction('/checkSubscription');
    const subscribed = !!(data && data.subscribed);
    cache.put(CACHE_KEY, String(subscribed), CACHE_TTL_S);
    return subscribed;
  }

  /**
   * Returns the Stripe Checkout Session URL for this user.
   * allow_promotion_codes is enabled server-side.
   */
  function getCheckoutUrl() {
    const data = callFunction('/createCheckoutSession');
    return (data && data.url) || null;
  }

  /**
   * Returns the Stripe Customer Portal URL so the user can manage /
   * cancel their subscription.
   */
  function getPortalUrl() {
    const data = callFunction('/createPortalSession');
    return (data && data.url) || null;
  }

  /** Force a fresh subscription check on the next isActive() call. */
  function invalidateCache() {
    CacheService.getUserCache().remove(CACHE_KEY);
  }

  return { isActive, getCheckoutUrl, getPortalUrl, invalidateCache };

})();
