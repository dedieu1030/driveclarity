/**
 * PermissionAnalyzer.gs — Translate raw Drive permission data into
 * human-readable, calm explanations.
 *
 * No HTTP calls live here. This is a pure transformation layer that takes
 * file + permissions and produces:
 *   - a normalised list of access rows for the UI
 *   - a plain-language sentence for each row ("why they have access")
 *   - a top-level visibility classification (private/internal/external/public)
 *   - aggregate audit signals (public link, external count, domain access...)
 */

const PermissionAnalyzer = (function () {

  /**
   * Compute the highest-level visibility of a file.
   *  - 'public'   : anyone on the web with the link can access
   *  - 'external' : at least one principal outside the user's domain
   *  - 'internal' : domain-wide access OR shared only inside the org
   *  - 'private'  : only the owner has access
   */
  function computeVisibility(file) {
    const perms = (file && file._permissions) || [];
    const list = perms.length ? perms : safeListPermissions(file && file.id);
    if (!list || list.length === 0) return 'private';

    const myDomain = (DriveService.getCurrentUserDomain() || '').toLowerCase();
    let hasAnyone   = false;
    let hasDomain   = false;
    let hasExternal = false;
    let nonOwner    = 0;

    list.forEach(function (p) {
      if (p.deleted) return;
      if (p.role !== 'owner') nonOwner++;
      if (p.type === 'anyone') hasAnyone = true;
      if (p.type === 'domain') hasDomain = true;
      if (p.type === 'user' || p.type === 'group') {
        const email = (p.emailAddress || '').toLowerCase();
        const domain = email.indexOf('@') >= 0 ? email.substring(email.indexOf('@') + 1) : '';
        if (myDomain && domain && domain !== myDomain) hasExternal = true;
      }
    });

    if (hasAnyone)   return 'public';
    if (hasExternal) return 'external';
    if (hasDomain)   return 'internal';
    if (nonOwner === 0) return 'private';
    return 'internal';
  }

  function safeListPermissions(fileId) {
    if (!fileId) return [];
    try { return DriveService.listPermissions(fileId); }
    catch (e) { return []; }
  }

  /**
   * Return the array of access rows ready for rendering.
   * Each row: { permission, source, sourceLabel, why }
   */
  function buildAccessRows(file) {
    const perms = DriveService.listPermissions(file.id);
    return perms
      .filter(function (p) { return !p.deleted; })
      .map(function (p) {
        const source = classifySource(p);
        return {
          permission: p,
          source: source,
          sourceLabel: Formatters.accessSourceLabel(source),
          why: explainAccess(p, source, file)
        };
      })
      .sort(rolePriority);
  }

  function classifySource(p) {
    const details = (p.permissionDetails && p.permissionDetails[0]) || null;
    if (details && details.inherited) return 'inherited';
    if (p.type === 'group')  return 'group';
    if (p.type === 'domain') return 'domain';
    if (p.type === 'anyone') return 'anyone';
    return 'direct';
  }

  /**
   * Plain-language explanation of why a principal has access.
   * The principal's name and email are shown separately by the UI,
   * so this returns a short standalone sentence — never repeating
   * the name. Uses the proper a/an article for the role.
   */
  function explainAccess(p, source, file) {
    const role = Formatters.roleLabel(p.role).toLowerCase();
    const article = /^[aeiou]/i.test(role) ? 'an' : 'a';

    if (p.role === 'owner') {
      return 'Owns this item.';
    }
    if (source === 'inherited') {
      return 'Inherits ' + role + ' access from a parent folder.';
    }
    if (source === 'group') {
      return 'Gets ' + role + ' access through a Google group.';
    }
    if (source === 'domain') {
      const domain = p.domain || 'your organization';
      return 'Anyone in ' + domain + ' has ' + role + ' access.';
    }
    if (source === 'anyone') {
      const discoverable = p.allowFileDiscovery ? 'can find and access' : 'with the link can access';
      return 'Anyone on the web ' + discoverable + ' this item as ' + article + ' ' + role + '.';
    }
    return 'Added directly as ' + article + ' ' + role + '.';
  }

  function rolePriority(a, b) {
    const order = { owner: 0, organizer: 1, fileOrganizer: 2, writer: 3, commenter: 4, reader: 5 };
    const av = order[a.permission.role] != null ? order[a.permission.role] : 9;
    const bv = order[b.permission.role] != null ? order[b.permission.role] : 9;
    return av - bv;
  }

  /**
   * Aggregate audit signals for the Audit section.
   */
  function auditSignals(file) {
    const perms = DriveService.listPermissions(file.id);
    const myDomain = (DriveService.getCurrentUserDomain() || '').toLowerCase();

    const externals = [];
    let hasPublic = false;
    let hasDomain = false;
    let groupCount = 0;
    let inheritedCount = 0;
    let directCount = 0;

    perms.forEach(function (p) {
      if (p.deleted) return;
      if (p.type === 'anyone') hasPublic = true;
      if (p.type === 'domain') hasDomain = true;
      if (p.type === 'group')  groupCount++;
      const isInherited = p.permissionDetails && p.permissionDetails[0] && p.permissionDetails[0].inherited;
      if (isInherited) inheritedCount++;
      else if (p.type === 'user') directCount++;

      if ((p.type === 'user' || p.type === 'group') && p.emailAddress) {
        const at = p.emailAddress.indexOf('@');
        const domain = at >= 0 ? p.emailAddress.substring(at + 1).toLowerCase() : '';
        if (myDomain && domain && domain !== myDomain) {
          externals.push({ email: p.emailAddress, domain: domain, role: p.role });
        }
      }
    });

    return {
      visibility:    computeVisibility({ id: file.id, _permissions: perms }),
      hasPublic:     hasPublic,
      hasDomain:     hasDomain,
      externals:     externals,
      externalCount: externals.length,
      externalDomains: uniqueDomains(externals),
      groupCount:    groupCount,
      inheritedCount: inheritedCount,
      directCount:   directCount,
      total:         perms.length,
      permissions:   perms
    };
  }

  function uniqueDomains(externals) {
    const seen = {};
    externals.forEach(function (e) { seen[e.domain] = true; });
    return Object.keys(seen);
  }

  return {
    computeVisibility: computeVisibility,
    buildAccessRows: buildAccessRows,
    classifySource: classifySource,
    explainAccess: explainAccess,
    auditSignals: auditSignals
  };
})();
