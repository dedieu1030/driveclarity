# Access Audit & Revoke for Drive — Google Workspace Add-on

> A real Google Workspace add-on that explains who can access your Google Drive files, why they have access, and helps you clean up permissions faster.

Access Audit & Revoke for Drive lives **inside the Google Drive side panel**. It is built on Apps Script + the Card service and calls the Drive API v3 directly. There is no external web app, no Chrome extension, no third-party server.

---

## What it does

Three sections, one compact card:

| Section | Purpose |
|---|---|
| **Access** | See who can access the selected file, why, and how access is inherited |
| **Audit** | Detect public links, external sharing, domain access; export a CSV |
| **Cleanup** | Search a departing user, list their access, bulk-revoke direct permissions |

---

## Project layout

```
.
├── appsscript.json       Manifest (scopes, triggers, advanced services)
├── Code.gs               Entry triggers + every action callback referenced by the manifest
├── Cards.gs              Main card frame: header, tab bar, navigation, error/empty cards
├── AccessCard.gs         Section 1 — Access
├── AuditCard.gs          Section 2 — Audit (incl. detail view + CSV export)
├── CleanupCard.gs        Section 3 — Cleanup (search, bulk select, revoke flow)
├── DriveService.gs       Thin wrappers over the advanced Drive service (v3)
├── PermissionAnalyzer.gs Pure functions: classify permissions, plain-language explanations
├── Formatters.gs         Brand palette, role/visibility labels, HTML helpers
├── PLAN.md               Full design + research doctrine (FR)
└── README.md             This file
```

Apps Script projects are flat — file names map 1:1 to the script editor.

---

## Prerequisites

1. A Google Workspace account
2. A Google Cloud project (any Workspace edition)
3. (Recommended) `clasp` for local development:
   ```bash
   npm install -g @google/clasp
   clasp login
   ```

---

## Deploy in 5 steps

### 1. Create the Apps Script project

**Option A — clasp (recommended)**
```bash
cd /Users/dedieu/driveaccessviewer
clasp create --type standalone --title "Access Audit & Revoke for Drive"
clasp push -f
```

**Option B — Apps Script editor**
1. Open <https://script.google.com> → **New project**
2. Name it `Access Audit & Revoke for Drive`
3. Copy the contents of each `.gs` file into a same-named file in the editor
4. Open the manifest (gear icon → **Show appsscript.json**) and replace it with the contents of `appsscript.json`

### 2. Link a standard Google Cloud project

Apps Script add-ons require a **standard** GCP project (not the auto-generated one) for OAuth verification later.

1. In the Apps Script editor → **Project Settings** → **Google Cloud Platform (GCP) Project** → **Change project**
2. Paste the GCP project number from <https://console.cloud.google.com/iam-admin/settings>
3. Click **Set project**

### 3. Enable required APIs in the GCP console

Enable these APIs in your linked Cloud project:

- **Google Drive API** ([enable](https://console.cloud.google.com/apis/library/drive.googleapis.com))
- **Google Workspace Add-ons API** ([enable](https://console.cloud.google.com/apis/library/gsuiteaddons.googleapis.com))

### 4. Configure the OAuth consent screen

1. In the Cloud console → **APIs & Services** → **OAuth consent screen**
2. User type: **Internal** (for testing inside your org) or **External** (for Marketplace)
3. App name: `Access Audit & Revoke for Drive`
4. Scopes: leave empty for now — Apps Script will surface them on first run
5. Save

### 5. Test as a deployment

In the Apps Script editor:

1. Click **Deploy** → **Test deployments**
2. Select **Install** → **Done**
3. Open <https://drive.google.com>, select a file, then click the Access Audit & Revoke for Drive icon in the right side rail

The first run will trigger the OAuth consent. Approve.

---

## OAuth scopes used

| Scope | Sensitivity | Why |
|---|---|---|
| `drive.metadata.readonly` | Sensitive | Read file metadata (name, owner, parents) |
| `drive.readonly` | Restricted | Read full permissions list (`permissions.list`) |
| `drive` | Restricted | Required for `permissions.delete` (Cleanup) and creating the audit CSV |
| `userinfo.email` | Non-sensitive | Identify the current user's domain |
| `script.locale` | Non-sensitive | Localized formatting |

> **Restricted-scope verification** is required before publishing publicly. Internal-only deployments inside a single Workspace organization can run without it.

---

## How the card flow is wired

```
Drive UI selection
        │
        ▼
onItemsSelected(e)                    ← Code.gs
        │
        ▼
Cards.buildMainCard(fileId, 'access')  ← Cards.gs
   ├── Cards.buildHeader(file)
   ├── Cards.buildTabBar(fileId, 'access')   →  actionSwitchSection
   └── AccessCard.addSections(builder, file)
         ├── DriveService.getFile / listPermissions
         └── PermissionAnalyzer.buildAccessRows
```

Section switching uses `Navigation.updateCard` (in-place rebuild). Detail views (investigation, revoke confirm, result report) use `Navigation.pushCard` so the native Workspace **back arrow** returns the user.

---

## Drive API endpoints used

| Endpoint | Used in |
|---|---|
| `Files.get` | Access (file metadata + parents chain) |
| `Files.list` | Audit (folder children), Cleanup (owned files) |
| `Permissions.list` | Access, Audit, Cleanup |
| `Permissions.remove` | Cleanup (revoke) |
| `Drives.get` | Access (Shared Drive context) |

All Drive calls flow through `DriveService.gs` and pass `supportsAllDrives: true`.

---

## Limits and trade-offs

| Constraint | Decision |
|---|---|
| Side panel width is fixed (~440px) | Single-column layout, compact `DecoratedText` rows |
| CardService does not support custom CSS | Brand colour applied to FILLED buttons + inline `<font color>` for badges |
| No real dialogs in sidebars | Confirmation flows use `Navigation.pushCard` instead |
| Drive has no "all files X has access to" query for non-admins | Cleanup search scans files **owned by the current user** (covers the common manager-offboarding scenario) |
| Audit can be slow on huge folders | Hard cap of 25 files per audit pass; pagination handled in `DriveService` |

---

## Local development workflow

```bash
clasp pull              # pull editor changes locally
# edit *.gs / appsscript.json
clasp push -f           # push back to Apps Script
clasp open              # open the editor in browser
```

Logs land in **Apps Script editor → Executions** (Stackdriver-backed because of `"exceptionLogging": "STACKDRIVER"`).

---

## Publishing to the Workspace Marketplace (later)

1. Brand verification (~1 week)
2. OAuth app verification — sensitive scopes (~2–4 weeks)
3. OAuth app verification — restricted scopes (~4–8 weeks)
4. (Conditional) CASA security assessment for `drive` scope if data is stored outside Apps Script — **not applicable here** because DriveClarity stores nothing outside the user's Google environment

See the official [Workspace Marketplace publishing guide](https://developers.google.com/workspace/marketplace/how-to-publish).

---

## License

Proprietary. © 2026 Access Audit & Revoke for Drive. All rights reserved.
