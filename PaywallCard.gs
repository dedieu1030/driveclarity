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

  function title(text) {
    return CardService.newTextParagraph()
      .setText('<b>' + Formatters.escapeHtml(text) + '</b>');
  }

  function appendSpacer(section) {
    section.addWidget(CardService.newTextParagraph().setText(' '));
  }

  // ─── Public ────────────────────────────────────────────────────────────────

  /**
   * Build the upgrade / subscription-management card.
   *
   * @param {boolean} subscribed    Current subscription status.
   * @param {string}  reason        Optional key: 'limit' | 'feature' | 'none'
   */
  function build(subscribed, reason) {
    const card = CardService.newCardBuilder().setName('DriveAccessViewer_Paywall');

    let subtitle = subscribed ? 'Your subscription is active' : 'Unlock full access control';
    if (reason === 'limit') {
      subtitle = 'Monthly limit reached (10/10)';
    } else if (reason === 'feature') {
      subtitle = 'Upgrade to unlock this feature';
    }

    // Header
    const header = CardService.newCardHeader()
      .setTitle('Access Manager & Bulk Revoke Pro')
      .setSubtitle(subtitle)
      .setImageUrl('https://raw.githubusercontent.com/dedieu1030/driveclarity/5a0b96f/addon-logo.png')
      .setImageStyle(CardService.ImageStyle.SQUARE);
    card.setHeader(header);

    // Single section to avoid forced dividers
    const mainSection = CardService.newCardSection();

    if (reason === 'limit') {
      mainSection.addWidget(CardService.newTextParagraph()
        .setText('You have used your 10 free monthly audits. Upgrade to Pro for unlimited usage and full cleanup tools.'));
      appendSpacer(mainSection);
    }

    if (!subscribed) {
      _appendUpgradeContent(mainSection);
      appendSpacer(mainSection);
    }

    _appendManageContent(mainSection, subscribed);

    card.addSection(mainSection);
    return card.build();
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  function _appendUpgradeContent(section) {
    section.addWidget(title('What you unlock'));

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

    appendSpacer(section);

    // Primary CTA — Stripe Checkout (promo codes enabled)
    const checkoutUrl = Subscription.getCheckoutUrl();
    if (checkoutUrl) {
      section.addWidget(
        CardService.newTextButton()
          .setText('Get Pro access')
          .setOpenLink(CardService.newOpenLink().setUrl(checkoutUrl))
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setBackgroundColor(COLORS.primary)
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
            '<font color="' + COLORS.muted + '">Could not load checkout. ' +
            'make sure STRIPE_SECRET_KEY and STRIPE_PRICE_ID are set in Script Properties.</font>'
          )
      );
    }
  }

  function _appendManageContent(section, subscribed) {
    section.addWidget(title(subscribed ? 'Subscription' : 'Already subscribed?'));

    const portalUrl = Subscription.getPortalUrl();
    if (portalUrl) {
      section.addWidget(
        CardService.newTextButton()
          .setText('Manage subscription')
          .setOpenLink(CardService.newOpenLink().setUrl(portalUrl))
      );
    }

    // Refresh subscription cache after returning from Stripe
    section.addWidget(
      CardService.newTextButton()
        .setText('Refresh status')
        .setOnClickAction(
          CardService.newAction().setFunctionName('actionRefreshSubscription')
        )
    );
    
    appendSpacer(section);
    section.addWidget(CardService.newDecoratedText()
      .setText('<font color="' + COLORS.muted + '">Need help? <u>Contact Support</u></font>')
      .setOpenLink(CardService.newOpenLink().setUrl('https://tally.so/r/EkvMx2')));
  }

  return { build };

})();
