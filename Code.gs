/**
 * DriveClarity — entry triggers and global action callbacks.
 *
 * Architecture:
 *   - Drive homepage (no file selected) → Cards.buildHomepageCard (user-search + bulk revoke)
 *   - Drive contextual (file selected)  → Cards.buildMainCard with Access + Audit tabs
 */

// ─── Manifest triggers ──────────────────────────────────────────────────────

function onHomepage(e) {
  return Cards.buildHomepageCard({});
}

function onDriveHomepage(e) {
  return Cards.buildHomepageCard({});
}

function onItemsSelected(e) {
  try {
    const items = (e && e.drive && e.drive.selectedItems) || [];
    if (items.length === 0) {
      return Cards.buildHomepageCard({});
    }
    const fileId = items[0].id;
    return Cards.buildMainCard(fileId, 'access');
  } catch (err) {
    return Cards.buildErrorCard(err);
  }
}

// ─── Action callbacks ───────────────────────────────────────────────────────

/**
 * Switch tabs inside the file-context card (Access ↔ Audit).
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
 * Push the "Why they have access" explanation card. The Drive system
 * back arrow returns the user to the file's Access view.
 */
function actionShowExplanations(e) {
  const params = (e && e.commonEventObject && e.commonEventObject.parameters) || {};
  const card = AccessCard.buildExplanationCard(params.fileId);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
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
        .setText(Formatters.friendlyError(err)))
      .build();
  }
}

// ─── Homepage / Cleanup callbacks ──────────────────────────────────────────

/**
 * Collapse the card stack back to whatever the root was (homepage if
 * the user entered from the Drive sidebar, file-context card if they
 * entered from a selected file). Used by the "Done" button at the end
 * of the bulk-cleanup workflow.
 */
function actionOpenHomepage(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot())
    .build();
}

/**
 * Pop one card from the stack (used by Cancel buttons inside pushed
 * sub-cards like the confirm-revoke screen).
 */
function actionPopCard(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popCard())
    .build();
}

/**
 * Push the dedicated bulk-cleanup card (search + revoke a single user
 * from many files). Reachable from the homepage CTA and from the
 * "Manage user access" link inside file-context cards.
 */
function actionOpenBulkCleanup(e) {
  const card = Cards.buildBulkCleanupCard({});
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

/**
 * Run the bulk-cleanup user search (called from the bulk card).
 */
function actionRunCleanupSearch(e) {
  const formInputs = (e.commonEventObject && e.commonEventObject.formInputs) || {};
  const target = (formInputs.cleanup_search && formInputs.cleanup_search.stringInputs.value[0]) || '';
  const card = Cards.buildBulkCleanupCard({ cleanupTarget: target.trim() });
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

/**
 * Toggle a single item in the bulk-cleanup selection set.
 */
function actionToggleCleanupItem(e) {
  const params = e.commonEventObject.parameters || {};
  const cleanupTarget = params.cleanupTarget || '';
  const selected = new Set((params.selected || '').split(',').filter(Boolean));
  const itemId = params.itemId;
  if (selected.has(itemId)) {
    selected.delete(itemId);
  } else {
    selected.add(itemId);
  }
  const card = Cards.buildBulkCleanupCard({
    cleanupTarget: cleanupTarget,
    cleanupSelected: Array.from(selected).join(',')
  });
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

/**
 * Select all items currently in the result list.
 */
function actionSelectAllCleanup(e) {
  const params = e.commonEventObject.parameters || {};
  const card = Cards.buildBulkCleanupCard({
    cleanupTarget: params.cleanupTarget || '',
    cleanupSelected: params.allItems || ''
  });
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

/**
 * Clear the entire bulk-cleanup selection set.
 */
function actionClearCleanupSelection(e) {
  const params = e.commonEventObject.parameters || {};
  const card = Cards.buildBulkCleanupCard({
    cleanupTarget: params.cleanupTarget || '',
    cleanupSelected: ''
  });
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

/**
 * Push the irreversible-action confirmation card.
 */
function actionConfirmRevoke(e) {
  const params = e.commonEventObject.parameters || {};
  const card = CleanupCard.buildConfirmRevokeCard(params.cleanupTarget, params.cleanupSelected);
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
  const card = CleanupCard.buildResultReport(target, result);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}
