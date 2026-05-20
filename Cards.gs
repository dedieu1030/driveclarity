/**
 * Cards.gs — Top-level card orchestration for Access Audit & Revoke for Drive.
 *
 * Responsible for:
 *  - Building the main card frame (header + tab bar + active section)
 *  - Empty / error state cards
 *  - Shared header that shows the selected file context
 *
 * Section content is delegated to AccessCard / AuditCard / CleanupCard.
 */

const Cards = (function () {

  /** Public logo URL — keep in sync with appsscript.json addOns.common.logoUrl (pin commit when replacing addon-logo.png). */
  const ADD_ON_LOGO_URL =
    'https://raw.githubusercontent.com/dedieu1030/driveclarity/5a0b96f/addon-logo.png';

  // ─── Public ─────────────────────────────────────────────────────────────

  /**
   * Build the main contextual card (file selected).
   * @param {string} fileId          Drive file ID currently selected.
   * @param {string} activeSection   'access' | 'audit'
   * @param {object} state           Optional UI state to thread through.
   */
  function buildMainCard(fileId, activeSection, state) {
    state = state || {};
    activeSection = activeSection || 'access';

    let file;
    try {
      file = DriveService.getFile(fileId);
    } catch (err) {
      return buildErrorCard(err);
    }

    // Single CardSection so CardService never draws auto-dividers
    // between header / tabs / content. Hierarchy is conveyed only by
    // typography (bold titles), spacing (empty paragraphs as spacers)
    // and muted secondary text — Material's "calm document" guidance.
    const builder = CardService.newCardBuilder()
      .setName('AccessAuditMain_' + activeSection);

    const section = CardService.newCardSection();
    appendFileHero(section, file);
    appendSpacer(section);
    appendTabBar(section, fileId, activeSection);
    // Extra breathing room between the tab bar and the section content
    // — the tab bar functions as a chapter break, so a single spacer
    // looked too tight in user testing.
    appendSpacer(section);
    appendSpacer(section);

    if (activeSection === 'access') {
      AccessCard.appendContent(section, file, state);
    } else if (activeSection === 'audit') {
      if (!Subscription.isActive()) {
        // Return paywall immediately for the Audit tab
        return PaywallCard.build(false, 'feature');
      }
      AuditCard.appendContent(section, file, state);
      builder.setFixedFooter(buildAuditFooter(file.id));
    }

    builder.addSection(section);
    return builder.build();
  }

  /**
   * Build the Drive homepage card (no file selected).
   * Centred on the user-search + bulk-revoke flow, since this workflow is
   * inherently user-centric, not file-centric.
   */
  function buildHomepageCard(state) {
    state = state || {};
    // No CardHeader: the Drive side panel already shows "Access Audit & Revoke for Drive"
    // in its system chrome. A second title/icon inside the card body
    // would be pure redundancy.
    //
    // Homepage's only mission: explain the tool. Bulk cleanup lives in
    // its own pushed card, accessed via the fixed-footer CTA below.
    const builder = CardService.newCardBuilder()
      .setName('AccessAuditHome');

    CleanupCard.addHomepageHeroSections(builder);
    builder.setFixedFooter(CleanupCard.buildHomepageFooter());

    return builder.build();
  }

  /**
   * Pushed card dedicated to the user-search + bulk-revoke workflow.
   * Reached from the homepage CTA or the file-context "Manage user
   * access" link. The Drive side panel automatically shows a system
   * back arrow that pops this card.
   */
  function buildBulkCleanupCard(state) {
    state = state || {};
    // No CardHeader: the user just tapped a labelled CTA and the
    // system back arrow makes the navigation context obvious. Adding
    // a header would only repeat what the user already knows.
    const builder = CardService.newCardBuilder()
      .setName('AccessAuditBulk');

    CleanupCard.addBulkCleanupSections(builder, state);

    const footer = CleanupCard.buildBulkCleanupFooter(state);
    if (footer) builder.setFixedFooter(footer);

    return builder.build();
  }

  /**
   * Empty state shown when no file is selected.
   */
  function buildEmptyStateCard(message) {
    const card = CardService.newCardBuilder()
      .setName('DriveAccessViewer_Empty');

    const section = CardService.newCardSection();

    // Grid thumbnails stay small; a full-width Image in a centered column uses
    // the panel width (Card Service has no pixel size for images).
    section.addWidget(CardService.newColumns()
      .addColumn(CardService.newColumn()
        .setHorizontalSizeStyle(CardService.HorizontalSizeStyle.FILL_AVAILABLE_SPACE)
        .setHorizontalAlignment(CardService.HorizontalAlignment.CENTER)
        .addWidget(CardService.newImage()
          .setImageUrl(ADD_ON_LOGO_URL)
          .setAltText('Access Audit & Revoke for Drive')))
      .setWrapStyle(CardService.WrapStyle.WRAP));

    section.addWidget(CardService.newTextParagraph()
      .setText('<b>Access Audit & Revoke for Drive</b>'));

    section.addWidget(CardService.newTextParagraph()
      .setText(message));

    section.addWidget(CardService.newDivider());

    section.addWidget(CardService.newTextParagraph()
      .setText('<b>What you can do</b>'));

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.PERSON))
      .setText('See who has access')
      .setBottomLabel('Direct, through a group, or inherited.'));

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/search_grey600_24dp.png'))
      .setText('Audit external sharing')
      .setBottomLabel('Public links and external collaborators.'));

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.MULTIPLE_PEOPLE))
      .setText('Bulk cleanup')
      .setBottomLabel('Revoke a person’s access across your Drive.'));

    card.addSection(section);
    return card.build();
  }

  /**
   * Generic error card shown when Drive API throws.
   * Technical detail is sent to Stackdriver, never to the user.
   */
  function buildErrorCard(err) {
    const card = CardService.newCardBuilder()
      .setName('AccessAuditError');

    const section = CardService.newCardSection();
    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage()
        .setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/error_outline_grey600_24dp.png'))
      .setText('<b>Something went wrong</b>')
      .setWrapText(true));

    section.addWidget(CardService.newTextParagraph()
      .setText(Formatters.escapeHtml(Formatters.friendlyError(err))));

    section.addWidget(CardService.newTextParagraph()
      .setText('<font color="' + Formatters.COLORS.muted + '">If this keeps happening, try reopening Access Audit & Revoke for Drive or selecting the file again.</font>'));

    card.addSection(section);
    return card.build();
  }

  // ─── Internal builders ──────────────────────────────────────────────────

  /**
   * Inline file hero rendered at the top of the unified section. Replaces
   * the legacy CardHeader (which auto-draws a divider underneath).
   */
  function appendFileHero(section, file) {
    const visibility = PermissionAnalyzer.computeVisibility(file);
    const visColour = Formatters.COLORS[visibility] || Formatters.COLORS.private;
    const visLabel = Formatters.visibilityLabel(visibility);
    const typeLabel = Formatters.fileTypeLabel(file);

    const text = '<b>' + Formatters.escapeHtml(file.name || 'Untitled') + '</b>'
               + '<br><font color="' + visColour + '">' + visLabel + '</font>'
               + ' <font color="' + Formatters.COLORS.muted + '">· ' + Formatters.escapeHtml(typeLabel) + '</font>';

    const widget = CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage()
        .setIconUrl(file.iconLink || 'https://www.gstatic.com/images/icons/material/system/2x/insert_drive_file_grey600_24dp.png'))
      .setText(text)
      .setWrapText(true);

    // The whole file hero row is the link to Drive — no end icon, the
    // file title itself is the affordance, matching native Drive UX.
    if (file.webViewLink) {
      widget.setOpenLink(CardService.newOpenLink().setUrl(file.webViewLink));
    }

    section.addWidget(widget);
  }

  /**
   * Inline tab bar — added as a widget to the parent section so it
   * never introduces its own divider.
   */
  function appendTabBar(section, fileId, activeSection) {
    const buttonSet = CardService.newButtonSet();

    [
      { id: 'access', label: 'Access' },
      { id: 'audit',  label: 'Audit' }
    ].forEach(function (tab) {
      const btn = CardService.newTextButton()
        .setText(tab.label)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionSwitchSection')
          .setParameters({ fileId: fileId, section: tab.id }));

      if (tab.id === activeSection) {
        btn.setTextButtonStyle(CardService.TextButtonStyle.FILLED);
        btn.setBackgroundColor(Formatters.COLORS.brand);
      } else {
        btn.setTextButtonStyle(CardService.TextButtonStyle.OUTLINED);
      }
      buttonSet.addButton(btn);
    });

    section.addWidget(buttonSet);
  }

  function appendSpacer(section) {
    section.addWidget(CardService.newTextParagraph().setText(' '));
  }

  /**
   * Legacy CardHeader builder. Still used by AuditCard.buildInvestigationDetail
   * (a pushed sub-card where a CardHeader is appropriate because the user
   * has explicitly drilled into a single item).
   */
  function buildHeader(file) {
    const visibility = PermissionAnalyzer.computeVisibility(file);
    const subtitle = Formatters.visibilityLabel(visibility) + ' · ' + Formatters.fileTypeLabel(file);
    const header = CardService.newCardHeader()
      .setTitle(file.name || 'Untitled')
      .setSubtitle(subtitle)
      .setImageStyle(CardService.ImageStyle.SQUARE);

    if (file.iconLink) {
      header.setImageUrl(file.iconLink);
    } else {
      header.setImageUrl('https://www.gstatic.com/images/icons/material/system/2x/insert_drive_file_grey600_24dp.png');
    }
    return header;
  }

  function buildAuditFooter(fileId) {
    return CardService.newFixedFooter()
      .setPrimaryButton(CardService.newTextButton()
        .setText('Export CSV')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor(Formatters.COLORS.brand)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionExportAuditCsv')
          .setParameters({ fileId: fileId })));
  }

  return {
    buildMainCard: buildMainCard,
    buildHomepageCard: buildHomepageCard,
    buildBulkCleanupCard: buildBulkCleanupCard,
    buildEmptyStateCard: buildEmptyStateCard,
    buildErrorCard: buildErrorCard,
    buildHeader: buildHeader
  };
})();
