# DriveClarity — Plan complet (FR)

> Module complémentaire Google Workspace pour Google Drive
> Affiché dans le panneau latéral compact (~440 px)
> Focalisé uniquement sur les permissions Google Drive

---

## 1. Décisions verrouillées (validées par l'utilisateur)

> ⚠️ **PIVOT du 9 mai 2026 (4h47 → 5h03)** — Le choix initial « hybride / prototype HTML vanilla » est **annulé**. Directive explicite reçue : DriveClarity doit être un **VRAI add-on Google Workspace** déployable, pas un prototype HTML simulant le panneau latéral.

| Décision | Choix retenu (final) |
|---|---|
| **Trajectoire de build** | **A) Real Apps Script Workspace add-on** — déployable directement dans Google Drive |
| **Stack technique** | **Apps Script (V8) + CardService JSON UI + Drive API v3** (avancé) |
| **Architecture UI** | Card unique avec barre d'onglets (boutons FILLED/OUTLINED) + navigation push pour les vues détail |
| **Surface d'extension** | Drive : `homepageTrigger` + `onItemsSelectedTrigger` (contextuel) |
| **Données** | Drive API réelle quand fichier sélectionné ; carte d'accueil instructive sinon |
| **Ne PAS faire** | Pas de Chrome extension, pas de webapp standalone, pas d'iframe externe, pas de simulation HTML |

---

## 2. Reconnaissance — Phase 0

### 2.1 État du workspace
```
/Users/dedieu/driveaccessviewer/   ← vide, départ from-scratch
```

Aucun code préexistant. Toutes les décisions d'architecture sont à faire.

### 2.2 Contraintes dures découvertes (docs officielles + screenshots Canva)

#### Dimensions du panneau latéral
| Surface | Largeur | Personnalisable ? |
|---|---|---|
| Sidebar Editor (Docs/Sheets/Slides) | **300 px fixe** | Non (`setWidth()` déprécié) |
| Panneau add-on Workspace (Drive/Gmail) | **~318–440 px** | Non |
| Screenshots Canva de référence | **~440 px** | Cible canvas |

#### Contraintes Apps Script CardService (pour le futur add-on réel)
- **Pas de HTML/CSS custom.** UI pilotée par JSON, palette de widgets fixe.
- Widgets disponibles : `Card`, `CardSection` (collapsible), `CardHeader`, `DecoratedText` (le cheval de trait), `TextParagraph`, `Image`, `Divider`, `TextInput`, `SelectionInput`, `Switch`, `ChipList`, `Grid`, `ButtonSet`, `Columns`, `FixedFooter`.
- **FixedFooter** = action sticky en bas. Primaire FILLED, secondaire OUTLINED. 2 boutons max.
- **Chrome de l'en-tête** (flèche retour, nom de l'app, kebab, X) **dessiné par Google**, pas par l'add-on. Le canvas commence *sous* la barre violette.
- Formatage texte limité : `<b>`, `<i>`, `<u>`, `<s>`, `<font color>`, `<a>`, `<br>`.
- Scopes OAuth : `https://www.googleapis.com/auth/drive` (complet) ou `drive.metadata`/`drive.readonly` (moins permissif). Vérification production requise pour `drive`.

### 2.3 Patterns UX extraits des screenshots Canva
| Élément | Spécification |
|---|---|
| Largeur panneau | ~440 px (canvas visible), barre d'en-tête full-bleed |
| En-tête (chrome Google) | ~56 px de haut, fond couleur de marque (violet famille `#7C3AED`), coins haut arrondis, icônes blanches, kebab + X |
| Padding body | ~16 px horizontal, ~16–20 px vertical entre blocs |
| Titres de section | Bold, ~15–16 px, gris foncé `#111` |
| Texte courant | ~14 px, `#444–555`, line-height ~1.5 |
| Champs de formulaire | Material **outlined** avec floating label, ~48 px, radius ~6 px |
| Bouton primaire | Rempli couleur de marque, **forme pilule** (radius ≥20 px), ~36–40 px |
| Bouton secondaire | Pilule outlined, bordure neutre, texte foncé |
| Footer actions | Barre sticky bas avec divider fin au-dessus |
| Imagerie hero | Rectangle full-width arrondi à l'intérieur du body |
| Listes numérotées | Plain text, sans puces, espacement généreux |
| Iconographie | Icône d'accent unique (glyphe trombone), monochrome |
| Tonalité | Calme, premium, 80 % whitespace, zéro encombrement |

