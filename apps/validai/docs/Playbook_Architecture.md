# Playbook Architecture

This document describes the architecture for playbook versioning, publishing, and discovery in ValidAI.

## Overview

The playbook system enables users to:
1. **Create and edit** playbooks (processors) with live configuration
2. **Publish** frozen versions (snapshots) that cannot be modified
3. **Discover** published playbooks in a catalog for the future portal/marketplace

### Key Design Goals

| Goal | Solution |
|------|----------|
| **Version Control** | Immutable snapshots created at publish time |
| **Separation of Concerns** | Catalog for discovery, snapshots for execution |
| **Access Control** | Distinct RLS policies for creators vs. consumers |
| **Billing Follows Runner** | Runs reference snapshots, enabling future billing by consumer org |

## Core Tables

### 1. `validai_processors` - Live Editable Playbooks

The source table for playbook authoring. Users edit processors freely until publishing.

```
validai_processors
├── id                    (uuid, PK)
├── organization_id       (uuid, FK → organizations)
├── name, description     (editable profile data)
├── system_prompt         (LLM instructions)
├── configuration         (model settings)
├── status                (draft | published | archived)
├── active_snapshot_id    (uuid, FK → snapshots, nullable)
├── loaded_snapshot_id    (uuid, tracks which version is loaded in editor)
├── tags, usage_description  (profile metadata for discovery)
└── created_at, updated_at
```

**Key Fields:**
- `active_snapshot_id`: Points to the currently published snapshot (if any)
- `loaded_snapshot_id`: Tracks which version is loaded in the editor for dirty-state comparison
- `status`: Reflects publish state (`draft` → `published` → can return to `draft`)

### 2. `validai_playbook_snapshots` - Frozen Published Versions

Immutable copies of processor configuration at publish time.

```
validai_playbook_snapshots
├── id                       (uuid, PK)
├── processor_id             (uuid, FK → processors, nullable for orphaned)
├── creator_organization_id  (uuid, FK → organizations)
├── created_by               (uuid, FK → auth.users)
├── name, description        (frozen at publish time)
├── version_number           (auto-incremented per processor)
├── visibility               (private | organization | public)
├── is_published             (boolean, toggleable without deletion)
├── snapshot                 (jsonb, frozen configuration)
├── published_at, unpublished_at
└── created_at, updated_at
```

**Snapshot JSONB Structure:**
```json
{
  "processor": {
    "id": "uuid",
    "name": "Invoice Validator",
    "description": "...",
    "system_prompt": "You are...",
    "configuration": { "model": "gpt-4", "temperature": 0.2 }
  },
  "operations": [
    {
      "id": "uuid",
      "name": "Extract Fields",
      "operation_type": "extract",
      "prompt": "Extract...",
      "position": 1,
      "configuration": {},
      "output_schema": {}
    }
  ]
}
```

### 3. `validai_playbook_catalog` - Discovery Metadata

Separate table for portal/marketplace discovery. Contains only public-safe metadata.

```
validai_playbook_catalog
├── id                  (uuid, PK)
├── snapshot_id         (uuid, FK → snapshots, UNIQUE)
├── processor_id        (uuid, FK → processors)
├── organization_id     (uuid, FK → organizations)
├── created_by          (uuid, FK → auth.users)
├── name                (frozen at publish time)
├── description         (frozen at publish time)
├── usage_description   (frozen at publish time)
├── tags                (text[], frozen at publish time)
└── created_at, updated_at
```

**Why Separate from Snapshots?**
- Different RLS policies (catalog = public read, snapshots = access-controlled)
- Catalog doesn't contain execution configuration (security)
- Enables efficient full-text search without loading heavy JSONB

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AUTHORING PHASE                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────────────┐                                              │
│   │  validai_processors  │  ← User edits live                           │
│   │  (live, editable)    │                                              │
│   │  ├── name            │                                              │
│   │  ├── system_prompt   │                                              │
│   │  ├── configuration   │                                              │
│   │  └── operations[]    │                                              │
│   └──────────┬───────────┘                                              │
│              │                                                           │
│              │ publish_playbook()                                        │
│              ▼                                                           │
└─────────────────────────────────────────────────────────────────────────┘
              │
              │ Creates two records atomically:
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          PUBLISHING PHASE                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────────────┐    ┌─────────────────────────────┐   │
│   │  validai_playbook_snapshots │    │  validai_playbook_catalog   │   │
│   │  (frozen configuration)     │    │  (discovery metadata)       │   │
│   │  ├── snapshot JSONB         │    │  ├── name                   │   │
│   │  ├── version_number         │    │  ├── description            │   │
│   │  ├── visibility             │    │  ├── usage_description      │   │
│   │  └── is_published           │    │  └── tags[]                 │   │
│   └──────────────┬──────────────┘    └──────────────────────────────┘   │
│                  │                                                       │
│                  │  Referenced by runs                                   │
│                  ▼                                                       │
└─────────────────────────────────────────────────────────────────────────┘
              │
              │ Runs use snapshot
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          EXECUTION PHASE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────────────┐                                              │
│   │    validai_runs      │                                              │
│   │  ├── snapshot (copy) │ ← Full config copy for run reproducibility   │
│   │  └── playbook_       │ ← Reference to snapshot for analytics        │
│   │      snapshot_id     │                                              │
│   └──────────────────────┘                                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Snapshot (Frozen Configuration)

