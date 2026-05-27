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

  // ==========================================================================
  // MODE DÉMO / PRÉSENTATION
  // Activez (true) pour générer des données fictives complètes et premium
  // pour vos captures d'écran Marketplace. Repassez à false pour l'usage réel.
  // ==========================================================================
  const DEMO_MODE = false;

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
    if (DEMO_MODE) {
      if (fileId === 'mock_folder_1') {
        return {
          id: 'mock_folder_1',
          name: 'Audits',
          mimeType: 'application/vnd.google-apps.folder',
          webViewLink: 'https://drive.google.com/',
          parents: ['mock_folder_2'],
          capabilities: { canShare: true, canEdit: true }
        };
      }
      if (fileId === 'mock_folder_2') {
        return {
          id: 'mock_folder_2',
          name: 'Stratégie',
          mimeType: 'application/vnd.google-apps.folder',
          webViewLink: 'https://drive.google.com/',
          parents: [],
          capabilities: { canShare: true, canEdit: true }
        };
      }

      // Pour le fichier principal, on tente de récupérer le vrai pour avoir son
      // icône native exacte, mais on surcharge toutes ses métadonnées de présentation.
      let realFile;
      try {
        realFile = Drive.Files.get(fileId, { fields: FILE_FIELDS, supportsAllDrives: true });
      } catch (e) {
        realFile = {
          id: fileId,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          iconLink: 'https://www.gstatic.com/images/icons/material/system/2x/insert_drive_file_grey600_24dp.png'
        };
      }
      realFile.name = 'Q3 Budget.xlsx';
      realFile.parents = ['mock_folder_1'];
      realFile.owners = [{
        emailAddress: 'sarah.jenkins@acme-corp.com',
        displayName: 'Sarah Jenkins',
        photoLink: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=128&h=128&auto=format&fit=crop&q=80'
      }];
      realFile.capabilities = { canShare: true, canEdit: true };
      return realFile;
    }

    return Drive.Files.get(fileId, {
      fields: FILE_FIELDS,
      supportsAllDrives: true
    });
  }

  function listChildren(parentId, pageSize, pageToken) {
    if (DEMO_MODE) return { files: [], nextPageToken: null };
    pageSize = pageSize || 25;
    const res = Drive.Files.list({
      q: "'" + parentId + "' in parents and trashed = false",
      fields: 'files(' + FILE_FIELDS + '),nextPageToken',
      pageSize: pageSize,
      pageToken: pageToken || undefined,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: 'allDrives'
    });
    return {
      files: res.files || [],
      nextPageToken: res.nextPageToken || null
    };
  }

  function listMyOwnedFiles(pageSize, pageToken) {
    if (DEMO_MODE) return [];
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

  function listPermissions(fileId) {
    if (DEMO_MODE) {
      if (fileId === 'mock_folder_1' || fileId === 'mock_folder_2') return [];
      
      return [
        {
          id: 'perm_1',
          type: 'user',
          role: 'owner',
          emailAddress: 'sarah.jenkins@acme-corp.com',
          displayName: 'Sarah Jenkins',
          photoLink: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=128&h=128&auto=format&fit=crop&q=80',
          deleted: false,
          permissionDetails: [{ inherited: false }]
        },
        {
          id: 'perm_2',
          type: 'user',
          role: 'writer',
          emailAddress: 'arivera@external-agency.io',
          displayName: 'Alex Rivera',
          photoLink: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=128&h=128&auto=format&fit=crop&q=80',
          deleted: false,
          permissionDetails: [{ inherited: false }]
        },
        {
          id: 'perm_3',
          type: 'user',
          role: 'writer',
          emailAddress: 'david.kim@acme-corp.com',
          displayName: 'David Kim',
          photoLink: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=128&h=128&auto=format&fit=crop&q=80',
          deleted: false,
          permissionDetails: [{ inherited: false }]
        },
        {
          id: 'perm_4',
          type: 'user',
          role: 'commenter',
          emailAddress: 'elena.rostova@acme-corp.com',
          displayName: 'Elena Rostova',
          photoLink: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&auto=format&fit=crop&q=80',
          deleted: false,
          permissionDetails: [{ inherited: true, inheritedFrom: 'mock_folder_1' }]
        },
        {
          id: 'perm_5',
          type: 'user',
          role: 'reader',
          emailAddress: 'marc.dubois@acme-corp.com',
          displayName: 'Marc Dubois',
          photoLink: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=128&h=128&auto=format&fit=crop&q=80',
          deleted: false,
          permissionDetails: [{ inherited: false }]
        }
      ];
    }

    const all = [];
    let pageToken = null;
    let safety = 0;
    do {
      const page = Drive.Permissions.list(fileId, {
        fields: PERMISSION_FIELDS,
        supportsAllDrives: true,
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
    if (DEMO_MODE) return;
    return Drive.Permissions.remove(fileId, permissionId, {
      supportsAllDrives: true
    });
  }

  // ─── Shared drives ──────────────────────────────────────────────────────

  function getSharedDrive(driveId) {
    if (DEMO_MODE) return null;
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
    if (DEMO_MODE) return 'acme-corp.com';
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
    getCurrentUserDomain: getCurrentUserDomain,
    isDemoMode: function () { return DEMO_MODE; }
  };
})();