### 2.4 Doctrine UX Workspace officielle
- Sidebars = outils persistants utilisés de façon répétée. Dialogs = usage unique uniquement. **Pas de dialog depuis une sidebar.**
- "Supposez que les gens ne lisent que le titre et les labels de boutons." → Chaque label doit se suffire.
- Éviter les longs paragraphes descriptifs. Préférer cartes compactes + divulgation progressive.
- Étendre Workspace, ne pas le répliquer.
- Scopes OAuth les plus étroits possibles.

---

## 3. Étude de design — DriveClarity dans un canvas 440 px

### 3.1 Architecture d'information

```
┌─ Chrome Google (en-tête violet, PAS de nous) ─────┐
│  ←  DriveClarity              ⋮     ✕             │
├────────────────────────────────────────────────────┤
│  ▸ En-tête contrôlé par l'app (sticky)             │
│     • Logo DriveClarity + nom du fichier choisi    │
│     • Badge visibilité (Privé/Interne/Ext/Public)  │
├────────────────────────────────────────────────────┤
│  ▸ Nav segmentée (sticky, 3 onglets)               │
│     [ Access  |  Audit  |  Cleanup ]               │
├────────────────────────────────────────────────────┤
│  ▸ Body scrollable (1 colonne, 400 px utiles)      │
│     • Cartes empilées, gap 12–16 px                │
│     • Sections collapsibles pour reveal progressif │
│     • Lignes DecoratedText pour listes permissions │
├────────────────────────────────────────────────────┤
│  ▸ FixedFooter sticky (quand action requise)       │
│     • [Primaire]  [Secondaire]                     │
└────────────────────────────────────────────────────┘
```

### 3.2 Mapping widget par section

#### Section 1 — ACCESS
| Bloc spec | Pattern widget |
|---|---|
| File Summary Card | Section avec `Image` (glyphe type fichier) + lignes `DecoratedText` : Owner / Shared Drive / Visibility |
| Who Can Access | Lignes `DecoratedText` répétées : avatar (start), nom (content), rôle (bottom label), source chip (end) |
| Why They Have Access | `TextParagraph` dans section collapsed-by-default par utilisateur, ouvre une explication en langage simple |
| Permission Hierarchy | `TextParagraph` arborescence monospace compacte (glyphes `└──`) |
| Shared Drive Context | Bloc `DecoratedText` conditionnel, uniquement si applicable |

#### Section 2 — AUDIT
| Bloc spec | Pattern widget |
|---|---|
| Quick Filters | `ChipList` (Public · External · Shared Drive · Inherited · Direct) — multi-select |
| Public Sharing Detection | `DecoratedText` warning + icône rouge + headline bold + bottom label |
| External Detection | `DecoratedText` + badge external + label domaine |
| Investigation Cards | Section tappable par fichier → ouvre Detail card via push navigation |
| Detail View | Nouvelle `Card` pushée sur la stack (flèche retour) |
| Export Audit | `FixedFooter` bouton primaire → déclenche download Drive |

#### Section 3 — CLEANUP
| Bloc spec | Pattern widget |
|---|---|
| User Search | `TextInput` avec hint "Email or name" + onChange action |
| User Access Overview | Lignes `DecoratedText` empilées avec checkbox switch (`SwitchControlType.CHECK_BOX`) |
| Bulk Selection | "Select all" via `DecoratedText` + checkbox en haut de section |
| Bulk Revoke | `FixedFooter` primaire "Revoke selected (N)" + secondaire "Cancel" |
| Confirmation | Nouvelle `Card` pushée (pas de dialog), primaire rouge "Confirm revoke" |
| Progress | Card avec `DecoratedText` par item : ⏳ processing / ✅ done / ⚠️ failed |
| Result Report | Card finale avec compteurs + liste items à revoir manuellement |

