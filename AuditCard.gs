/**
 * AuditCard.gs — Section 2: Audit.
 *
 * Provides:
 *   - addSections(builder, file, state)        : main audit view
 *   - buildInvestigationDetail(rootId, fileId) : push-card detail per item
 *   - exportCsv(rootId)                        : write CSV to user's Drive
 *
 * The audit walks 1 level of children for folders / Shared Drives and
 * computes per-file signals via PermissionAnalyzer.
 */

const AuditCard = (function () {

  const FILTERS = ['public', 'external', 'shared_drive', 'inherited', 'direct'];
  const MAX_AUDIT_FILES = 25;

  function addSections(builder, file, state) {
    state = state || {};
    const activeFilters = (state.activeFilters || '').split(',').filter(Boolean);

    builder.addSection(buildFilterPills(file.id, activeFilters));
    builder.addSection(buildSummaryCard(file));

    const investigations = buildInvestigations(file, activeFilters);
    if (investigations.length === 0) {
      const empty = CardService.newCardSection().setHeader('No matches');
      empty.addWidget(CardService.newTextParagraph()
        .setText('<font color="#888">No items matched the selected filters.</font>'));
      builder.addSection(empty);
      return;
    }

    investigations.forEach(function (inv) {
      builder.addSection(buildInvestigationCard(file.id, inv));
    });
  }

  // ─── Filter pills ──────────────────────────────────────────────────────

  function buildFilterPills(fileId, active) {
    const section = CardService.newCardSection().setHeader('Quick filters');
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
    return section;
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

  // ─── Summary card ──────────────────────────────────────────────────────

  function buildSummaryCard(file) {
    const section = CardService.newCardSection().setHeader('Audit overview');
    const sig = PermissionAnalyzer.auditSignals(file);

    if (sig.hasPublic) {
      section.addWidget(warningRow(
        'This item is publicly accessible',
        'Anyone on the web with the link can access this item.'
      ));
    }
    if (sig.externalCount > 0) {
      const domains = sig.externalDomains.join(', ');
      section.addWidget(warningRow(
        Formatters.pluralize(sig.externalCount, 'external collaborator', 'external collaborators') + ' detected',
        domains ? 'Domains: ' + domains : 'External users have access to this item.'
      ));
    }
    if (sig.hasDomain) {
      section.addWidget(warningRow(
        'Visible to your entire organization',
        'Domain-wide access is enabled.'
      ));
    }
    if (!sig.hasPublic && !sig.externalCount && !sig.hasDomain) {
      section.addWidget(CardService.newDecoratedText()
        .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.CONFIRMATION_NUMBER_ICON))
        .setText('<b><font color="' + Formatters.COLORS.success + '">No risky sharing detected</font></b>')
        .setBottomLabel('No public links, no external users, no domain-wide access.')
        .setWrapText(true));
    }
    return section;
  }

  function warningRow(title, body) {
    return CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.STAR))
      .setText('<b><font color="' + Formatters.COLORS.warning + '">' + Formatters.escapeHtml(title) + '</font></b>')
      .setBottomLabel(body)
      .setWrapText(true);
  }

  // ─── Investigation cards ───────────────────────────────────────────────

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

  function buildInvestigationCard(rootFileId, item) {
    const f = item.file;
    const sig = item.sig;
    const section = CardService.newCardSection();

    const labelParts = [];
    labelParts.push(Formatters.visibilityLabel(sig.visibility));
    if (sig.externalCount > 0) labelParts.push(Formatters.pluralize(sig.externalCount, 'external'));
    if (sig.hasPublic)         labelParts.push('public link');

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIconUrl(f.iconLink || 'https://www.gstatic.com/images/icons/material/system/2x/insert_drive_file_grey600_24dp.png'))
      .setText(Formatters.escapeHtml(f.name))
      .setTopLabel(Formatters.fileTypeLabel(f))
      .setBottomLabel(labelParts.join(' · '))
      .setWrapText(true)
      .setOnClickAction(CardService.newAction()
        .setFunctionName('actionOpenInvestigation')
        .setParameters({
          fileId: rootFileId,
          targetFileId: f.id
        })));

    return section;
  }

  // ─── Investigation detail (pushed card) ─────────────────────────────────

  function buildInvestigationDetail(rootFileId, targetFileId) {
    let target;
    try { target = DriveService.getFile(targetFileId); }
    catch (e) { return Cards.buildErrorCard(e); }

    const sig = PermissionAnalyzer.auditSignals(target);
    const card = CardService.newCardBuilder()
      .setName('AuditDetail_' + targetFileId)
      .setHeader(Cards.buildHeader(target));

    const overview = CardService.newCardSection().setHeader('Sharing overview');
    overview.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.PERSON))
      .setTopLabel('People with access')
      .setText(String(sig.total)));
    overview.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.EMAIL))
      .setTopLabel('External collaborators')
      .setText(String(sig.externalCount))
      .setBottomLabel(sig.externalDomains.join(', ') || '—'));
    overview.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.STAR))
      .setTopLabel('Public link')
      .setText(sig.hasPublic ? 'Enabled' : 'Disabled'));
    card.addSection(overview);

    const list = CardService.newCardSection().setHeader('All people');
    PermissionAnalyzer.buildAccessRows(target).forEach(function (row) {
      const p = row.permission;
      list.addWidget(CardService.newDecoratedText()
        .setStartIcon(Formatters.avatarFor(p))
        .setText(Formatters.escapeHtml(Formatters.displayPrincipal(p)))
        .setTopLabel(Formatters.principalSubtitle(p))
        .setBottomLabel(Formatters.roleLabel(p.role) + ' · ' + row.sourceLabel)
        .setWrapText(true));
    });
    card.addSection(list);

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

  function exportCsv(rootFileId) {
    const root = DriveService.getFile(rootFileId);
    const isFolder = root.mimeType === 'application/vnd.google-apps.folder';
    const items = isFolder
      ? [root].concat(DriveService.listChildren(rootFileId, MAX_AUDIT_FILES))
      : [root];

    const rows = [['File ID', 'File name', 'Type', 'Visibility', 'Public link', 'External count', 'External domains', 'Total permissions']];
    items.forEach(function (f) {
      const sig = PermissionAnalyzer.auditSignals(f);
      rows.push([
        f.id,
        csvEscape(f.name),
        Formatters.fileTypeLabel(f),
        Formatters.visibilityLabel(sig.visibility),
        sig.hasPublic ? 'yes' : 'no',
        String(sig.externalCount),
        csvEscape(sig.externalDomains.join('; ')),
        String(sig.total)
      ]);
    });

    const csv = rows.map(function (r) { return r.join(','); }).join('\n');
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd_HHmm');
    const file = DriveApp.createFile(
      'DriveClarity_audit_' + stamp + '.csv',
      csv,
      MimeType.CSV
    );
    return file.getUrl();
  }

  function csvEscape(s) {
    if (s == null) return '';
    s = String(s);
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  return {
    addSections: addSections,
    buildInvestigationDetail: buildInvestigationDetail,
    exportCsv: exportCsv
  };
})();