A snapshot captures the complete playbook state at publish time:
- **Immutable**: Once created, the `snapshot` JSONB never changes
- **Self-contained**: Contains everything needed to execute the playbook
- **Versioned**: Auto-incremented version_number per processor

```typescript
// Snapshot structure
interface PlaybookSnapshot {
  processor: {
    id: string
    name: string
    description: string | null
    system_prompt: string | null
    configuration: Record<string, unknown> | null
  }
  operations: Array<{
    id: string
    name: string
    operation_type: string
    prompt: string
    position: number
    configuration: Record<string, unknown> | null
    output_schema: Record<string, unknown> | null
  }>
}
```

### Catalog (Discovery Metadata)

The catalog is optimized for searching and browsing:
- **Frozen at publish**: Name, description, tags do NOT sync with processor edits
- **Public readable**: Anyone with app access can browse
- **Lightweight**: No execution configuration, just metadata
- **Searchable**: Full-text index on name + usage_description, GIN index on tags

**Important**: To update catalog metadata, users must **re-publish** the playbook.

### Version Management

Each processor can have multiple snapshots (versions):
- Only **one version** can be `is_published = true` at a time
- Publishing a new version auto-unpublishes the previous one
- Old versions are preserved for historical reference
- Users can switch between versions and republish older ones

```
Processor "Invoice Validator"
├── v1 (unpublished) - created 2024-01-01
├── v2 (unpublished) - created 2024-01-15
└── v3 (PUBLISHED)   - created 2024-02-01 ← active_snapshot_id
```

### Profile vs Snapshot Data

Understanding what data is where:

| Data | Location | When Updated |
|------|----------|--------------|
| Live edits | `validai_processors` | Real-time as user types |
| Frozen config | `validai_playbook_snapshots.snapshot` | At publish time only |
| Discovery info | `validai_playbook_catalog` | At publish time only |

**Profile fields** (name, description, usage_description, tags) are copied from the processor at publish time. Subsequent edits to the processor do NOT update the catalog entry.

## Workflows

### Publishing Flow

```
User clicks "Publish"
         │
         ▼
┌─────────────────────────────────────┐
│  1. Validate processor              │
│     - Has at least one operation    │
│     - Not archived                  │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  2. Unpublish existing (if any)     │
│     - Set is_published = false      │
│     - Delete old catalog entry      │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  3. Create new snapshot             │
│     - Auto-increment version_number │
│     - Build snapshot JSONB          │
│     - Set is_published = true       │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  4. Create catalog entry            │
│     - Copy profile metadata         │
│     - One-to-one with snapshot      │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  5. Update processor                │
│     - Set active_snapshot_id        │
│     - Set status = 'published'      │
└─────────────────────────────────────┘
```

### Unpublishing Flow

```
User clicks "Unpublish"
         │
         ▼
┌─────────────────────────────────────┐
│  1. Delete catalog entry            │
│     - Removes from discovery        │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  2. Update snapshot                 │
│     - Set is_published = false      │
│     - Set unpublished_at timestamp  │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  3. Update processor (optional)     │
│     - Clear active_snapshot_id      │
│     - Set status = 'draft'          │
└─────────────────────────────────────┘

Note: Snapshot data is PRESERVED. User can republish later.
```

### Version Switching Flow

```
User selects older version from history
         │
         ▼
┌─────────────────────────────────────┐
│  set_published_version(snapshot_id) │
│     - Unpublish current version     │
│     - Publish selected version      │
│     - Creates new catalog entry     │
│       with CURRENT processor profile│
└─────────────────────────────────────┘

Note: When switching versions, catalog entry uses current
processor profile (name, tags, etc.) not the old snapshot's.
This allows updating discovery info by editing processor first.
```