### 3.3 Vocabulaire visuel réutilisable (palette alignée Canva)

```
Marque :          #6E5BFF   (primaire DriveClarity, distinct de Drive bleu & Canva violet)
Visibilité :
  Private         #6B7280   gris
  Internal        #2563EB   bleu
  External        #D97706   ambre
  Public          #DC2626   rouge
Surfaces :        blanc #FFFFFF, body bg subtil #F8F8FB
Texte :           #111 / #555 / #888
Bordure/divider : #E5E7EB
Radius :          8 px cartes, 20 px pilules
```

---

## 4. Plan d'exécution — Construction du vrai add-on Apps Script

### 4.1 Objectifs
- Livrer un projet Apps Script **immédiatement déployable** dans Google Drive
- Appeler la vraie Drive API v3 pour les fichiers sélectionnés
- Respecter les contraintes natives du panneau latéral Workspace (~440 px)
- Utiliser uniquement des widgets CardService (zéro HTML custom)
- Permettre déploiement local via `clasp` ou copier-coller dans l'éditeur Apps Script

### 4.2 Structure de livraison (fichiers plats, convention Apps Script)

```
/Users/dedieu/driveaccessviewer/
├── PLAN.md                    ← ce document
├── README.md                  ← guide de déploiement (GCP + clasp + OAuth)
├── appsscript.json            ← manifest (scopes, triggers, advanced services)
├── Code.gs                    ← entry triggers + action callbacks globaux
├── Cards.gs                   ← orchestrateur : header, tab bar, navigation
├── AccessCard.gs              ← Section 1 — Access
├── AuditCard.gs               ← Section 2 — Audit
├── CleanupCard.gs             ← Section 3 — Cleanup
├── DriveService.gs            ← wrappers Drive API v3
├── PermissionAnalyzer.gs      ← classification + explications langage simple
└── Formatters.gs              ← badges visibilité, rôles, icônes, couleurs
```

### 4.3 Architecture UI dans CardService

```
┌─ Chrome Google (purple bar : "DriveClarity") ──────┐  ← manifest
├────────────────────────────────────────────────────┤
│  CardHeader                                         │  ← Cards.gs : buildHeader()
│   • Title    : nom du fichier sélectionné           │
│   • Subtitle : badge visibilité (Private/.../Public)│
│   • Image    : icône type de fichier                │
├────────────────────────────────────────────────────┤
│  CardSection — Tab bar (3 boutons)                  │  ← Cards.gs : buildTabBar()
│   [Access*] [Audit] [Cleanup]                       │  *FILLED si actif, OUTLINED sinon
├────────────────────────────────────────────────────┤
│  Sections dynamiques selon onglet actif             │
│   • Access  → AccessCard.addSections(card, file)    │
│   • Audit   → AuditCard.addSections(card, file)     │
│   • Cleanup → CleanupCard.addSections(card, file)   │
├────────────────────────────────────────────────────┤
│  FixedFooter conditionnel                           │  ← selon section active
│   • Audit   : "Export CSV"                          │
│   • Cleanup : "Revoke selected (N)"  +  "Cancel"    │
└────────────────────────────────────────────────────┘
```

### 4.4 Patterns de navigation

| Action | Pattern CardService |
|---|---|
| Switch tab (Access/Audit/Cleanup) | `Navigation.updateCard(rebuild(activeTab))` |
| Ouvrir détail investigation | `Navigation.pushCard(detailCard)` |
| Confirmation revoke | `Navigation.pushCard(confirmCard)` (jamais de dialog) |
| Retour | Bouton ← natif de Google (pop card stack) |
| Notification de succès | `ActionResponse.setNotification(...)` |

