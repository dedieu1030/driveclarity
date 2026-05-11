/**
 * PaywallCard.gs — Upgrade prompt and subscription management card.
 *
 * Shown whenever a user without an active subscription tries to access
 * a premium feature. Also exposed as an "Upgrade / Manage" action from
 * the universal actions menu.
 */

const PaywallCard = (function () {

  const COLORS = {
    primary : '#1B4965',
    accent  : '#5FA8D3',
    muted   : '#6B7280',
  };

  // ─── Public ────────────────────────────────────────────────────────────────

  /**
   * Build the upgrade / subscription-management card.
   *
   * If the user is NOT subscribed  → show Subscribe CTA + feature list.
   * If the user IS subscribed      → show "Manage subscription" only
   *   (shouldn't normally be reached but acts as a safety net).
   */
  function build(subscribed) {
    const card = CardService.newCardBuilder().setName('DriveAccessViewer_Paywall');

    // Header
    const header = CardService.newCardHeader()
      .setTitle('Drive Access Viewer Pro')
      .setSubtitle(subscribed ? 'Your subscription is active' : 'Unlock full access control')
      .setImageUrl('https://raw.githubusercontent.com/dedieu1030/driveclarity/5a0b96f/addon-logo.png')
      .setImageStyle(CardService.ImageStyle.SQUARE);
    card.setHeader(header);

    if (!subscribed) {
      card.addSection(_buildUpgradeSection());
    }

    card.addSection(_buildManageSection(subscribed));
    return card.build();
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  function _buildUpgradeSection() {
    const section = CardService.newCardSection()
      .setHeader('What you unlock');

    const features = [
      { icon: CardService.Icon.PERSON,          text: 'Full per-file access viewer' },
      { icon: CardService.Icon.EMAIL,           text: 'External sharing audit' },
      { icon: CardService.Icon.MULTIPLE_PEOPLE, text: 'Bulk permission cleanup' },
      { icon: CardService.Icon.DESCRIPTION,     text: 'CSV export of audit results' },
    ];

    features.forEach(function (f) {
      section.addWidget(
        CardService.newDecoratedText()
          .setStartIcon(CardService.newIconImage().setIcon(f.icon))
          .setText(f.text)
      );
    });

    section.addWidget(CardService.newDivider());

    // Primary CTA — Stripe Checkout (promo codes enabled server-side)
    const checkoutUrl = Subscription.getCheckoutUrl();
    if (checkoutUrl) {
      section.addWidget(
        CardService.newTextButton()
          .setText('Subscribe — Get Pro Access')
          .setOpenLink(CardService.newOpenLink().setUrl(checkoutUrl))
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setBackgroundColor('#1B4965')
      );
      section.addWidget(
        CardService.newTextParagraph()
          .setText(
            '<font color="' + COLORS.muted + '">Have a promo code? ' +
            'You can apply it on the payment page.</font>'
          )
      );
    } else {
      section.addWidget(
        CardService.newTextParagraph()
          .setText(
            '<font color="' + COLORS.muted + '">Could not load checkout — ' +
            'make sure FIREBASE_FUNCTIONS_BASE_URL is set in Script Properties.</font>'
          )
      );
    }

    return section;
  }

  function _buildManageSection(subscribed) {
    const section = CardService.newCardSection()
      .setHeader(subscribed ? 'Subscription' : 'Already subscribed?');

    const portalUrl = Subscription.getPortalUrl();
    if (portalUrl) {
      section.addWidget(
        CardService.newTextButton()
          .setText('Manage / Cancel subscription')
          .setOpenLink(CardService.newOpenLink().setUrl(portalUrl))
      );
    }

    // Refresh subscription cache after returning from Stripe
    section.addWidget(
      CardService.newTextButton()
        .setText('Refresh subscription status')
        .setOnClickAction(
          CardService.newAction().setFunctionName('actionRefreshSubscription')
        )
    );

    return section;
  }

  return { build };

})();