### Save/Load Workflow (Dirty State)

```
┌──────────────────────────────────────────────────────────────────┐
│                     SAVE AS VERSION                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   User edits processor → clicks "Save"                           │
│              │                                                    │
│              ▼                                                    │
│   ┌──────────────────────────────────┐                           │
│   │  save_as_version()               │                           │
│   │  - Creates new unpublished snap  │                           │
│   │  - Sets loaded_snapshot_id       │                           │
│   │  - Clears dirty state            │                           │
│   └──────────────────────────────────┘                           │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     LOAD VERSION                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   User selects version → clicks "Load"                           │
│              │                                                    │
│              ▼                                                    │
│   ┌──────────────────────────────────┐                           │
│   │  load_snapshot()                 │                           │
│   │  - Replaces processor config     │                           │
│   │  - Replaces operations           │                           │
│   │  - Sets loaded_snapshot_id       │                           │
│   └──────────────────────────────────┘                           │
│                                                                   │
│   Note: Loading overwrites unsaved changes!                      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## RLS Strategy

### Snapshots Table

```sql
-- Policy 1: Creator org has full access
CREATE POLICY "Creators manage own org snapshots"
  ON validai_playbook_snapshots FOR ALL
  USING (
    creator_organization_id = user_organization_id()
    AND has_app_access('validai')
  );

-- Policy 2: Org members can read org-visible snapshots
CREATE POLICY "Org snapshots readable by org members"
  ON validai_playbook_snapshots FOR SELECT
  USING (
    visibility = 'organization'
    AND is_published = true
    AND creator_organization_id = user_organization_id()
    AND has_app_access('validai')
  );

-- Policy 3: Anyone can read public snapshots (future portal)
CREATE POLICY "Public snapshots readable by all authenticated"
  ON validai_playbook_snapshots FOR SELECT
  USING (
    visibility = 'public'
    AND is_published = true
    AND has_app_access('validai')
  );
```

### Catalog Table

```sql
-- Policy 1: Anyone can browse (public read)
CREATE POLICY "Anyone can browse catalog"
  ON validai_playbook_catalog FOR SELECT
  USING (has_app_access('validai'));

-- Policy 2: Only creator org can modify
CREATE POLICY "Creator org manages catalog entries"
  ON validai_playbook_catalog FOR ALL
  USING (
    organization_id = user_organization_id()
    AND has_app_access('validai')
  );
```

**Key Insight**: Catalog is public read, but snapshots have visibility-based access. This allows browsing the catalog freely while protecting execution configuration.

## Database Functions

| Function | Purpose |
|----------|---------|
| `publish_playbook(processor_id, visibility)` | Creates snapshot + catalog entry |
| `unpublish_playbook(snapshot_id)` | Hides snapshot, deletes catalog |
| `republish_playbook(snapshot_id)` | Re-activates unpublished snapshot |
| `set_published_version(snapshot_id, publish)` | Toggle publish on existing snapshot |
| `update_playbook_visibility(snapshot_id, visibility)` | Change access level |
| `get_playbook_snapshot(snapshot_id)` | Fetch snapshot with visibility check |
| `get_processor_snapshots(processor_id)` | List all versions for a processor |
| `save_as_version(processor_id, visibility)` | Save without publishing |
| `load_snapshot(processor_id, snapshot_id)` | Load version into editor |

## Frontend Hooks

```typescript
// Publishing
usePublishPlaybook()      // Create new published version
useUnpublishPlaybook()    // Hide published version
useRepublishPlaybook()    // Re-activate old version
useSetPublishedVersion()  // Toggle publish on snapshot

// Querying
usePublishedSnapshot(processorId)    // Get current published version
useProcessorSnapshots(processorId)   // List all versions
usePlaybookSnapshot(snapshotId)      // Get full snapshot data

// Version Management
useSaveAsVersion()        // Save current state as new version
useLoadSnapshot()         // Load version into editor
useSnapshotForComparison() // For dirty-state detection
```

## Future Considerations

### Portal Phase
- Public visibility will enable marketplace discovery
- Catalog full-text search already indexed
- RLS policies already support public read

### Billing Integration
- `playbook_snapshot_id` on runs enables usage tracking
- Runner organization can be billed separately from creator
- Fork/copy capability can create new snapshots owned by copier

### Version Comparison
- Could add diff view between snapshot versions
- Snapshot JSONB structure supports comparison

---

*Last updated: 2026-01*
