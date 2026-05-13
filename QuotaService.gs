/**
 * QuotaService.gs — Manages monthly free usage limits for non-pro users.
 * 
 * Uses PropertiesService.getUserProperties() to store:
 *   - QUOTA_MONTH: Format "YYYY-MM"
 *   - QUOTA_COUNT: Integer
 */

const QuotaService = (function () {
  const MONTHLY_LIMIT = 10;

  /**
   * Check if the user has a valid Pro subscription or remaining free quota.
   * @returns {boolean}
   */
  function canAccessFreeFeature() {
    if (Subscription.isActive()) return true;
    
    const props = PropertiesService.getUserProperties();
    const now = new Date();
    const currentMonth = now.getFullYear() + '-' + (now.getMonth() + 1);
    const lastMonth = props.getProperty('QUOTA_MONTH');

    if (lastMonth !== currentMonth) {
      // New month reset
      props.setProperty('QUOTA_MONTH', currentMonth);
      props.setProperty('QUOTA_COUNT', '0');
      return true;
    }

    const count = parseInt(props.getProperty('QUOTA_COUNT') || '0');
    return count < MONTHLY_LIMIT;
  }

  /**
   * Consume one quota credit. Call this ONLY after the feature is successfully rendered.
   */
  function consumeCredit() {
    if (Subscription.isActive()) return;

    const props = PropertiesService.getUserProperties();
    const count = parseInt(props.getProperty('QUOTA_COUNT') || '0');
    props.setProperty('QUOTA_COUNT', (count + 1).toString());
  }

  /**
   * Get formatted string of remaining usage.
   * @returns {string} e.g. "7/10 free audits remaining this month"
   */
  function getQuotaStatus() {
    if (Subscription.isActive()) return 'Unlimited Pro access';
    
    const props = PropertiesService.getUserProperties();
    const count = parseInt(props.getProperty('QUOTA_COUNT') || '0');
    const remaining = Math.max(0, MONTHLY_LIMIT - count);
    
    return '<b>' + remaining + '</b> / ' + MONTHLY_LIMIT + ' free audits remaining this month';
  }

  return {
    canAccessFreeFeature: canAccessFreeFeature,
    consumeCredit: consumeCredit,
    getQuotaStatus: getQuotaStatus,
    MONTHLY_LIMIT: MONTHLY_LIMIT
  };
})();
