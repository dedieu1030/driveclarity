/**
 * CleanupCard.gs — Section 3: Cleanup.
 *
 * Provides:
 *   - addSections(builder, file, state)            : main cleanup view
 *   - buildFooter(fileId, state)                   : conditional sticky footer
 *   - buildConfirmRevokeCard(fileId, target, ids)  : pushed confirmation card
 *   - executeRevoke(ids, target)                   : performs Permissions.delete
 *   - buildResultReport(fileId, target, result)    : pushed result summary
 *
 * Search strategy:
 *   We list files owned by the current user (Drive doesn't expose a "all
 *   files where X has access" query for non-admin contexts) and inspect
 *   each file's permissions to find the target email. This covers the
 *   most common offboarding scenario where the manager owns the files.
 */

const CleanupCard = (function () {

  const MAX_SEARCH_FILES = 50;

  function addSections(builder, file, state) {
    state = state || {};

    builder.addSection(buildSearchSection(file.id, state));

    if (state.cleanupTarget) {
      const matches = findFilesAccessibleBy(state.cleanupTarget);
      builder.addSection(buildResultsHeader(state.cleanupTarget, matches));
      builder.addSection(buildResultsList(file.id, state, matches));
    } else {
      const help = CardService.newCardSection().setHeader('How it works');
      help.addWidget(CardService.newTextParagraph()
        .setText('Search for a departing employee by email. DriveClarity scans files you own and lists everywhere they have access, so you can revoke in bulk.'));
      builder.addSection(help);
    }
  }

  // ─── Search section ────────────────────────────────────────────────────

  function buildSearchSection(fileId, state) {
    const section = CardService.newCardSection().setHeader('Find a user');

    const input = CardService.newTextInput()
      .setFieldName('cleanup_search')
      .setTitle('Email or name')
      .setHint('e.g. alex@company.com');
    if (state.cleanupTarget) {
      input.setValue(state.cleanupTarget);
    }
    section.addWidget(input);

    section.addWidget(CardService.newTextButton()
      .setText('Search')
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setBackgroundColor(Formatters.COLORS.brand)
      .setOnClickAction(CardService.newAction()
        .setFunctionName('actionRunCleanupSearch')
        .setParameters({ fileId: fileId })));

    return section;
  }

  // ─── Results ───────────────────────────────────────────────────────────

  function buildResultsHeader(target, matches) {
    const section = CardService.newCardSection();

    if (matches.length === 0) {
      section.addWidget(CardService.newDecoratedText()
        .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.PERSON))
        .setText(Formatters.escapeHtml(target))
        .setBottomLabel('No matching access found in files you own.')
        .setWrapText(true));
      return section;
    }

    const direct    = matches.filter(function (m) { return m.source === 'direct'; }).length;
    const group     = matches.filter(function (m) { return m.source === 'group'; }).length;
    const inherited = matches.filter(function (m) { return m.source === 'inherited'; }).length;

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.PERSON))
      .setText('<b>' + Formatters.escapeHtml(target) + '</b>')
      .setBottomLabel(Formatters.pluralize(matches.length, 'item', 'items') + ' · '
                    + direct + ' direct · ' + group + ' group · ' + inherited + ' inherited')
      .setWrapText(true));

    return section;
  }

  function buildResultsList(fileId, state, matches) {
    const section = CardService.newCardSection().setHeader('Items with access');
    const selected = new Set((state.cleanupSelected || '').split(',').filter(Boolean));

    matches.forEach(function (m) {
      const itemKey = m.fileId + ':' + m.permissionId;
      const checkbox = CardService.newSwitch()
        .setFieldName('cleanup_item_' + itemKey)
        .setControlType(CardService.SwitchControlType.CHECK_BOX)
        .setValue(itemKey)
        .setSelected(selected.has(itemKey))
        .setOnChangeAction(CardService.newAction()
          .setFunctionName('actionToggleCleanupItem')
          .setParameters({
            fileId: fileId,
            itemId: itemKey,
            cleanupTarget: state.cleanupTarget,
            selected: state.cleanupSelected || ''
          }));

      const dt = CardService.newDecoratedText()
        .setStartIcon(CardService.newIconImage().setIconUrl(m.iconLink || 'https://www.gstatic.com/images/icons/material/system/2x/insert_drive_file_grey600_24dp.png'))
        .setText(Formatters.escapeHtml(m.fileName))
        .setBottomLabel(Formatters.roleLabel(m.role) + ' · ' + Formatters.accessSourceLabel(m.source))
        .setSwitchControl(checkbox)
        .setWrapText(true);

      section.addWidget(dt);
    });

    return section;
  }

  // ─── Footer ────────────────────────────────────────────────────────────

  function buildFooter(fileId, state) {
    state = state || {};
    const selectedIds = (state.cleanupSelected || '').split(',').filter(Boolean);
    if (!state.cleanupTarget || selectedIds.length === 0) return null;

    return CardService.newFixedFooter()
      .setPrimaryButton(CardService.newTextButton()
        .setText('Revoke selected (' + selectedIds.length + ')')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor(Formatters.COLORS.danger)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionConfirmRevoke')
          .setParameters({
            fileId: fileId,
            cleanupTarget: state.cleanupTarget,
            cleanupSelected: state.cleanupSelected
          })))
      .setSecondaryButton(CardService.newTextButton()
        .setText('Clear')
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionClearCleanupSelection')
          .setParameters({
            fileId: fileId,
            cleanupTarget: state.cleanupTarget
          })));
  }

  // ─── Confirmation card ─────────────────────────────────────────────────

  function buildConfirmRevokeCard(fileId, target, selectedCsv) {
    const ids = (selectedCsv || '').split(',').filter(Boolean);
    const card = CardService.newCardBuilder()
      .setName('CleanupConfirm')
      .setHeader(CardService.newCardHeader()
        .setTitle('Confirm revoke')
        .setSubtitle('This action cannot be undone'));

    const section = CardService.newCardSection();

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.STAR))
      .setText('<b><font color="' + Formatters.COLORS.danger + '">Irreversible action</font></b>')
      .setBottomLabel('Affected user: ' + Formatters.escapeHtml(target))
      .setWrapText(true));

    section.addWidget(CardService.newTextParagraph()
      .setText(Formatters.pluralize(ids.length, 'permission', 'permissions') + ' will be removed. Inherited or group-based access cannot be revoked here and will need manual review.'));

    card.addSection(section);

    card.setFixedFooter(CardService.newFixedFooter()
      .setPrimaryButton(CardService.newTextButton()
        .setText('Confirm revoke')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor(Formatters.COLORS.danger)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionExecuteRevoke')
          .setParameters({
            fileId: fileId,
            cleanupTarget: target,
            cleanupSelected: selectedCsv
          })))
      .setSecondaryButton(CardService.newTextButton()
        .setText('Cancel')
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionSwitchSection')
          .setParameters({ fileId: fileId, section: 'cleanup' }))));

    return card.build();
  }

  // ─── Execute revoke ────────────────────────────────────────────────────

  function executeRevoke(itemKeys, target) {
    const result = { ok: [], failed: [], skipped: [] };

    itemKeys.forEach(function (key) {
      const split = key.split(':');
      const fileId = split[0];
      const permissionId = split[1];
      if (!fileId || !permissionId) {
        result.skipped.push({ key: key, reason: 'malformed' });
        return;
      }
      try {
        DriveService.deletePermission(fileId, permissionId);
        result.ok.push({ fileId: fileId, permissionId: permissionId });
      } catch (e) {
        result.failed.push({
          fileId: fileId,
          permissionId: permissionId,
          message: e && e.message ? e.message : String(e)
        });
      }
    });

    return result;
  }

  // ─── Result report card ────────────────────────────────────────────────

  function buildResultReport(fileId, target, result) {
    const card = CardService.newCardBuilder()
      .setName('CleanupResult')
      .setHeader(CardService.newCardHeader()
        .setTitle('Cleanup complete')
        .setSubtitle(Formatters.escapeHtml(target)));

    const summary = CardService.newCardSection().setHeader('Summary');
    summary.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.CONFIRMATION_NUMBER_ICON))
      .setTopLabel('Revoked successfully')
      .setText('<b><font color="' + Formatters.COLORS.success + '">' + result.ok.length + '</font></b>'));
    summary.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.STAR))
      .setTopLabel('Failed')
      .setText('<b><font color="' + Formatters.COLORS.danger + '">' + result.failed.length + '</font></b>'));
    summary.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.DESCRIPTION))
      .setTopLabel('Need manual review')
      .setText(String(result.skipped.length))
      .setBottomLabel('Inherited or group-based access cannot be revoked from here.'));
    card.addSection(summary);

    if (result.failed.length > 0) {
      const fails = CardService.newCardSection().setHeader('Failures');
      result.failed.forEach(function (f) {
        fails.addWidget(CardService.newDecoratedText()
          .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.STAR))
          .setText(f.fileId)
          .setBottomLabel(f.message)
          .setWrapText(true));
      });
      card.addSection(fails);
    }

    card.setFixedFooter(CardService.newFixedFooter()
      .setPrimaryButton(CardService.newTextButton()
        .setText('Done')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor(Formatters.COLORS.brand)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionSwitchSection')
          .setParameters({ fileId: fileId, section: 'cleanup' }))));

    return card.build();
  }

  // ─── Search ────────────────────────────────────────────────────────────

  /**
   * Find files owned by the current user where the given user has a
   * non-owner permission. Returns:
   * [{ fileId, fileName, iconLink, permissionId, role, source }]
   */
  function findFilesAccessibleBy(target) {
    target = (target || '').toLowerCase().trim();
    if (!target) return [];

    const matches = [];
    let pageToken = null;
    let scanned = 0;

    do {
      let res;
      try { res = DriveService.listMyOwnedFiles(50, pageToken); }
      catch (e) { break; }

      const files = res.files || [];
      for (let i = 0; i < files.length && scanned < MAX_SEARCH_FILES; i++) {
        const f = files[i];
        scanned++;
        let perms;
        try { perms = DriveService.listPermissions(f.id); }
        catch (e) { continue; }

        perms.forEach(function (p) {
          if (p.deleted || p.role === 'owner') return;
          const candidate = (p.emailAddress || p.displayName || '').toLowerCase();
          if (candidate && candidate.indexOf(target) >= 0) {
            matches.push({
              fileId: f.id,
              fileName: f.name,
              iconLink: f.iconLink,
              permissionId: p.id,
              role: p.role,
              source: PermissionAnalyzer.classifySource(p)
            });
          }
        });
      }

      pageToken = res.nextPageToken;
    } while (pageToken && scanned < MAX_SEARCH_FILES);

    return matches;
  }

  return {
    addSections: addSections,
    buildFooter: buildFooter,
    buildConfirmRevokeCard: buildConfirmRevokeCard,
    executeRevoke: executeRevoke,
    buildResultReport: buildResultReport,
    findFilesAccessibleBy: findFilesAccessibleBy
  };
})();
