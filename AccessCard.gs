/**
 * AccessCard.gs — Section 1: Access.
 *
 * Provides addSections(builder, file, state) which appends to the main card:
 *   1. File Summary card section
 *   2. Who can access (vertical permission list)
 *   3. Why they have access (collapsible explanation per row)
 *   4. Permission hierarchy visualisation
 *   5. Shared Drive context (when applicable)
 */

const AccessCard = (function () {

  function addSections(builder, file, state) {
    state = state || {};

    builder.addSection(buildFileSummary(file));
    builder.addSection(buildWhoCanAccess(file, state));
    builder.addSection(buildHierarchy(file));

    if (file.driveId) {
      const sharedDrive = DriveService.getSharedDrive(file.driveId);
      if (sharedDrive) {
        builder.addSection(buildSharedDriveContext(sharedDrive));
      }
    }
  }

  // ─── 1. File summary ────────────────────────────────────────────────────

  function buildFileSummary(file) {
    const section = CardService.newCardSection().setHeader('File summary');
    const owner = (file.owners && file.owners[0]) || null;
    const visibility = PermissionAnalyzer.computeVisibility(file);

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.PERSON))
      .setTopLabel('Owner')
      .setText(owner ? (owner.displayName || owner.emailAddress) : '—'));

    if (file.driveId) {
      const drive = DriveService.getSharedDrive(file.driveId);
      section.addWidget(CardService.newDecoratedText()
        .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.HOTEL_ROOM_TYPES))
        .setTopLabel('Shared drive')
        .setText(drive ? drive.name : 'Shared drive'));
    }

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.EMAIL))
      .setTopLabel('Visibility')
      .setText(Formatters.visibilityBadge(visibility))
      .setBottomLabel(visibilityCaption(visibility)));

    if (file.webViewLink) {
      section.addWidget(CardService.newTextButton()
        .setText('Open in Drive')
        .setOpenLink(CardService.newOpenLink().setUrl(file.webViewLink)));
    }

    return section;
  }

  function visibilityCaption(v) {
    switch (v) {
      case 'public':   return 'Anyone on the web can access this item.';
      case 'external': return 'Shared with people outside your organization.';
      case 'internal': return 'Visible to people in your organization.';
      case 'private':  return 'Only the owner has access.';
      default:         return '';
    }
  }

  // ─── 2. Who can access ──────────────────────────────────────────────────

  function buildWhoCanAccess(file, state) {
    const section = CardService.newCardSection().setHeader('Who can access');
    const rows = PermissionAnalyzer.buildAccessRows(file);

    if (rows.length === 0) {
      section.addWidget(CardService.newTextParagraph()
        .setText('<font color="#888">No permissions could be read for this item.</font>'));
      return section;
    }

    rows.forEach(function (row) {
      const p = row.permission;
      section.addWidget(CardService.newDecoratedText()
        .setStartIcon(Formatters.avatarFor(p))
        .setText(Formatters.escapeHtml(Formatters.displayPrincipal(p)))
        .setTopLabel(Formatters.principalSubtitle(p))
        .setBottomLabel(Formatters.roleLabel(p.role) + ' · ' + Formatters.accessSourceLabel(row.source))
        .setWrapText(true));
    });

    section.addWidget(CardService.newDivider());

    const collapsibleHeader = state.expandedExplanation === '__why__'
      ? 'Hide explanations'
      : 'Why do they have access?';

    section.addWidget(CardService.newTextButton()
      .setText(collapsibleHeader)
      .setOnClickAction(CardService.newAction()
        .setFunctionName('actionToggleExplanation')
        .setParameters({
          fileId: file.id,
          expandedId: state.expandedExplanation === '__why__' ? '' : '__why__'
        })));

    if (state.expandedExplanation === '__why__') {
      rows.forEach(function (row) {
        section.addWidget(CardService.newDecoratedText()
          .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.DESCRIPTION))
          .setText(Formatters.escapeHtml(Formatters.displayPrincipal(row.permission)))
          .setBottomLabel(row.why)
          .setWrapText(true));
      });
    }

    return section;
  }

  // ─── 3. Hierarchy ──────────────────────────────────────────────────────

  function buildHierarchy(file) {
    const section = CardService.newCardSection().setHeader('Permission hierarchy');
    const tree = renderTree(file);

    section.addWidget(CardService.newTextParagraph()
      .setText('<font face="monospace">' + Formatters.escapeHtml(tree) + '</font>'));

    section.addWidget(CardService.newTextParagraph()
      .setText('<font color="#666">This item may inherit permissions from its parent folders.</font>'));

    return section;
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

  // ─── 4. Shared Drive context ───────────────────────────────────────────

  function buildSharedDriveContext(drive) {
    const section = CardService.newCardSection().setHeader('Shared drive context');

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.HOTEL_ROOM_TYPES))
      .setTopLabel('Drive name')
      .setText(drive.name || 'Shared drive'));

    const r = drive.restrictions || {};
    const summary = [];
    if (r.domainUsersOnly)            summary.push('Restricted to your organization');
    if (r.driveMembersOnly)           summary.push('Members only — no outside sharing');
    if (r.copyRequiresWriterPermission) summary.push('Copy requires editor permission');
    if (summary.length === 0)         summary.push('No additional restrictions configured.');

    section.addWidget(CardService.newTextParagraph()
      .setText(summary.map(function (s) { return '• ' + s; }).join('\n')));

    return section;
  }

  return { addSections: addSections };
})();
