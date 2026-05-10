/**
 * Cards.gs — Top-level card orchestration for DriveClarity.
 *
 * Responsible for:
 *  - Building the main card frame (header + tab bar + active section)
 *  - Empty / error state cards
 *  - Shared header that shows the selected file context
 *
 * Section content is delegated to AccessCard / AuditCard / CleanupCard.
 */

const Cards = (function () {

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

    const builder = CardService.newCardBuilder()
      .setName('DriveClarityMain_' + activeSection)
      .setHeader(buildHeader(file));

    builder.addSection(buildTabBar(fileId, activeSection));

    if (activeSection === 'access') {
      AccessCard.addSections(builder, file, state);
    } else if (activeSection === 'audit') {
      AuditCard.addSections(builder, file, state);
      builder.setFixedFooter(buildAuditFooter(file.id));
    }

    builder.addSection(buildManageUsersSection());

    return builder.build();
  }

  /**
   * Build the Drive homepage card (no file selected).
   * Centred on the user-search + bulk-revoke flow, since this workflow is
   * inherently user-centric, not file-centric.
   */
  function buildHomepageCard(state) {
    state = state || {};
    const builder = CardService.newCardBuilder()
      .setName('DriveClarityHome')
      .setHeader(CardService.newCardHeader()
        .setTitle('DriveClarity')
        .setSubtitle('Manage user access across your files')
        .setImageUrl('https://www.gstatic.com/images/icons/material/system/2x/verified_user_grey600_48dp.png')
        .setImageStyle(CardService.ImageStyle.SQUARE));

    CleanupCard.addHomepageSections(builder, state);

    const footer = CleanupCard.buildHomepageFooter(state);
    if (footer) builder.setFixedFooter(footer);

    return builder.build();
  }

  /**
   * Small CTA inside the file-context card that takes the user back to the
   * homepage where the user-search + revoke flow lives. Rendered as a
   * lightweight footer-style block (its own section so the divider acts as
   * a visual separator from the main content).
   */
  function buildManageUsersSection() {
    const section = CardService.newCardSection();
    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage()
        .setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/manage_accounts_grey600_24dp.png'))
      .setText('<b>Manage user access</b>')
      .setBottomLabel('Search a person and revoke their access to all your files.')
      .setWrapText(true)
      .setOnClickAction(CardService.newAction()
        .setFunctionName('actionOpenHomepage')));
    return section;
  }

  /**
   * Empty state shown when no file is selected.
   */
  function buildEmptyStateCard(message) {
    const card = CardService.newCardBuilder()
      .setName('DriveClarityEmpty');

    const section = CardService.newCardSection();

    section.addWidget(CardService.newImage()
      .setImageUrl('https://www.gstatic.com/images/icons/material/system/2x/verified_user_grey600_48dp.png')
      .setAltText('DriveClarity'));

    section.addWidget(CardService.newTextParagraph()
      .setText('<b>DriveClarity</b>'));

    section.addWidget(CardService.newTextParagraph()
      .setText(message));

    section.addWidget(CardService.newDivider());

    section.addWidget(CardService.newTextParagraph()
      .setText('<b>What you can do</b>'));

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.PERSON))
      .setText('See who can access')
      .setBottomLabel('Direct, group and inherited permissions explained.'));

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/search_grey600_24dp.png'))
      .setText('Audit public & external sharing')
      .setBottomLabel('Spot risky links and external collaborators.'));

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.MULTIPLE_PEOPLE))
      .setText('Clean up departing users')
      .setBottomLabel('Bulk revoke access for offboarded employees.'));

    card.addSection(section);
    return card.build();
  }

  /**
   * Generic error card shown when Drive API throws.
   * Technical detail is sent to Stackdriver, never to the user.
   */
  function buildErrorCard(err) {
    const card = CardService.newCardBuilder()
      .setName('DriveClarityError')
      .setHeader(CardService.newCardHeader()
        .setTitle('Something went wrong')
        .setImageUrl('https://www.gstatic.com/images/icons/material/system/2x/error_outline_grey600_24dp.png'));

    const section = CardService.newCardSection();
    section.addWidget(CardService.newTextParagraph()
      .setText(Formatters.escapeHtml(Formatters.friendlyError(err))));

    section.addWidget(CardService.newTextParagraph()
      .setText('<font color="#94A3B8">If this keeps happening, try reopening DriveClarity or selecting the file again.</font>'));

    card.addSection(section);
    return card.build();
  }

  // ─── Internal builders ──────────────────────────────────────────────────

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

  function buildTabBar(fileId, activeSection) {
    const section = CardService.newCardSection();
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
    return section;
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
    buildEmptyStateCard: buildEmptyStateCard,
    buildErrorCard: buildErrorCard,
    buildHeader: buildHeader,
    buildTabBar: buildTabBar
  };
})();
