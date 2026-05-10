/**
 * AccessCard.gs — Section 1: Access.
 *
 * Visual design rules (aligned with the Workspace add-on style guide and
 * Canva-style compact panels):
 *  - One single CardSection for the main content. Each new CardSection
 *    introduces a heavy horizontal divider, so we collapse related ideas
 *    into ONE section and rely on typography + spacing for hierarchy.
 *  - Visibility appears as a hero block at the top (most critical signal).
 *  - Key facts use DecoratedText.topLabel — small uppercase grey above the
 *    bold value — for a calm spreadsheet-free key/value rhythm.
 *  - Bold body titles ("Who can access", "Where this lives") replace the
 *    section.setHeader pattern so they read as inline section markers, not
 *    bureaucratic field labels.
 *  - Empty TextParagraphs act as breathing whitespace.
 *  - A second, lighter section is reserved for the "Manage user access"
 *    Bulk cleanup is accessible from the Drive homepage.
 */

const AccessCard = (function () {

  /**
   * Append Access content to an existing section. Used by Cards.gs
   * which keeps the entire file-context card in ONE CardSection so
   * no auto-divider is drawn between header / tabs / content.
   */
  function appendContent(section, file, state) {
    state = state || {};
    // Visibility is already conveyed by the file hero at the top of
    // the parent card, so the standalone visibility hero is dropped
    // to avoid duplication.
    appendFacts(section, file);
    appendSpacer(section);
    appendWhoCanAccess(section, file, state);

    if (file.parents && file.parents.length > 0) {
      appendSpacer(section);
      appendHierarchy(section, file);
    }
  }

  function addSections(builder, file, state) {
    const section = CardService.newCardSection();
    appendContent(section, file, state);
    builder.addSection(section);
  }

  // ─── Hero block ────────────────────────────────────────────────────────

  function appendHero(section, file) {
    const visibility = PermissionAnalyzer.computeVisibility(file);
    const colour = Formatters.COLORS[visibility] || Formatters.COLORS.private;

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(visibilityIcon(visibility))
      .setText('<b><font color="' + colour + '">' + Formatters.visibilityLabel(visibility) + '</font></b>')
      .setBottomLabel(visibilityCaption(visibility))
      .setWrapText(true));
  }

  function visibilityIcon(visibility) {
    switch (visibility) {
      case 'public':
        return CardService.newIconImage()
          .setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/public_grey600_24dp.png');
      case 'external':
        return CardService.newIconImage()
          .setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/group_grey600_24dp.png');
      case 'internal':
        return CardService.newIconImage()
          .setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/business_grey600_24dp.png');
      default:
        return CardService.newIconImage()
          .setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/lock_grey600_24dp.png');
    }
  }

  function visibilityCaption(v) {
    switch (v) {
      case 'public':   return 'Anyone on the web with the link can access this item.';
      case 'external': return 'Shared with people outside your organization.';
      case 'internal': return 'Visible to people in your organization.';
      case 'private':  return 'Only the owner has access.';
      default:         return '';
    }
  }

  // ─── Key facts ─────────────────────────────────────────────────────────

  function appendFacts(section, file) {
    const owner = (file.owners && file.owners[0]) || null;
    const ownerName = owner ? (owner.displayName || owner.emailAddress) : '—';

    section.addWidget(CardService.newDecoratedText()
      .setTopLabel('OWNER')
      .setText(Formatters.escapeHtml(ownerName))
      .setWrapText(true));

    if (file.driveId) {
      const drive = DriveService.getSharedDrive(file.driveId);
      section.addWidget(CardService.newDecoratedText()
        .setTopLabel('SHARED DRIVE')
        .setText(Formatters.escapeHtml(drive ? drive.name : 'Shared drive'))
        .setWrapText(true));
    }

    if (file.webViewLink) {
      section.addWidget(CardService.newTextButton()
        .setText('Open in Drive')
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
        .setOpenLink(CardService.newOpenLink().setUrl(file.webViewLink)));
    }
  }

  // ─── Who can access ────────────────────────────────────────────────────

  function appendWhoCanAccess(section, file, state) {
    section.addWidget(title('Who can access'));

    const rows = PermissionAnalyzer.buildAccessRows(file);

    if (rows.length === 0) {
      section.addWidget(CardService.newTextParagraph()
        .setText(muted('No permissions could be read for this item.')));
      return;
    }

    rows.forEach(function (row) {
      const p = row.permission;
      section.addWidget(CardService.newDecoratedText()
        .setStartIcon(Formatters.avatarFor(p))
        .setText('<b>' + Formatters.escapeHtml(Formatters.displayPrincipal(p)) + '</b>')
        .setBottomLabel(Formatters.roleLabel(p.role) + ' · ' + Formatters.accessSourceLabel(row.source))
        .setWrapText(true));
    });

    const expanded = state.expandedExplanation === '__why__';
    section.addWidget(CardService.newTextButton()
      .setText(expanded ? 'Hide explanations' : 'Why do they have access?')
      .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
      .setOnClickAction(CardService.newAction()
        .setFunctionName('actionToggleExplanation')
        .setParameters({
          fileId: file.id,
          expandedId: expanded ? '' : '__why__'
        })));

    if (expanded) {
      rows.forEach(function (row) {
        section.addWidget(CardService.newTextParagraph()
          .setText('<b>' + Formatters.escapeHtml(Formatters.displayPrincipal(row.permission)) + '</b><br>' + muted(row.why)));
      });
    }
  }

  // ─── Hierarchy ─────────────────────────────────────────────────────────

  function appendHierarchy(section, file) {
    section.addWidget(title('Where this lives'));

    const tree = renderTree(file);
    section.addWidget(CardService.newTextParagraph()
      .setText('<font face="monospace" color="' + Formatters.COLORS.subtle + '">' + Formatters.escapeHtml(tree) + '</font>'));

    section.addWidget(CardService.newTextParagraph()
      .setText(muted('This item may inherit permissions from its parent folders.')));
  }

  function renderTree(file) {
    const lines = [];
    let current = file;
    const chain = [{ name: file.name, isFile: true }];
    let safety = 0;

    while (current && current.parents && current.parents.length && safety < 6) {
      try {
        const parent = DriveService.getFile(current.parents[0]);
        chain.unshift({ name: parent.name, isFile: false });
        current = parent;
        safety++;
      } catch (e) {
        break;
      }
    }

    chain.forEach(function (node, i) {
      const indent = '  '.repeat(i);
      const branch = i === 0 ? '' : '└── ';
      lines.push(indent + branch + node.name);
    });
    return lines.join('\n');
  }

  // ─── Style helpers ─────────────────────────────────────────────────────

  function title(text) {
    return CardService.newTextParagraph()
      .setText('<b>' + Formatters.escapeHtml(text) + '</b>');
  }

  function muted(text) {
    return '<font color="' + Formatters.COLORS.muted + '">' + text + '</font>';
  }

  function appendSpacer(section) {
    section.addWidget(CardService.newTextParagraph().setText(' '));
  }

  return {
    addSections: addSections,
    appendContent: appendContent
  };
})();
