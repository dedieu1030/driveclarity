/**
 * Subscription.gs — Stripe subscription state for Access Audit & Revoke for Drive.
 *
 * All network calls hit Stripe API directly. No external backend required.
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

  function userEmail() {
    return Session.getActiveUser().getEmail();
  }

  /**
   * Helper to call Stripe API directly.
   */
  function callStripe(method, path, payloadString) {
    const key = Config.STRIPE_SECRET_KEY();
    if (!key) return null;
    
    const options = {
      method: method,
      headers: {
        "Authorization": "Bearer " + key,
      },
      muteHttpExceptions: true
    };
    
    if (payloadString && method === 'post') {
      options.payload = payloadString;
    }
    
    const url = "https://api.stripe.com/v1/" + path;
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() >= 400) {
       console.error("Stripe API error (" + path + "):", response.getContentText());
       return null;
    }
    return JSON.parse(response.getContentText());
  }

  /**
   * Find customer by email exactly. Returns customer ID or null.
   */
  function getCustomerId() {
    const email = userEmail();
    // Stripe supports exact email match without full search indexing delays
    const res = callStripe('get', "customers?email=" + encodeURIComponent(email));
    if (res && res.data && res.data.length > 0) {
      return res.data[0].id; // Returns first matching customer
    }
    return null;
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

    let subscribed = false;
    const email = userEmail();
    
    // BACKDOOR POUR LE REVISEUR GOOGLE (Reviewer Whitelist)
    if (email === 'gsmtestuser@marketplacetest.net') {
      return true;
    }

    const customerId = getCustomerId();
    
    if (customerId) {
      // Check for active or trialing subscriptions for this customer
      const res = callStripe('get', "subscriptions?customer=" + customerId + "&status=all");
      if (res && res.data) {
        for (let i = 0; i < res.data.length; i++) {
          const status = res.data[i].status;
          if (status === 'active' || status === 'trialing') {
            subscribed = true;
            break;
          }
        }
      }
    }

    cache.put(CACHE_KEY, String(subscribed), CACHE_TTL_S);
    return subscribed;
  }

  /**
   * Returns the Stripe Checkout Session URL for this user.
   * allow_promotion_codes is enabled.
   */
  function getCheckoutUrl() {
    const email = userEmail();
    const priceId = Config.STRIPE_PRICE_ID();
    const appUrl = Config.APP_URL();
    
    if (!priceId) return null;

    const customerId = getCustomerId();
    
    // Build Stripe payload manually to avoid nested object encoding issues
    let payload = 'payment_method_types[0]=card' +
           '&line_items[0][price]=' + encodeURIComponent(priceId) +
           '&line_items[0][quantity]=1' +
           '&mode=subscription' +
           '&allow_promotion_codes=true' +
           '&client_reference_id=' + encodeURIComponent(email) +
           '&success_url=' + encodeURIComponent(appUrl) +
           '&cancel_url=' + encodeURIComponent(appUrl);
           
    if (customerId) {
      payload += '&customer=' + encodeURIComponent(customerId);
    } else {
      payload += '&customer_email=' + encodeURIComponent(email);
    }

    const res = callStripe('post', "checkout/sessions", payload);
    return res ? res.url : null;
  }

  /**
   * Returns the Stripe Customer Portal URL so the user can manage /
   * cancel their subscription.
   */
  function getPortalUrl() {
    const customerId = getCustomerId();
    if (!customerId) return null;
    
    const appUrl = Config.APP_URL();
    const payload = 'customer=' + encodeURIComponent(customerId) +
                    '&return_url=' + encodeURIComponent(appUrl);
                    
    const res = callStripe('post', "billing_portal/sessions", payload);
    return res ? res.url : null;
  }

  /** Force a fresh subscription check on the next isActive() call. */
  function invalidateCache() {
    CacheService.getUserCache().remove(CACHE_KEY);
  }

  return { isActive, getCheckoutUrl, getPortalUrl, invalidateCache };

})();
