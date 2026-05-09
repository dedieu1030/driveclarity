/**
 * Formatters.gs — UI helpers, constants, and label translations.
 *
 * Centralises all human-readable strings so we can localize later without
 * touching card builders. Also owns the colour palette used by buttons and
 * decorated text accents.
 */

const Formatters = (function () {

  // ─── Brand palette ─────────────────────────────────────────────────────

  const COLORS = {
    brand:    '#6E5BFF',
    private:  '#6B7280',
    internal: '#2563EB',
    external: '#D97706',
    public:   '#DC2626',
    danger:   '#DC2626',
    success:  '#16A34A',
    warning:  '#D97706',
    muted:    '#888888',
    text:     '#111111',
    subtle:   '#555555'
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
    pluralize: pluralize,
    avatarFor: avatarFor
  };
})();
