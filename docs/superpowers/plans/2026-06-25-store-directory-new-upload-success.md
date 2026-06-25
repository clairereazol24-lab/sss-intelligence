# Store Directory New Upload Success Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a success banner for Store Directory's New Upload mode, matching the existing Update File banner and SSS Data's both-modes behavior.

**Architecture:** Single conditional change in `performBulkImport`'s success branch — always set `bulkResult`, with wording chosen by `wasUpdateMode`.

**Tech Stack:** Next.js 14, TypeScript, React state (no test framework in this repo).

## Global Constraints

- No backend/API changes.
- Update File's existing success wording is unchanged.
- Same banner placement, same `handleBulkCancel()`/`fetchStores()` calls — only the `bulkResult` assignment changes.

---

### Task 1: Always show a success banner in `performBulkImport`

**Files:**
- Modify: `app/store-directory/page.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Replace the conditional success message**

Find this block:

```tsx
    if (data.error) {
      setBulkError(data.error)
    } else {
      const wasUpdateMode = bulkMode === 'update'
      handleBulkCancel()
      if (wasUpdateMode) {
        setBulkResult(`✅ Directory updated: ${data.count} stores upserted, ${data.removed} removed.`)
      }
      fetchStores()
    }
```

Replace it with:

```tsx
    if (data.error) {
      setBulkError(data.error)
    } else {
      const wasUpdateMode = bulkMode === 'update'
      handleBulkCancel()
      setBulkResult(
        wasUpdateMode
          ? `✅ Directory updated: ${data.count} stores upserted, ${data.removed} removed.`
          : `✅ Successfully imported ${data.count} stores.`
      )
      fetchStores()
    }
```

- [ ] **Step 2: Verify**

Run `npx tsc --noEmit` — expect zero errors. Run `npm run build` — expect a clean build covering `/store-directory`.

- [ ] **Step 3: Commit**

```bash
git add app/store-directory/page.tsx
git commit -m "Show success banner for Store Directory New Upload mode"
```