### 4.5 Stratégie d'appels Drive API

| Trigger | Appels API |
|---|---|
| `onHomepage` (rien sélectionné) | Aucun → carte d'instructions |
| `onItemsSelected(e)` | `Drive.Files.get(id, ...)` + `Drive.Permissions.list(id, ...)` |
| Section Access | + `Drive.Drives.get(driveId)` si fichier en Shared Drive |
| Section Audit | + `Drive.Files.list(q='parents in folderId')` (récursif limité) |
| Section Cleanup | `Drive.Files.list(q="'me' in owners")` puis filtre permissions |
| Action revoke | `Drive.Permissions.remove(fileId, permissionId)` |

### 4.6 Garde-fous qualité

- **Quotas Drive API** : limiter récursion d'audit à profondeur 2 + max 50 fichiers/audit
- **Pagination** : utiliser `pageToken` partout où `Files.list` est appelé
- **Erreurs** : try/catch global, retour d'une `Notification` claire au lieu de crash
- **Performance** : grouper les `Permissions.list` par batch (max 5 fichiers/audit immédiat)
- **Tests** : exécutables manuellement via les fonctions globales `_testXxx()` à la racine

---

## 6. Règles produit verrouillées

### À NE PAS faire
- Pas de scoring IA
- Pas de DLP
- Pas d'outils Gmail / Calendar / Classroom / YouTube / Device management
- Pas de dashboard admin géant
- Pas de surcharge UI

### À faire impérativement
- Clarté
- Simplicité
- Lisibilité
- Google Drive uniquement
- Compact
- Scopes OAuth minimaux
- Confiance et transparence

### Langage produit
- Calme, simple, humain, non technique
- Préférer : Public / External / Inherited / Direct access
- Éviter : Governance / DLP / SIEM / Policy enforcement framework

---

## 7. Message produit central

> **« Comprenez qui peut accéder à vos fichiers Google Drive, pourquoi ils y ont accès, et nettoyez les permissions plus rapidement. »**

---

## 8. APIs et permissions OAuth (réf. officielles)

> Sources : `developers.google.com/workspace/drive`, `developers.google.com/workspace/drive/api/guides/api-specific-auth`, `developers.google.com/workspace/add-ons`

### 8.1 APIs Google Cloud à activer dans le projet GCP

| API | Obligatoire ? | Usage DriveClarity |
|---|---|---|
| **Google Drive API v3** | ✅ Oui | Lecture fichiers, permissions, partages (cœur des 3 sections) |
| **Google Workspace Add-ons API** | ✅ Oui | Framework de l'add-on (auto-activée via Apps Script) |
| **Cloud Identity Groups API** | ⚠️ Recommandé | Résoudre l'appartenance aux groupes (« accès via groupe Marketing ») |
| **Google Drive Activity API** | 🔮 Optionnel | Audit trail / historique (futur) |
| **Admin SDK Directory API** | ❌ Non recommandé | Trop large, alternative inférieure à Cloud Identity |

### 8.2 Scopes OAuth — par phase d'utilisation (moindre privilège)

#### Phase 1 — Lectures (sections Access + Audit)
| Scope | Sensibilité | Pourquoi |
|---|---|---|
| `https://www.googleapis.com/auth/drive.metadata.readonly` | 🟡 Sensitive | Métadonnées fichier (nom, owner, parent, sharedDrive) |
| `https://www.googleapis.com/auth/drive.readonly` | 🔴 Restricted | Nécessaire pour `permissions.list` complet (rôles, type, domaine) |
| `https://www.googleapis.com/auth/cloud-identity.groups.readonly` | 🟡 Sensitive | Résoudre membres de groupes |
| `https://www.googleapis.com/auth/userinfo.email` | 🟢 Non-sensitive | Identité de l'utilisateur connecté |

