/**
 * CleanupCard.gs — Drive homepage: user-centric cleanup workflow.
 *
 * This module powers the DriveClarity homepage card (no file selected).
 * The flow is intentionally user-centric: the user is searched first, then
 * all permissions they have on files owned by the current user are listed
 * and can be bulk-revoked.
 *
 * Public API:
 *   - addHomepageHeroSections(builder)          : "How it works" hero
 *   - addBulkCleanupSections(builder, state)    : bulk page (search + results)
 *   - buildHomepageFooter()                     : homepage CTA → bulk page
 *   - buildBulkCleanupFooter(state)             : conditional revoke footer
 *   - buildConfirmRevokeCard(target, ids)       : pushed confirmation card
 *   - executeRevoke(ids, target)                : performs Permissions.delete
 *   - buildResultReport(target, result)         : pushed result summary
 *   - findFilesAccessibleBy(target)             : Drive scan by email/name
 *
 * Search strategy:
 *   We list files owned by the current user (Drive doesn't expose a "all
 *   files where X has access" query for non-admin contexts) and inspect
 *   each file's permissions to find the target email. This covers the
 *   most common offboarding scenario where the manager owns the files.
 */

const CleanupCard = (function () {

  // When the input is an email, we hit the Drive search API directly with
  // `'EMAIL' in writers/readers` and only paginate the matching files. This
  // is dramatically faster than scanning every owned file. We still cap the
  // result count to keep the trigger under the 30s Apps Script budget.
  const FAST_PATH_CAP = 250;

  // Name-based scan fallback (when the user types a partial name instead of
  // an email). Drive offers no native query for non-email name matching, so
  // we have to scan owned files and inspect permissions client-side.
  const NAME_SCAN_CAP = 500;

  // ─── Homepage hero (explanations only) ─────────────────────────────────
  //
  // The Drive homepage's single mission is to teach the user how the
  // tool works. The bulk-cleanup workflow is a distinct page reached
  // via the fixed-footer CTA — keeping the two flows physically and
  // mentally separated (Canva-style navigation pattern).

  function addHomepageHeroSections(builder) {
    const main = CardService.newCardSection();
    appendHowItWorks(main);
    appendSpacer(main);
    main.addWidget(CardService.newDivider());
    appendSpacer(main);
    appendBulkCleanupHint(main);
    builder.addSection(main);
  }

  function appendHowItWorks(section) {
    section.addWidget(title('How DriveClarity works'));

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage()
        .setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/folder_open_grey600_24dp.png'))
      .setTopLabel('Step 1')
      .setText('<b>Select a file or folder in Drive</b>')
      .setBottomLabel('DriveClarity opens automatically in this side panel and shows everyone who has access — direct, group and inherited.')
      .setWrapText(true));

    appendSpacer(section);

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage()
        .setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/visibility_grey600_24dp.png'))
      .setTopLabel('Step 2')
      .setText('<b>Audit sharing risks</b>')
      .setBottomLabel('Spot public links, external collaborators and unexpected access in one glance.')
      .setWrapText(true));
  }

  // Hint above the homepage CTA — explains where the footer button
  // leads so the action below feels grounded, not orphaned.
  function appendBulkCleanupHint(section) {
    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage()
        .setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/manage_accounts_grey600_24dp.png'))
      .setTopLabel('Offboarding a teammate?')
      .setText('<b>Bulk cleanup</b>')
      .setBottomLabel('Search a person and revoke their access to every file across your Drive in one click — use the button below.')
      .setWrapText(true));
  }

  // ─── Bulk cleanup page (pushed) ────────────────────────────────────────
  //
  // Search field + results live on this dedicated card, reached via
  // the homepage CTA or the file-context "Manage user access" link.

  function addBulkCleanupSections(builder, state) {
    state = state || {};
    const main = CardService.newCardSection();

    appendSearch(main, state);

    if (state.cleanupTarget) {
      const matches = findFilesAccessibleBy(state.cleanupTarget);
      appendSpacer(main);
      appendResultsSummary(main, state.cleanupTarget, matches);

      if (matches.length > 0) {
        appendSpacer(main);
        appendResultsList(main, state, matches);
      }
    } else {
      appendSpacer(main);
      main.addWidget(CardService.newTextParagraph()
        .setText(muted('Group and inherited access cannot be revoked here — those need manual review.')));
    }

    builder.addSection(main);
  }

  // ─── Search ────────────────────────────────────────────────────────────

  function appendSearch(section, state) {
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
        .setFunctionName('actionRunCleanupSearch')));
  }

  // ─── Results summary ───────────────────────────────────────────────────

  function appendResultsSummary(section, target, matches) {
    if (matches.length === 0) {
      section.addWidget(CardService.newDecoratedText()
        .setStartIcon(buildPersonAvatar(null))
        .setText('<b>' + Formatters.escapeHtml(target) + '</b>')
        .setBottomLabel('No matching access found in your files.')
        .setWrapText(true));
      return;
    }

    const direct    = matches.filter(function (m) { return m.source === 'direct'; }).length;
    const group     = matches.filter(function (m) { return m.source === 'group'; }).length;
    const inherited = matches.filter(function (m) { return m.source === 'inherited'; }).length;

    // Use the photoLink from any matching permission (they describe the
    // same Google account so the avatar will be identical across rows).
    const sample = matches.find(function (m) { return m.photoLink; }) || matches[0];
    const headline = sample.displayName
      ? Formatters.escapeHtml(sample.displayName) + '<br><font color="' + Formatters.COLORS.muted + '">' + Formatters.escapeHtml(target) + '</font>'
      : Formatters.escapeHtml(target);

    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(buildPersonAvatar(sample.photoLink))
      .setText('<b>' + headline + '</b>')
      .setBottomLabel(Formatters.pluralize(matches.length, 'item', 'items')
                    + ' · ' + direct + ' direct · ' + group + ' group · ' + inherited + ' inherited')
      .setWrapText(true));

    section.addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Select all')
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionSelectAllCleanup')
          .setParameters({
            cleanupTarget: target,
            allItems: matches.map(function (m) { return m.fileId + ':' + m.permissionId; }).join(',')
          })))
      .addButton(CardService.newTextButton()
        .setText('Clear')
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionClearCleanupSelection')
          .setParameters({ cleanupTarget: target }))));
  }

  // ─── Results list ──────────────────────────────────────────────────────

  function appendResultsList(section, state, matches) {
    section.addWidget(title('Items with access'));

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
            itemId: itemKey,
            cleanupTarget: state.cleanupTarget,
            selected: state.cleanupSelected || ''
          }));

      section.addWidget(CardService.newDecoratedText()
        .setStartIcon(CardService.newIconImage().setIconUrl(m.iconLink || 'https://www.gstatic.com/images/icons/material/system/2x/insert_drive_file_grey600_24dp.png'))
        .setText('<b>' + Formatters.escapeHtml(m.fileName) + '</b>')
        .setBottomLabel(Formatters.roleLabel(m.role) + ' · ' + Formatters.accessSourceLabel(m.source))
        .setSwitchControl(checkbox)
        .setWrapText(true));
    });
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

  /**
   * Circular avatar from a Drive permission photoLink, or a generic
   * person icon when the user has no profile photo.
   */
  function buildPersonAvatar(photoLink) {
    if (photoLink) {
      return CardService.newIconImage()
        .setIconUrl(photoLink)
        .setImageCropType(CardService.ImageCropType.CIRCLE);
    }
    return CardService.newIconImage().setIcon(CardService.Icon.PERSON);
  }

  // ─── Footers ───────────────────────────────────────────────────────────

  /**
   * Homepage CTA — opens the dedicated bulk-cleanup page.
   * Always present so the secondary workflow is one tap away.
   */
  function buildHomepageFooter() {
    return CardService.newFixedFooter()
      .setPrimaryButton(CardService.newTextButton()
        .setText('Revoke a person from all files')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor(Formatters.COLORS.brand)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionOpenBulkCleanup')));
  }

  /**
   * Bulk page footer — only shown once the user has selected matching
   * items to revoke. The "Clear" affordance lives in the results
   * header to avoid duplicating it here. Back navigation is handled
   * by Drive's system back arrow.
   */
  function buildBulkCleanupFooter(state) {
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
            cleanupTarget: state.cleanupTarget,
            cleanupSelected: state.cleanupSelected
          })));
  }

  // ─── Confirmation card (pushed) ────────────────────────────────────────

  function buildConfirmRevokeCard(target, selectedCsv) {
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
            cleanupTarget: target,
            cleanupSelected: selectedCsv
          })))
      .setSecondaryButton(CardService.newTextButton()
        .setText('Cancel')
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('actionPopCard'))));

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
        try { console.error('Revoke failed', fileId, permissionId, e && e.message); } catch (_) {}
        result.failed.push({
          fileId: fileId,
          permissionId: permissionId,
          message: Formatters.friendlyError(e)
        });
      }
    });

    return result;
  }

  // ─── Result report card (pushed) ───────────────────────────────────────

  function buildResultReport(target, result) {
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
      const fails = CardService.newCardSection().setHeader("Items that couldn't be revoked");
      result.failed.forEach(function (f) {
        let displayName = 'Item';
        try {
          const file = DriveService.getFile(f.fileId);
          if (file && file.name) displayName = file.name;
        } catch (_) {}

        fails.addWidget(CardService.newDecoratedText()
          .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.STAR))
          .setText(Formatters.escapeHtml(displayName))
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
          .setFunctionName('actionOpenHomepage'))));

    return card.build();
  }

  // ─── Search engine ─────────────────────────────────────────────────────

  /**
   * Find files where the given user has a non-owner permission.
   *
   * Two paths:
   *  - Fast path (email input): Drive native query `'EMAIL' in writers/readers`,
   *    no full-corpus scan, scoped to files where I have at least writer
   *    access (so I can revoke them).
   *  - Slow path (name input): scan owned files and match by displayName/email
   *    in each permissions list (no native Drive query exists for partial
   *    names).
   *
   * Returns: [{ fileId, fileName, iconLink, permissionId, role, source }]
   */
  function findFilesAccessibleBy(target) {
    target = (target || '').trim();
    if (!target) return [];

    if (looksLikeEmail(target)) {
      return findByEmail(target.toLowerCase());
    }
    return findByNameScan(target.toLowerCase());
  }

  function looksLikeEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  /**
   * Fast path: ask Drive to return only files where this email is a direct
   * writer or reader, then look up the permission ID per match.
   *
   * Drive's native query expands group membership for `'EMAIL' in writers`,
   * but we then filter on `permission.emailAddress === email` to keep only
   * direct user permissions (the only ones we can revoke at the file level).
   */
  function findByEmail(email) {
    const matches = [];
    const safeEmail = email.replace(/'/g, "\\'");
    const q = "('" + safeEmail + "' in writers or '" + safeEmail + "' in readers) and trashed = false";

    let pageToken = null;
    let safety = 0;
    let processed = 0;

    do {
      let res;
      try {
        res = Drive.Files.list({
          q: q,
          fields: 'files(id,name,iconLink,driveId),nextPageToken',
          pageSize: 100,
          pageToken: pageToken || undefined,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          corpora: 'allDrives'
        });
      } catch (e) {
        break;
      }

      const files = res.files || [];
      for (let i = 0; i < files.length && processed < FAST_PATH_CAP; i++) {
        const f = files[i];
        processed++;

        let perms;
        try { perms = DriveService.listPermissions(f.id); }
        catch (e) { continue; }

        perms.forEach(function (p) {
          if (p.deleted || p.role === 'owner') return;
          if ((p.emailAddress || '').toLowerCase() === email) {
            matches.push({
              fileId: f.id,
              fileName: f.name,
              iconLink: f.iconLink,
              permissionId: p.id,
              role: p.role,
              source: PermissionAnalyzer.classifySource(p),
              displayName: p.displayName || '',
              photoLink: p.photoLink || ''
            });
          }
        });
      }

      pageToken = res.nextPageToken;
      safety++;
    } while (pageToken && safety < 10 && processed < FAST_PATH_CAP);

    return matches;
  }

  /**
   * Slow path: for partial-name searches, scan files we own and match
   * displayName / emailAddress on each permission.
   */
  function findByNameScan(needle) {
    const matches = [];
    let pageToken = null;
    let scanned = 0;

    do {
      let res;
      try { res = DriveService.listMyOwnedFiles(100, pageToken); }
      catch (e) { break; }

      const files = res.files || [];
      for (let i = 0; i < files.length && scanned < NAME_SCAN_CAP; i++) {
        const f = files[i];
        scanned++;
        let perms;
        try { perms = DriveService.listPermissions(f.id); }
        catch (e) { continue; }

        perms.forEach(function (p) {
          if (p.deleted || p.role === 'owner') return;
          const candidate = ((p.emailAddress || '') + ' ' + (p.displayName || '')).toLowerCase();
          if (candidate && candidate.indexOf(needle) >= 0) {
            matches.push({
              fileId: f.id,
              fileName: f.name,
              iconLink: f.iconLink,
              permissionId: p.id,
              role: p.role,
              source: PermissionAnalyzer.classifySource(p),
              displayName: p.displayName || '',
              photoLink: p.photoLink || ''
            });
          }
        });
      }

      pageToken = res.nextPageToken;
    } while (pageToken && scanned < NAME_SCAN_CAP);

    return matches;
  }

  return {
    addHomepageHeroSections: addHomepageHeroSections,
    addBulkCleanupSections: addBulkCleanupSections,
    buildHomepageFooter: buildHomepageFooter,
    buildBulkCleanupFooter: buildBulkCleanupFooter,
    buildConfirmRevokeCard: buildConfirmRevokeCard,
    executeRevoke: executeRevoke,
    buildResultReport: buildResultReport,
    findFilesAccessibleBy: findFilesAccessibleBy
  };
})();
