/**
 * Formatters.gs — UI helpers, constants, and label translations.
 *
 * Centralises all human-readable strings so we can localize later without
 * touching card builders. Also owns the colour palette used by buttons and
 * decorated text accents.
 */

const Formatters = (function () {

  // ─── Brand palette ─────────────────────────────────────────────────────
  //
  // Designed for a permissions / trust tool. Anchored on a deep teal-navy
  // (#1B4965) — the same family as Stripe, Okta, Vanta — to convey calm
  // authority and security without the alarm-red of typical security UIs.
  // Accent shades stay soft (cyan / cool greys) to avoid visual fatigue
  // during long permission audits.

  const COLORS = {
    brand:    '#1B4965',  // deep teal-navy, primary actions + brand
    accent:   '#5FA8D3',  // soft cyan, secondary highlights
    trust:    '#62B6CB',  // calm cyan, info accents

    // Visibility (semantic, calmed)
    private:  '#6B7280',  // neutral grey
    internal: '#1B4965',  // matches brand
    external: '#C77D2C',  // warm amber (caution, not alarm)
    public:   '#B83C3C',  // deep red (serious, not aggressive)

    // Status
    success:  '#2D8F66',  // calm forest
    warning:  '#C77D2C',
    danger:   '#B83C3C',

    // Text
    text:     '#0F1F2C',  // very deep navy (titles)
    subtle:   '#4A5563',  // body grey-blue
    muted:    '#94A3B8',  // cool grey for labels and secondary text

    // Surfaces
    border:   '#E5E9EE'
  };

  // ─── Visibility ─────────────────────────────────────────────────────────

  function visibilityLabel(visibility) {
    switch (visibility) {
      case 'public':   return 'Public';
      case 'external': return 'External';
      case 'internal': return 'Internal';
      case 'private':  return 'Private';
      default:         return 'Private';
    }
  }

  /**
   * HTML-formatted visibility badge for use in DecoratedText / TextParagraph.
   * Renders as coloured bold text since CardService cannot render real pills.
   */
  function visibilityBadge(visibility) {
    const colour = COLORS[visibility] || COLORS.private;
    return '<b><font color="' + colour + '">' + visibilityLabel(visibility) + '</font></b>';
  }

  // ─── Roles ──────────────────────────────────────────────────────────────

  function roleLabel(role) {
    switch (role) {
      case 'owner':         return 'Owner';
      case 'organizer':     return 'Manager';
      case 'fileOrganizer': return 'Content manager';
      case 'writer':        return 'Editor';
      case 'commenter':     return 'Commenter';
      case 'reader':        return 'Viewer';
      default:              return role;
    }
  }

  function roleBadge(role) {
    const colour = role === 'owner' ? COLORS.brand : COLORS.subtle;
    return '<b><font color="' + colour + '">' + roleLabel(role) + '</font></b>';
  }

  // ─── Access source ──────────────────────────────────────────────────────

  function accessSourceLabel(source) {
    switch (source) {
      case 'direct':    return 'Direct access';
      case 'inherited': return 'Inherited access';
      case 'group':     return 'Group access';
      case 'domain':    return 'Domain access';
      case 'anyone':    return 'Public link';
      default:          return 'Unknown';
    }
  }

  // ─── File type ──────────────────────────────────────────────────────────

  function fileTypeLabel(file) {
    if (!file || !file.mimeType) return 'File';
    const map = {
      'application/vnd.google-apps.folder':       'Folder',
      'application/vnd.google-apps.document':     'Doc',
      'application/vnd.google-apps.spreadsheet':  'Sheet',
      'application/vnd.google-apps.presentation': 'Slides',
      'application/vnd.google-apps.form':         'Form',
      'application/vnd.google-apps.drawing':      'Drawing',
      'application/vnd.google-apps.shortcut':     'Shortcut',
      'application/pdf':                          'PDF',
      'image/png':                                'PNG',
      'image/jpeg':                               'JPEG',
      'video/mp4':                                'Video'
    };
    if (map[file.mimeType]) return map[file.mimeType];
    if (file.mimeType.indexOf('image/') === 0) return 'Image';
    if (file.mimeType.indexOf('video/') === 0) return 'Video';
    if (file.mimeType.indexOf('audio/') === 0) return 'Audio';
    return 'File';
  }

  // ─── Identity rendering ────────────────────────────────────────────────

  function displayPrincipal(permission) {
    if (permission.type === 'anyone') return 'Anyone with the link';
    if (permission.type === 'domain') return permission.domain || 'Your organization';
    return permission.displayName || permission.emailAddress || 'Unknown';
  }

  function principalSubtitle(permission) {
    if (permission.type === 'anyone') return 'Public link';
    if (permission.type === 'domain') return 'Domain access';
    if (permission.type === 'group')  return permission.emailAddress || '';
    return permission.emailAddress || '';
  }

  // ─── Misc ───────────────────────────────────────────────────────────────

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Translate an Apps Script / Drive API error into a calm, non-technical
   * message safe to display to end-users. The raw error stays in
   * Stackdriver via console.error for debugging.
   */
  function friendlyError(err) {
    const msg = (err && (err.message || err.toString())) || '';
    try { console.error('DriveClarity error:', msg); } catch (_) {}

    if (/sufficient permissions/i.test(msg))                   return "You don't have permission to view this item's sharing settings.";
    if (/insufficientFilePermissions/i.test(msg))              return "You don't have edit access to this item.";
    if (/cannotModifyInheritedTeamDrivePermission/i.test(msg)) return "Inherited permissions can't be removed here. Adjust the parent folder instead.";
    if (/notFound|File not found/i.test(msg))                  return "This item no longer exists or has been moved.";
    if (/sharingRateLimitExceeded/i.test(msg))                 return "Too many sharing changes at once. Please try again in a moment.";
    if (/Rate Limit Exceeded|userRateLimitExceeded|quota/i.test(msg)) return "Too many requests. Please try again in a moment.";
    if (/Forbidden|forbidden/i.test(msg))                      return "You don't have permission for this action.";
    if (/Authorization|unauthorized/i.test(msg))               return "DriveClarity needs to be reauthorized.";
    if (/Invalid field selection/i.test(msg))                  return "Something went wrong reading this item.";
    if (/timeout|timed out/i.test(msg))                        return "The request took too long. Try again with a smaller selection.";
    return "Something went wrong. Please try again.";
  }

  function pluralize(n, singular, plural) {
    return n + ' ' + (n === 1 ? singular : (plural || singular + 's'));
  }

  function avatarFor(permission) {
    if (permission.type === 'anyone') {
      return CardService.newIconImage().setIcon(CardService.Icon.PERSON);
    }
    if (permission.type === 'domain') {
      return CardService.newIconImage().setIcon(CardService.Icon.HOTEL_ROOM_TYPES);
    }
    if (permission.type === 'group') {
      return CardService.newIconImage().setIcon(CardService.Icon.MULTIPLE_PEOPLE);
    }
    if (permission.photoLink) {
      return CardService.newIconImage()
        .setIconUrl(permission.photoLink)
        .setImageCropType(CardService.ImageCropType.CIRCLE);
    }
    return CardService.newIconImage().setIcon(CardService.Icon.PERSON);
  }

  return {
    COLORS: COLORS,
    visibilityLabel: visibilityLabel,
    visibilityBadge: visibilityBadge,
    roleLabel: roleLabel,
    roleBadge: roleBadge,
    accessSourceLabel: accessSourceLabel,
    fileTypeLabel: fileTypeLabel,
    displayPrincipal: displayPrincipal,
    principalSubtitle: principalSubtitle,
    escapeHtml: escapeHtml,
    friendlyError: friendlyError,
    pluralize: pluralize,
    avatarFor: avatarFor
  };
})();
