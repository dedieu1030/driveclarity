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
    // the parent card; the owner is the first row of "Who can access".
    // We only render appendFacts when it has something to say (e.g.
    // the file lives in a shared drive — useful context).
    const factsRendered = appendFacts(section, file);
    if (factsRendered) {
      appendSpacer(section);
      appendSpacer(section);
    }
    appendWhoCanAccess(section, file, state);

    if (file.parents && file.parents.length > 0) {
      appendSpacer(section);
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
  //
  // The owner is intentionally omitted here — "Who can access" lists
  // every principal (owner included, sorted first by role priority),
  // so a separate Owner field would be a duplicate. We only surface
  // facts that the access list does NOT convey, currently the shared
  // drive badge.

  function appendFacts(section, file) {
    if (file.driveId) {
      const drive = DriveService.getSharedDrive(file.driveId);
      section.addWidget(CardService.newDecoratedText()
        .setTopLabel('Shared drive')
        .setText(Formatters.escapeHtml(drive ? drive.name : 'Shared drive'))
        .setWrapText(true));
      return true;
    }
    return false;
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

    // Discrete inline link (caption-coloured, underlined, no arrow) to
    // avoid an outlined button competing with the people rows.
    section.addWidget(CardService.newDecoratedText()
      .setText('<font color="' + Formatters.COLORS.caption + '"><u>Why do they have access?</u></font>')
      .setWrapText(false)
      .setOnClickAction(CardService.newAction()
        .setFunctionName('actionShowExplanations')
        .setParameters({ fileId: file.id })));

    rows.forEach(function (row) {
      const p = row.permission;
      const name = Formatters.escapeHtml(Formatters.accessRowName(p));
      const email = Formatters.accessRowEmail(p);
      const meta = Formatters.accessRowMeta(p, row.source);

      const widget = CardService.newDecoratedText()
        .setStartIcon(Formatters.avatarFor(p))
        .setTopLabel(meta)
        .setText('<b>' + name + '</b>')
        .setWrapText(true);
      if (email) widget.setBottomLabel(email);

      if (PermissionAnalyzer.canRevokePermission(file, p)) {
        widget
          .setEndIcon(CardService.newIconImage()
            .setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/chevron_right_grey600_24dp.png'))
          .setOnClickAction(CardService.newAction()
            .setFunctionName('actionOpenRevokeRow')
            .setParameters({ fileId: file.id, permissionId: p.id }));
      }
      section.addWidget(widget);
    });
  }

  /**
   * Pushed confirmation card for revoking a single principal from a
   * single file. Drive's system back arrow returns to the Access view
   * unchanged; "Confirm" executes the revoke and refreshes the Access
   * card with fresh data.
   */
  function buildRevokeRowCard(fileId, permissionId) {
    let file, perm;
    try { file = DriveService.getFile(fileId); }
    catch (e) { return Cards.buildErrorCard(e); }

    try {
      const list = DriveService.listPermissions(fileId);
      perm = list.find(function (p) { return p.id === permissionId; });
    } catch (e) { return Cards.buildErrorCard(e); }

    if (!perm) {
      return Cards.buildErrorCard(new Error('notFound'));
    }
    if (!PermissionAnalyzer.canRevokePermission(file, perm)) {
      return Cards.buildErrorCard(new Error('insufficientFilePermissions'));
    }

    const card = CardService.newCardBuilder()
      .setName('RevokeRow_' + fileId + '_' + permissionId);

    const section = CardService.newCardSection();

    const personWidget = CardService.newDecoratedText()
      .setStartIcon(Formatters.avatarFor(perm))
      .setText('<b>' + Formatters.escapeHtml(Formatters.accessRowName(perm)) + '</b>')
      .setWrapText(true);
    const personEmail = Formatters.accessRowEmail(perm);
    if (personEmail) personWidget.setBottomLabel(personEmail);
    section.addWidget(personWidget);

    appendSpacer(section);
    section.addWidget(title('Remove access'));
    section.addWidget(CardService.newTextParagraph()
      .setText('<font color="' + Formatters.COLORS.subtle + '">'
             + 'This will remove their <b>' + Formatters.roleLabel(perm && perm.role).toLowerCase() + '</b> access to <b>'
             + Formatters.escapeHtml(file.name || 'this item') + '</b>. They will no longer be able to open it.'
             + '</font>'));

    appendSpacer(section);
    section.addWidget(CardService.newTextParagraph()
      .setText('<b><font color="' + Formatters.COLORS.danger + '">This action cannot be undone.</font></b>'));

    card.addSection(section);

    card.setFixedFooter(CardService.newFixedFooter()
      .setPrimaryButton(CardService.newTextButton()
        .setText('Remove access')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor(Formatters.COLORS.danger)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionExecuteRevokeRow')
          .setParameters({ fileId: fileId, permissionId: permissionId })))
      .setSecondaryButton(CardService.newTextButton()
        .setText('Cancel')
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionPopCard'))));

    return card.build();
  }

  /**
   * Pushed card listing each principal with avatar, name, email and
   * a plain-language explanation. Reached via "Why do they have
   * access?" — the Drive system back arrow returns to the file card.
   */
  function buildExplanationCard(fileId) {
    let file;
    try { file = DriveService.getFile(fileId); }
    catch (e) { return Cards.buildErrorCard(e); }

    const card = CardService.newCardBuilder()
      .setName('AccessExplanations_' + fileId);

    const section = CardService.newCardSection();

    section.addWidget(title('Why they have access'));
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    const itemNoun = isFolder ? 'folder' : 'file';
    section.addWidget(CardService.newTextParagraph()
      .setText(muted('A reason for each person who can access this ' + itemNoun + '.')));
    appendSpacer(section);

    const rows = PermissionAnalyzer.buildAccessRows(file);
    if (rows.length === 0) {
      section.addWidget(CardService.newTextParagraph()
        .setText(muted('No permissions could be read for this item.')));
    } else {
      rows.forEach(function (row, i) {
        const p = row.permission;
        const name = Formatters.escapeHtml(Formatters.accessRowName(p));
        const email = Formatters.accessRowEmail(p);

        // Three visual levels:
        //  1. Name      — body weight, bold (<b>)
        //  2. Email     — caption colour, slightly smaller (<font size="-1">)
        //  3. Explanation — native bottomLabel (small + grey by default)
        const text = '<b>' + name + '</b>'
                   + (email
                      ? '<br><font color="' + Formatters.COLORS.caption + '"><font size="-1">'
                        + Formatters.escapeHtml(email) + '</font></font>'
                      : '');

        section.addWidget(CardService.newDecoratedText()
          .setStartIcon(Formatters.avatarFor(p))
          .setText(text)
          .setBottomLabel(row.why)
          .setWrapText(true));

        if (i < rows.length - 1) appendSpacer(section);
      });
    }

    card.addSection(section);
    return card.build();
  }

  // ─── Hierarchy ─────────────────────────────────────────────────────────

  function appendHierarchy(section, file) {
    section.addWidget(title('Where this lives'));

    var chain = buildChain(file);

    chain.forEach(function (node, i) {
      var indent = '\u00A0\u00A0'.repeat(i);
      var branch = i === 0 ? '' : '└\u00A0';
      var prefix = indent + branch;

      var text = '<font color="' + Formatters.COLORS.subtle + '">'
               + Formatters.escapeHtml(prefix)
               + '<b>' + Formatters.escapeHtml(node.name) + '</b></font>';

      var row = CardService.newDecoratedText()
        .setText(text)
        .setWrapText(true);
      if (node.link) {
        row.setOpenLink(CardService.newOpenLink().setUrl(node.link));
      }
      section.addWidget(row);
    });

    section.addWidget(CardService.newTextParagraph()
      .setText(muted('This item may inherit permissions from its parent folders.')));
  }

  function buildChain(file) {
    var current = file;
    var chain = [{
      name: file.name,
      link: file.webViewLink || '',
      mimeType: file.mimeType || '',
      isFile: true
    }];
    var safety = 0;

    while (current && current.parents && current.parents.length && safety < 6) {
      try {
        var parent = DriveService.getFile(current.parents[0]);
        chain.unshift({
          name: parent.name,
          link: parent.webViewLink || '',
          mimeType: parent.mimeType || '',
          isFile: false
        });
        current = parent;
        safety++;
      } catch (e) {
        break;
      }
    }
    return chain;
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
    appendContent: appendContent,
    buildExplanationCard: buildExplanationCard,
    buildRevokeRowCard: buildRevokeRowCard
  };
})();