#### Phase 2 — Écritures (section Cleanup → revoke + export CSV)
| Scope | Sensibilité | Pourquoi |
|---|---|---|
| `https://www.googleapis.com/auth/drive` | 🔴 Restricted | Requis pour `permissions.delete` et création du CSV d'audit dans Drive |

#### Phase 3 — Optionnel (futur)
| Scope | Sensibilité | Pourquoi |
|---|---|---|
| `https://www.googleapis.com/auth/drive.activity.readonly` | 🔴 Restricted | Historique d'activité Drive |

### 8.3 Endpoints Drive API consommés

| Endpoint | Méthode | Section |
|---|---|---|
| `files.get` | GET | Access (métadonnées fichier sélectionné) |
| `files.list` | GET | Audit (parcours dossier/Shared Drive), Cleanup (recherche par user) |
| `permissions.list` | GET | Access + Audit (qui a accès) |
| `permissions.get` | GET | Détail permission individuelle |
| `permissions.delete` | DELETE | Cleanup (révoquer) |
| `drives.get` | GET | Access (info Shared Drive) |
| `drives.list` | GET | Cleanup (Shared Drives accessibles) |

### 8.4 Triggers Apps Script (manifest `appsscript.json`)

| Trigger | Usage |
|---|---|
| `addOns.common.homepageTrigger` | Carte d'accueil (aucun fichier sélectionné) |
| `addOns.drive.onItemsSelectedTrigger` | Activation contextuelle quand un fichier est sélectionné dans Drive |
| `addOns.common.universalActions` | Action « Ouvrir DriveClarity » depuis n'importe où |

### 8.5 Stratégie d'élévation de scopes (consentement incrémental)

```
1. Premier lancement      → drive.metadata.readonly + drive.readonly + userinfo.email
2. User clique "Revoke"   → consentement incrémental pour drive
3. User active groupes    → consentement incrémental pour cloud-identity.groups.readonly
```

> Règle : **ne JAMAIS** demander `drive` avant que l'utilisateur ne lance explicitement une révocation.

### 8.6 Vérifications Google requises avant publication Marketplace

| Type | Déclencheur | Délai estimé |
|---|---|---|
| Brand Verification | Toujours | ~1 semaine |
| OAuth App Verification (Sensitive) | `drive.metadata.readonly`, `cloud-identity.groups.readonly` | 2–4 semaines |
| OAuth App Verification (Restricted) | `drive`, `drive.readonly` | 4–8 semaines |
| CASA Security Assessment | `drive` (Restricted) si données Drive stockées hors GCP | 6–12 semaines, payant |

> ⚠️ DriveClarity étant un add-on Apps Script (exécution côté Google), la **CASA peut être évitée** si aucune donnée Drive n'est stockée hors de l'environnement Apps Script.

### 8.7 Manifest `appsscript.json` cible (extrait)

```json
{
  "timeZone": "Europe/Paris",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/cloud-identity.groups.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/script.locale"
  ],
  "addOns": {
    "common": {
      "name": "DriveClarity",
      "logoUrl": "https://.../driveclarity-logo.png",
      "homepageTrigger": { "runFunction": "onHomepage" },
      "universalActions": [
        { "label": "À propos", "openLink": "https://driveclarity.app/about" }
      ]
    },
    "drive": {
      "homepageTrigger": { "runFunction": "onDriveHomepage" },
      "onItemsSelectedTrigger": { "runFunction": "onItemsSelected" }
    }
  }
}
```

---

## 9. État d'avancement (TODO ledger)

- ✅ Phase 0 — Reconnaissance et étude UX
- ✅ Décisions verrouillées (hybride / vanilla / 3 sections statiques)
- ✅ Plan documenté en français
- 🚧 Étape 1 — Construction prototype HTML/CSS/JS (en attente du go)
- 🚧 Étape 2 — Traduction Apps Script (différée jusqu'à validation étape 1)

---

## 10. Prochaine action attendue

En attente de votre **GO** pour démarrer l'étape 1 (construction du prototype HTML statique avec les 3 sections + données mockées + faux backdrop Drive 440 px).
