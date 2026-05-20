/**
 * AuditCard.gs — Section 2: Audit.
 *
 * Same visual rules as AccessCard:
 *   - One CardSection for the main content
 *   - Hero block at top with the most critical signal (public / external)
 *   - Bold inline titles instead of section.setHeader
 *   - Empty TextParagraphs as breathing whitespace
 *   - Filter pills are kept as ButtonSet, but moved to the bottom of the
 *     hero so they don't compete with the headline
 *
 * Detail pushed views (per-file investigation) follow the same rules.
 */

const AuditCard = (function () {

  const FILTERS = ['public', 'external', 'shared_drive', 'inherited', 'direct'];
  const MAX_AUDIT_FILES = 25;

  /**
   * Append Audit content to an existing section so the parent card
   * remains a single CardSection (no inter-section dividers).
   */
  function appendContent(section, file, state) {
    state = state || {};
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

    appendAuditSummary(section, file);

    if (isFolder) {
      // Folders have multiple children — filters + item list make sense.
      const activeFilters = (state.activeFilters || '').split(',').filter(Boolean);
      appendSpacer(section);
      appendFilters(section, file.id, activeFilters);

      const investigations = buildInvestigations(file, activeFilters);
      if (investigations.length === 0) {
        appendSpacer(section);
        section.addWidget(CardService.newTextParagraph()
          .setText(muted('No items matched the selected filters.')));
      } else {
        appendSpacer(section);
        section.addWidget(title('Items'));
        investigations.forEach(function (inv) {
          appendInvestigationRow(section, file.id, inv);
        });
      }
    } else {
      // Single file — show permissions directly, no filters needed.
      appendSpacer(section);
      appendSingleFileDetail(section, file);
    }
  }

  // ─── Single-file audit (no filters) ──────────────────────────────────

  function appendSingleFileDetail(section, file) {
    const sig = PermissionAnalyzer.auditSignals(file);

    section.addWidget(CardService.newDecoratedText()
      .setTopLabel('People with access')
      .setText('<b>' + sig.total + '</b>'));

    if (sig.externalCount > 0) {
      section.addWidget(CardService.newDecoratedText()
        .setTopLabel('External collaborators')
        .setText('<b>' + sig.externalCount + '</b>')
        .setBottomLabel(sig.externalDomains.join(', ') || 'None'));
    }

    appendSpacer(section);
    section.addWidget(title('All people'));

    const accessRows = PermissionAnalyzer.buildAccessRows(file);
    if (accessRows.length === 0) {
      section.addWidget(CardService.newTextParagraph()
        .setText(muted('No permissions could be read for this item.')));
    } else {
      accessRows.forEach(function (row) {
        const p = row.permission;
        const w = CardService.newDecoratedText()
          .setStartIcon(Formatters.avatarFor(p))
          .setTopLabel(Formatters.accessRowMeta(p, row.source))
          .setText('<b>' + Formatters.escapeHtml(Formatters.accessRowName(p)) + '</b>')
          .setWrapText(true);
        const email = Formatters.accessRowEmail(p);
        if (email) w.setBottomLabel(email);
        section.addWidget(w);
      });
    }
  }

  function addSections(builder, file, state) {
    const main = CardService.newCardSection();
    appendContent(main, file, state);
    builder.addSection(main);
  }

  // ─── Summary hero ──────────────────────────────────────────────────────

  function appendAuditSummary(section, file) {
    const sig = PermissionAnalyzer.auditSignals(file);

    const headlines = [];
    if (sig.hasPublic) {
      headlines.push({
        colour: Formatters.COLORS.public,
        text: 'Public link active',
        sub: 'Anyone on the web with the link can access this item.',
        iconUrl: 'https://www.gstatic.com/images/icons/material/system/2x/public_grey600_24dp.png'
      });
    }
    if (sig.externalCount > 0) {
      headlines.push({
        colour: Formatters.COLORS.external,
        text: Formatters.pluralize(sig.externalCount, 'external collaborator', 'external collaborators'),
        sub: sig.externalDomains.length ? 'Domains: ' + sig.externalDomains.join(', ') : 'External users have access.',
        iconUrl: 'https://www.gstatic.com/images/icons/material/system/2x/group_grey600_24dp.png'
      });
    }
    if (sig.hasDomain) {
      headlines.push({
        colour: Formatters.COLORS.internal,
        text: 'Visible to your organization',
        sub: 'Anyone in your domain can access this item.',
        iconUrl: 'https://www.gstatic.com/images/icons/material/system/2x/business_grey600_24dp.png'
      });
    }

    if (headlines.length === 0) {
      section.addWidget(CardService.newDecoratedText()
        .setStartIcon(CardService.newIconImage()
          .setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/check_circle_grey600_24dp.png'))
        .setText('<b><font color="' + Formatters.COLORS.success + '">No risky sharing</font></b>')
        .setBottomLabel('No public links, external users or domain-wide access detected.')
        .setWrapText(true));
      return;
    }

    headlines.forEach(function (h, i) {
      section.addWidget(CardService.newDecoratedText()
        .setStartIcon(CardService.newIconImage().setIconUrl(h.iconUrl))
        .setText('<b><font color="' + h.colour + '">' + Formatters.escapeHtml(h.text) + '</font></b>')
        .setBottomLabel(h.sub)
        .setWrapText(true));
      if (i < headlines.length - 1) appendSpacer(section);
    });
  }

  // ─── Filter pills ──────────────────────────────────────────────────────

  function appendFilters(section, fileId, active) {
    section.addWidget(CardService.newTextParagraph()
      .setText(muted('Filter')));

    const buttonSet = CardService.newButtonSet();
    FILTERS.forEach(function (f) {
      const btn = CardService.newTextButton()
        .setText(filterLabel(f))
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionToggleAuditFilter')
          .setParameters({
            fileId: fileId,
            filter: f,
            activeFilters: active.join(',')
          }));

      if (active.indexOf(f) >= 0) {
        btn.setTextButtonStyle(CardService.TextButtonStyle.FILLED);
        btn.setBackgroundColor(Formatters.COLORS.brand);
      } else {
        btn.setTextButtonStyle(CardService.TextButtonStyle.OUTLINED);
      }
      buttonSet.addButton(btn);
    });
    section.addWidget(buttonSet);
  }

  function filterLabel(f) {
    switch (f) {
      case 'public':       return 'Public';
      case 'external':     return 'External';
      case 'shared_drive': return 'Shared drive';
      case 'inherited':    return 'Inherited';
      case 'direct':       return 'Direct';
      default:             return f;
    }
  }

  // ─── Investigation rows ────────────────────────────────────────────────

  function buildInvestigations(file, activeFilters) {
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    let candidates = [file];

    if (isFolder) {
      try {
        const children = DriveService.listChildren(file.id, MAX_AUDIT_FILES);
        candidates = [file].concat(children).slice(0, MAX_AUDIT_FILES);
      } catch (e) {
        // Fall back to single-item audit on error.
      }
    }

    return candidates
      .map(function (f) {
        const sig = PermissionAnalyzer.auditSignals(f);
        return { file: f, sig: sig };
      })
      .filter(function (item) {
        if (activeFilters.length === 0) return true;
        return activeFilters.some(function (f) { return matchesFilter(f, item); });
      });
  }

  function matchesFilter(filter, item) {
    switch (filter) {
      case 'public':       return item.sig.hasPublic;
      case 'external':     return item.sig.externalCount > 0;
      case 'shared_drive': return !!item.file.driveId;
      case 'inherited':    return item.sig.inheritedCount > 0;
      case 'direct':       return item.sig.directCount > 0;
      default:             return false;
    }
  }

  function appendInvestigationRow(section, rootFileId, item) {
    const f = item.file;
    const sig = item.sig;

    const labelParts = [];
    labelParts.push(Formatters.visibilityLabel(sig.visibility));
    if (sig.externalCount > 0) labelParts.push(Formatters.pluralize(sig.externalCount, 'external'));
    if (sig.hasPublic)         labelParts.push('public link');

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIconUrl(f.iconLink || 'https://www.gstatic.com/images/icons/material/system/2x/insert_drive_file_grey600_24dp.png'))
      .setText('<b>' + Formatters.escapeHtml(f.name) + '</b>')
      .setBottomLabel(labelParts.join(' · '))
      .setWrapText(true)
      .setOnClickAction(CardService.newAction()
        .setFunctionName('actionOpenInvestigation')
        .setParameters({
          fileId: rootFileId,
          targetFileId: f.id
        })));
  }

  // ─── Investigation detail (pushed card) ────────────────────────────────

  function buildInvestigationDetail(rootFileId, targetFileId) {
    let target;
    try { target = DriveService.getFile(targetFileId); }
    catch (e) { return Cards.buildErrorCard(e); }

    const sig = PermissionAnalyzer.auditSignals(target);
    const card = CardService.newCardBuilder()
      .setName('AuditDetail_' + targetFileId)
      .setHeader(Cards.buildHeader(target));

    const main = CardService.newCardSection();

    main.addWidget(CardService.newDecoratedText()
      .setTopLabel('People with access')
      .setText('<b>' + sig.total + '</b>'));

    main.addWidget(CardService.newDecoratedText()
      .setTopLabel('External collaborators')
      .setText('<b>' + sig.externalCount + '</b>')
      .setBottomLabel(sig.externalDomains.join(', ') || 'None'));

    main.addWidget(CardService.newDecoratedText()
      .setTopLabel('Public link')
      .setText('<b>' + (sig.hasPublic ? 'Enabled' : 'Disabled') + '</b>'));

    appendSpacer(main);
    main.addWidget(title('All people'));

    const accessRows = PermissionAnalyzer.buildAccessRows(target);
    if (accessRows.length === 0) {
      main.addWidget(CardService.newTextParagraph()
        .setText(muted('No permissions could be read for this item.')));
    } else {
      accessRows.forEach(function (row) {
        const p = row.permission;
        const w = CardService.newDecoratedText()
          .setStartIcon(Formatters.avatarFor(p))
          .setTopLabel(Formatters.accessRowMeta(p, row.source))
          .setText('<b>' + Formatters.escapeHtml(Formatters.accessRowName(p)) + '</b>')
          .setWrapText(true);
        const email = Formatters.accessRowEmail(p);
        if (email) w.setBottomLabel(email);
        main.addWidget(w);
      });
    }

    card.addSection(main);

    if (target.webViewLink) {
      card.setFixedFooter(CardService.newFixedFooter()
        .setPrimaryButton(CardService.newTextButton()
          .setText('Open in Drive')
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setBackgroundColor(Formatters.COLORS.brand)
          .setOpenLink(CardService.newOpenLink().setUrl(target.webViewLink))));
    }

    return card.build();
  }

  // ─── CSV export ────────────────────────────────────────────────────────

  // Role weight for sorting: owner first, then descending authority.
  var ROLE_ORDER = { owner: 0, organizer: 1, fileOrganizer: 2, writer: 3, commenter: 4, reader: 5 };

  function exportCsv(rootFileId) {
    var root = DriveService.getFile(rootFileId);
    var isFolder = root.mimeType === 'application/vnd.google-apps.folder';
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd_HHmm');

    var csv = isFolder ? exportFolder(root, stamp) : exportSingleFile(root);

    var file = DriveApp.createFile(
      'Access Audit & Revoke_audit_' + stamp + '.csv',
      csv,
      MimeType.CSV
    );
    return file.getUrl();
  }

  /**
   * Single file: metadata block at the top, then a clean person list.
   *
   *   File, My Document
   *   Type, Sheet
   *   Visibility, Internal
   *
   *   Person, Email, Role, Access type
   *   DeDieu Ilanga, dedieu@…, Owner, Direct access
   */
  function exportSingleFile(f) {
    var vis = Formatters.visibilityLabel(PermissionAnalyzer.computeVisibility(f));
    var lines = [];
    lines.push(['File', csvEscape(f.name)].join(','));
    lines.push(['Type', Formatters.fileTypeLabel(f)].join(','));
    lines.push(['Visibility', vis].join(','));
    lines.push('');
    lines.push(['Person', 'Email', 'Role', 'Access type'].join(','));

    var accessRows = PermissionAnalyzer.buildAccessRows(f);
    sortByRole(accessRows);

    accessRows.forEach(function (row) {
      var p = row.permission;
      lines.push([
        csvEscape(Formatters.displayPrincipal(p)),
        csvEscape(p.emailAddress || ''),
        Formatters.roleLabel(p.role),
        Formatters.accessSourceLabel(row.source)
      ].join(','));
    });

    return lines.join('\n');
  }

  /**
   * Folder: one row per person per file (standard multi-file audit).
   */
  function exportFolder(root) {
    var items = [root].concat(DriveService.listChildren(root.id, MAX_AUDIT_FILES));
    var rows = [['File name', 'File type', 'Visibility', 'Person', 'Email', 'Role', 'Access type']];

    items.forEach(function (f) {
      var vis = Formatters.visibilityLabel(PermissionAnalyzer.computeVisibility(f));
      var fType = Formatters.fileTypeLabel(f);
      var accessRows = PermissionAnalyzer.buildAccessRows(f);
      sortByRole(accessRows);

      if (accessRows.length === 0) {
        rows.push([csvEscape(f.name), fType, vis, '', '', '', '']);
        return;
      }

      accessRows.forEach(function (row) {
        var p = row.permission;
        rows.push([
          csvEscape(f.name),
          fType,
          vis,
          csvEscape(Formatters.displayPrincipal(p)),
          csvEscape(p.emailAddress || ''),
          Formatters.roleLabel(p.role),
          Formatters.accessSourceLabel(row.source)
        ]);
      });
    });

    return rows.map(function (r) { return r.join(','); }).join('\n');
  }

  function sortByRole(accessRows) {
    accessRows.sort(function (a, b) {
      return (ROLE_ORDER[a.permission.role] || 99) - (ROLE_ORDER[b.permission.role] || 99);
    });
  }

  function csvEscape(s) {
    if (s == null) return '';
    s = String(s);
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
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
    buildInvestigationDetail: buildInvestigationDetail,
    exportCsv: exportCsv
  };
})();
