/**
 * DriveClarity — entry triggers and global action callbacks.
 *
 * This file is loaded first by Apps Script. Every function exposed here is
 * either a manifest trigger (declared in appsscript.json) or an action
 * callback referenced by name from a CardService Action.
 *
 * Keep this file minimal: real building logic lives in Cards.gs and the
 * section-specific *Card.gs files. Service layer lives in DriveService.gs
 * and PermissionAnalyzer.gs.
 */

// ─── Manifest triggers ──────────────────────────────────────────────────────

/**
 * Common homepage trigger.
 * Used as a fallback when the add-on is opened outside Drive (rare for this
 * product since we only declare the Drive surface).
 */
function onHomepage(e) {
  return Cards.buildEmptyStateCard('Open DriveClarity from inside Google Drive to inspect a file or folder.');
}

/**
 * Drive homepage trigger.
 * Fired when the user clicks the DriveClarity icon in the Drive side rail
 * with no file selected.
 */
function onDriveHomepage(e) {
  return Cards.buildEmptyStateCard('Select a file or folder in Drive to see who can access it.');
}

/**
 * Drive contextual trigger.
 * Fired when the user has one or more items selected in Drive and clicks
 * the DriveClarity icon (or selects items while DriveClarity is open).
 */
function onItemsSelected(e) {
  try {
    const items = (e && e.drive && e.drive.selectedItems) || [];
    if (items.length === 0) {
      return Cards.buildEmptyStateCard('Select a file or folder in Drive to see who can access it.');
    }
    const fileId = items[0].id;
    return Cards.buildMainCard(fileId, 'access');
  } catch (err) {
    return Cards.buildErrorCard(err);
  }
}

// ─── Action callbacks (referenced by name from CardService Actions) ──────────

/**
 * Switch the active section (Access / Audit / Cleanup) without leaving the
 * card. Uses Navigation.updateCard for an in-place rebuild — feels like
 * tab switching to the user.
 */
function actionSwitchSection(e) {
  const params = e.commonEventObject.parameters || {};
  const fileId = params.fileId;
  const section = params.section || 'access';
  const card = Cards.buildMainCard(fileId, section);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

/**
 * Toggle a collapsible "Why they have access" explanation row.
 * State is encoded in action parameters since CardService is stateless.
 */
function actionToggleExplanation(e) {
  const params = e.commonEventObject.parameters || {};
  const fileId = params.fileId;
  const expandedId = params.expandedId || '';
  const card = Cards.buildMainCard(fileId, 'access', { expandedExplanation: expandedId });
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

/**
 * Toggle an Audit filter pill.
 */
function actionToggleAuditFilter(e) {
  const params = e.commonEventObject.parameters || {};
  const fileId = params.fileId;
  const current = (params.activeFilters || '').split(',').filter(Boolean);
  const filter = params.filter;
  const idx = current.indexOf(filter);
  if (idx === -1) {
    current.push(filter);
  } else {
    current.splice(idx, 1);
  }
  const card = Cards.buildMainCard(fileId, 'audit', { activeFilters: current.join(',') });
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

/**
 * Push the investigation detail card for a single file.
 */
function actionOpenInvestigation(e) {
  const params = e.commonEventObject.parameters || {};
  const detailCard = AuditCard.buildInvestigationDetail(params.fileId, params.targetFileId);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(detailCard))
    .build();
}

/**
 * Run the Cleanup search for a given email and rebuild the section.
 */
function actionRunCleanupSearch(e) {
  const formInputs = (e.commonEventObject && e.commonEventObject.formInputs) || {};
  const params = e.commonEventObject.parameters || {};
  const fileId = params.fileId;
  const target = (formInputs.cleanup_search && formInputs.cleanup_search.stringInputs.value[0]) || '';
  const card = Cards.buildMainCard(fileId, 'cleanup', { cleanupTarget: target.trim() });
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

/**
 * Toggle a single item in the Cleanup selection set.
 */
function actionToggleCleanupItem(e) {
  const params = e.commonEventObject.parameters || {};
  const fileId = params.fileId;
  const cleanupTarget = params.cleanupTarget || '';
  const selected = new Set((params.selected || '').split(',').filter(Boolean));
  const itemId = params.itemId;
  if (selected.has(itemId)) {
    selected.delete(itemId);
  } else {
    selected.add(itemId);
  }
  const card = Cards.buildMainCard(fileId, 'cleanup', {
    cleanupTarget: cleanupTarget,
    cleanupSelected: Array.from(selected).join(',')
  });
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

/**
 * Clear the entire Cleanup selection set.
 */
function actionClearCleanupSelection(e) {
  const params = e.commonEventObject.parameters || {};
  const card = Cards.buildMainCard(params.fileId, 'cleanup', {
    cleanupTarget: params.cleanupTarget || '',
    cleanupSelected: ''
  });
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

/**
 * Push the irreversible-action confirmation card before bulk revoke.
 */
function actionConfirmRevoke(e) {
  const params = e.commonEventObject.parameters || {};
  const card = CleanupCard.buildConfirmRevokeCard(
    params.fileId,
    params.cleanupTarget,
    params.cleanupSelected
  );
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

/**
 * Execute the bulk revoke and show the result report card.
 */
function actionExecuteRevoke(e) {
  const params = e.commonEventObject.parameters || {};
  const ids = (params.cleanupSelected || '').split(',').filter(Boolean);
  const target = params.cleanupTarget;
  const result = CleanupCard.executeRevoke(ids, target);
  const card = CleanupCard.buildResultReport(params.fileId, target, result);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

/**
 * Trigger an Audit CSV export to the user's Drive root.
 */
function actionExportAuditCsv(e) {
  const params = e.commonEventObject.parameters || {};
  const fileId = params.fileId;
  try {
    const url = AuditCard.exportCsv(fileId);
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
        .setText('Audit exported to your Drive.'))
      .setOpenLink(CardService.newOpenLink().setUrl(url))
      .build();
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
        .setText('Export failed: ' + err.message))
      .build();
  }
}
