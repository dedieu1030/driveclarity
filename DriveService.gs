/**
 * DriveService.gs — Thin wrappers over the advanced Drive API v3.
 *
 * All Drive HTTP calls go through this module so that:
 *   - Field selection is consistent (and minimal)
 *   - Shared Drive support (`supportsAllDrives`) is always passed
 *   - Pagination is handled uniformly
 *   - Errors are normalized for the card layer
 *
 * Requires the advanced "Drive" service enabled in appsscript.json.
 */

const DriveService = (function () {

  const FILE_FIELDS = [
    'id',
    'name',
    'mimeType',
    'iconLink',
    'webViewLink',
    'owners(emailAddress,displayName,photoLink)',
    'parents',
    'driveId',
    'shared',
    'sharedWithMeTime',
    'modifiedTime',
    'size',
    'capabilities(canShare,canEdit)',
    'permissionIds',
    'trashed'
  ].join(',');

  const PERMISSION_FIELDS = [
    'permissions(',
      'id,type,role,emailAddress,displayName,domain,photoLink,deleted,',
      'allowFileDiscovery,pendingOwner,',
      'permissionDetails(permissionType,role,inheritedFrom,inherited)',
    '),nextPageToken'
  ].join('');

  // ─── Files ──────────────────────────────────────────────────────────────

  function getFile(fileId) {
    return Drive.Files.get(fileId, {
      fields: FILE_FIELDS,
      supportsAllDrives: true
    });
  }

  function listChildren(parentId, pageSize) {
    pageSize = pageSize || 25;
    const res = Drive.Files.list({
      q: "'" + parentId + "' in parents and trashed = false",
      fields: 'files(' + FILE_FIELDS + '),nextPageToken',
      pageSize: pageSize,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: 'allDrives'
    });
    return res.files || [];
  }

  /**
   * List files owned by the current user (used by Cleanup section).
   */
  function listMyOwnedFiles(pageSize, pageToken) {
    pageSize = pageSize || 100;
    return Drive.Files.list({
      q: "'me' in owners and trashed = false",
      fields: 'files(' + FILE_FIELDS + '),nextPageToken',
      pageSize: pageSize,
      pageToken: pageToken || null,
      supportsAllDrives: true
    });
  }

  // ─── Permissions ────────────────────────────────────────────────────────

  /**
   * List ALL permissions on a file, paginating until exhausted.
   * Includes inherited permissions when applicable to Shared Drives.
   */
  function listPermissions(fileId) {
    const all = [];
    let pageToken = null;
    let safety = 0;
    do {
      const page = Drive.Permissions.list(fileId, {
        fields: PERMISSION_FIELDS,
        supportsAllDrives: true,
        useDomainAdminAccess: false,
        includePermissionsForView: 'published',
        pageSize: 100,
        pageToken: pageToken || undefined
      });
      (page.permissions || []).forEach(function (p) { all.push(p); });
      pageToken = page.nextPageToken;
      safety++;
    } while (pageToken && safety < 10);
    return all;
  }

  function deletePermission(fileId, permissionId) {
    return Drive.Permissions.remove(fileId, permissionId, {
      supportsAllDrives: true
    });
  }

  // ─── Shared drives ──────────────────────────────────────────────────────

  function getSharedDrive(driveId) {
    if (!driveId) return null;
    try {
      return Drive.Drives.get(driveId, {
        fields: 'id,name,restrictions,createdTime,capabilities'
      });
    } catch (e) {
      return null;
    }
  }

  // ─── Identity ───────────────────────────────────────────────────────────

  function getCurrentUserEmail() {
    try {
      return Session.getActiveUser().getEmail() || '';
    } catch (e) {
      return '';
    }
  }

  function getCurrentUserDomain() {
    const email = getCurrentUserEmail();
    const at = email.indexOf('@');
    return at >= 0 ? email.substring(at + 1) : '';
  }

  return {
    FILE_FIELDS: FILE_FIELDS,
    getFile: getFile,
    listChildren: listChildren,
    listMyOwnedFiles: listMyOwnedFiles,
    listPermissions: listPermissions,
    deletePermission: deletePermission,
    getSharedDrive: getSharedDrive,
    getCurrentUserEmail: getCurrentUserEmail,
    getCurrentUserDomain: getCurrentUserDomain
  };
})();
