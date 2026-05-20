/**
 * Access Audit & Revoke for Drive — entry triggers and global action callbacks.
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
    // Quota gate: free users get 10 audits per month.
    if (!Subscription.isActive()) {
      if (!QuotaService.canAccessFreeFeature()) {
        return PaywallCard.build(false, 'limit');
      }
      // We consume the credit now because we are about to build the card.
      QuotaService.consumeCredit();
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
  if (!Subscription.isActive()) {
    if (!QuotaService.canAccessFreeFeature()) {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().pushCard(PaywallCard.build(false, 'limit')))
        .build();
    }
    QuotaService.consumeCredit();
  }
  const params = (e && e.commonEventObject && e.commonEventObject.parameters) || {};
  const card = AccessCard.buildExplanationCard(params.fileId);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

/**
 * Push the per-row revoke confirmation card. Only triggered when the
 * row is clickable (PermissionAnalyzer.canRevokePermission gated it
 * upstream).
 */
function actionOpenRevokeRow(e) {
  if (!Subscription.isActive()) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(PaywallCard.build(false, 'feature')))
      .build();
  }
  const params = (e && e.commonEventObject && e.commonEventObject.parameters) || {};
  const card = AccessCard.buildRevokeRowCard(params.fileId, params.permissionId);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

/**
 * Execute a single-row revoke from the confirmation card.
 */
function actionExecuteRevokeRow(e) {
  if (!Subscription.isActive()) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(PaywallCard.build(false, 'feature')))
      .build();
  }
  const params = (e && e.commonEventObject && e.commonEventObject.parameters) || {};
  const fileId = params.fileId;
  const permissionId = params.permissionId;
  try {
    DriveService.deletePermission(fileId, permissionId);
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
        .setText(Formatters.friendlyError(err)))
      .build();
  }
  const refreshed = Cards.buildMainCard(fileId, 'access');
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Access removed.'))
    .setNavigation(CardService.newNavigation().popCard().updateCard(refreshed))
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
  if (!Subscription.isActive()) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(PaywallCard.build(false, 'feature')))
      .build();
  }
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

function actionOpenHomepage(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot())
    .build();
}

function actionPopCard(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popCard())
    .build();
}

function actionOpenBulkCleanup(e) {
  if (!Subscription.isActive()) {
    if (!QuotaService.canAccessFreeFeature()) {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().pushCard(PaywallCard.build(false, 'limit')))
        .build();
    }
    QuotaService.consumeCredit();
  }
  const card = Cards.buildBulkCleanupCard({});
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

function actionRefreshSubscription(e) {
  Subscription.invalidateCache();
  const subscribed = Subscription.isActive();
  if (subscribed) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popCard())
      .setNotification(CardService.newNotification().setText('Subscription active. Enjoy Pro access!'))
      .build();
  }
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(PaywallCard.build(false)))
    .setNotification(CardService.newNotification().setText('No active subscription found.'))
    .build();
}

function actionOpenSubscription(e) {
  const subscribed = Subscription.isActive();
  const card = PaywallCard.build(subscribed);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

function actionRunCleanupSearch(e) {
  if (!Subscription.isActive()) {
    if (!QuotaService.canAccessFreeFeature()) {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().pushCard(PaywallCard.build(false, 'limit')))
        .build();
    }
    QuotaService.consumeCredit();
  }
  const formInputs = (e.commonEventObject && e.commonEventObject.formInputs) || {};
  const target = (formInputs.cleanup_search && formInputs.cleanup_search.stringInputs.value[0]) || '';
  const card = Cards.buildBulkCleanupCard({ cleanupTarget: target.trim() });
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

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

function actionConfirmRevoke(e) {
  if (!Subscription.isActive()) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(PaywallCard.build(false, 'feature')))
      .build();
  }
  const params = e.commonEventObject.parameters || {};
  const card = CleanupCard.buildConfirmRevokeCard(params.cleanupTarget, params.cleanupSelected);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

function actionExecuteRevoke(e) {
  if (!Subscription.isActive()) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(PaywallCard.build(false, 'feature')))
      .build();
  }
  const params = e.commonEventObject.parameters || {};
  const ids = (params.cleanupSelected || '').split(',').filter(Boolean);
  const target = params.cleanupTarget;
  const result = CleanupCard.executeRevoke(ids, target);
  const card = CleanupCard.buildResultReport(target, result);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}
