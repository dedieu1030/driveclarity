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
   * Build the main contextual card.
   * @param {string} fileId          Drive file ID currently selected.
   * @param {string} activeSection   'access' | 'audit' | 'cleanup'
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
    } else if (activeSection === 'cleanup') {
      CleanupCard.addSections(builder, file, state);
      const footer = CleanupCard.buildFooter(file.id, state);
      if (footer) builder.setFixedFooter(footer);
    }

    return builder.build();
  }

  /**
   * Empty state shown when no file is selected.
   */
  function buildEmptyStateCard(message) {
    const card = CardService.newCardBuilder()
      .setName('DriveClarityEmpty');

    const section = CardService.newCardSection();

    section.addWidget(CardService.newImage()
      .setImageUrl('https://www.gstatic.com/images/icons/material/system/2x/folder_shared_grey600_48dp.png')
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
   */
  function buildErrorCard(err) {
    const card = CardService.newCardBuilder()
      .setName('DriveClarityError')
      .setHeader(CardService.newCardHeader()
        .setTitle('Something went wrong')
        .setImageUrl('https://www.gstatic.com/images/icons/material/system/2x/error_outline_grey600_24dp.png'));

    const section = CardService.newCardSection();
    section.addWidget(CardService.newTextParagraph()
      .setText('We could not load this item. This usually means the file was deleted, you lost access, or DriveClarity needs to be reauthorized.'));

    section.addWidget(CardService.newTextParagraph()
      .setText('<font color="#888">Details: ' + (err && err.message ? Formatters.escapeHtml(err.message) : 'unknown error') + '</font>'));

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
      { id: 'access',  label: 'Access' },
      { id: 'audit',   label: 'Audit' },
      { id: 'cleanup', label: 'Cleanup' }
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
    buildEmptyStateCard: buildEmptyStateCard,
    buildErrorCard: buildErrorCard,
    buildHeader: buildHeader,
    buildTabBar: buildTabBar
  };
})();
