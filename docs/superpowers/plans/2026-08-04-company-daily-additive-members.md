# Company Daily-Additive Members Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Company (LakiWin Marketing) daily Members uploads add each day's deposit/withdraw/GGR numbers onto the existing cumulative total for a username, instead of overwriting it, so daily files only need to report that day's new activity.

**Architecture:** Single change inside `POST /api/members` in `app/api/members/route.ts`. When `period_type === 'daily'` and the upload's partner is `'Company'`, look up each username's most recent existing row with `period` strictly before today's upload date, and add that baseline's numeric fields onto today's file's values before upserting. Every other path (Monthly uploads, all other partners, non-Company daily uploads) is untouched.

**Tech Stack:** Next.js API route (TypeScript), Supabase (`supabaseAdmin` service-role client), no automated test framework in this project — `npm run build` is the only automated check; verification here is a one-off Node script plus manual UI testing.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-company-daily-additive-members-design.md`
- Scope is `partner === 'Company'` and `period_type === 'daily'` only — do not change behavior for any other partner or for Monthly uploads.
- Fields that add onto the baseline: `deposit`, `withdraw`, `deposit_times`, `withdraw_times`, `company_net_win`. All other fields (status, last_login_time, member_rank, sub_affiliate_name, dsp, etc.) keep today's file's value, unchanged from current behavior.
- `registered_time` / `first_deposit_amount` lock-to-earliest-record behavior (already implemented) must not be touched or broken.
- Baseline lookup must exclude rows with `period >= period` (today's upload date) so that re-uploading the same day twice is idempotent — never double-adds.
- No new database table, no new UI toggle. The existing Daily/Monthly picker in `MembersClient.tsx` is unchanged.

---

### Task 1: Add cumulative-baseline addition to Company daily uploads

**Files:**
- Modify: `app/api/members/route.ts:139-193` (the `POST` function, from its start through the existing `mergedRecords` computation)
- Verify: temporary script `_tmp_verify_company_daily.mjs` in the project root (deleted at the end of this task, not committed)

**Interfaces:**
- Consumes: existing `fetchAllMembers(partner, columns, periodFilter?)` helper (already defined above `POST` in this file, unchanged signature).
- Produces: no new exports — this is a behavior change inside the existing `POST` handler. The request/response shape of `POST /api/members` is unchanged (`{ records, period, period_type }` in, `{ count }` out).

- [ ] **Step 1: Read the current implementation to confirm line numbers haven't drifted**

Open `app/api/members/route.ts` and confirm the `POST` function still matches this shape (existingMap computed, then `mergedRecords` built, then dedup, then batched upsert). If it has changed, adjust the edit below to match the current code rather than blindly pasting.

- [ ] **Step 2: Insert the baseline computation and modify `mergedRecords`**

In the `POST` function, right after the existing `existingMap` loop (the block that ends with the closing `}` of `for (const e of existingRows) { ... }`) and before the `// Replace all fields...` comment, insert:

```ts
    // Company's daily uploads report that day's NEW activity, not a running total — its
    // source report can only be pulled for a bounded window, so we can't just re-pull a
    // full snapshot indefinitely. Find each username's last cumulative total from before
    // today (any earlier period, any period_type) and add today's delta onto it. Excluding
    // period >= today makes same-day re-uploads idempotent: re-running today always
    // recomputes from the same untouched prior baseline.
    const cumulativeBaseline: Record<string, any> = {}
    if (period_type === 'daily' && partnerVal === 'Company') {
      const priorRows = await fetchAllMembers(
        partnerVal,
        'username, period, deposit, withdraw, deposit_times, withdraw_times, company_net_win'
      )
      for (const r of priorRows as any[]) {
        if (r.period == null || r.period >= period) continue
        const existing = cumulativeBaseline[r.username]
        if (!existing || r.period > existing.period) cumulativeBaseline[r.username] = r
      }
    }
```

Then replace the existing `mergedRecords` block:

```ts
    const mergedRecords = records.map((r: any) => {
      const ex = existingMap[r.username]
      const base = ex
        ? {
            ...r,
            registered_time: ex.registered_time || r.registered_time,
            first_deposit_amount: ex.first_deposit_amount || r.first_deposit_amount,
          }
        : r
      return { ...base, period, period_type: period_type || null }
    })
```

with:

```ts
    const mergedRecords = records.map((r: any) => {
      const ex = existingMap[r.username]
      let base = ex
        ? {
            ...r,
            registered_time: ex.registered_time || r.registered_time,
            first_deposit_amount: ex.first_deposit_amount || r.first_deposit_amount,
          }
        : r
      const baseline = cumulativeBaseline[r.username]
      if (baseline) {
        base = {
          ...base,
          deposit: (baseline.deposit || 0) + (r.deposit || 0),
          withdraw: (baseline.withdraw || 0) + (r.withdraw || 0),
          deposit_times: (baseline.deposit_times || 0) + (r.deposit_times || 0),
          withdraw_times: (baseline.withdraw_times || 0) + (r.withdraw_times || 0),
          company_net_win: (baseline.company_net_win || 0) + (r.company_net_win || 0),
        }
      }
      return { ...base, period, period_type: period_type || null }
    })
```

Leave everything else in the function (the dedup step and the batched upsert loop) untouched.

- [ ] **Step 3: Run the build to catch type errors**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors. If it fails, read the error — the most likely mistake is a typo in a field name (must exactly match the `members` table columns: `deposit`, `withdraw`, `deposit_times`, `withdraw_times`, `company_net_win`).

- [ ] **Step 4: Write a verification script that exercises the real DB with disposable test data**

The `/api/members` route sits behind session-based auth middleware, so hitting it over HTTP requires a logged-in browser session this script doesn't have. Instead, verify the underlying data behavior directly against Supabase using the same service-role client the route itself uses, with a throwaway username that can't collide with real data.

Create `_tmp_verify_company_daily.mjs` in the project root:

```js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const TEST_USERS = ['ZZTEST_DAILY_001', 'ZZTEST_DAILY_002']

async function cleanup() {
  await supabase.from('members').delete().eq('partner', 'Company').in('username', TEST_USERS)
}

// Mirrors the exact logic added to app/api/members/route.ts POST, so this
// script proves the intended arithmetic/date-comparison behaves correctly
// against real Postgres text-column comparisons before wiring it into the route.
async function uploadDay(records, period) {
  const existingRows = []
  {
    const { data } = await supabase.from('members').select('username, registered_time, first_deposit_amount, period').eq('partner', 'Company')
    existingRows.push(...(data || []))
  }
  const existingMap = {}
  for (const e of existingRows) {
    const current = existingMap[e.username]
    if (!current) { existingMap[e.username] = e; continue }
    const eTime = e.registered_time ? new Date(e.registered_time).getTime() : null
    const curTime = current.registered_time ? new Date(current.registered_time).getTime() : null
    if (eTime !== null && (curTime === null || eTime < curTime)) existingMap[e.username] = e
  }

  const cumulativeBaseline = {}
  {
    const { data: priorRows } = await supabase
      .from('members')
      .select('username, period, deposit, withdraw, deposit_times, withdraw_times, company_net_win')
      .eq('partner', 'Company')
    for (const r of priorRows || []) {
      if (r.period == null || r.period >= period) continue
      const existing = cumulativeBaseline[r.username]
      if (!existing || r.period > existing.period) cumulativeBaseline[r.username] = r
    }
  }

  const mergedRecords = records.map((r) => {
    const ex = existingMap[r.username]
    let base = ex ? { ...r, registered_time: ex.registered_time || r.registered_time, first_deposit_amount: ex.first_deposit_amount || r.first_deposit_amount } : r
    const baseline = cumulativeBaseline[r.username]
    if (baseline) {
      base = {
        ...base,
        deposit: (baseline.deposit || 0) + (r.deposit || 0),
        withdraw: (baseline.withdraw || 0) + (r.withdraw || 0),
        deposit_times: (baseline.deposit_times || 0) + (r.deposit_times || 0),
        withdraw_times: (baseline.withdraw_times || 0) + (r.withdraw_times || 0),
        company_net_win: (baseline.company_net_win || 0) + (r.company_net_win || 0),
      }
    }
    return { ...base, period, period_type: 'daily' }
  })

  const { error } = await supabase.from('members').upsert(mergedRecords, { onConflict: 'username,partner,period' })
  if (error) throw error
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) throw new Error(`FAIL ${label}: expected ${expected}, got ${actual}`)
  console.log(`PASS ${label}: ${actual}`)
}

await cleanup()

// Day 1: brand-new user, no baseline
await uploadDay([{ username: 'ZZTEST_DAILY_001', partner: 'Company', sub_affiliate: 'LakiWinMarketing', sub_affiliate_name: 'LakiWin Marketing', status: 'Active', deposit: 100, withdraw: 10, deposit_times: 1, withdraw_times: 1, company_net_win: 90 }], '2099-01-01')
{
  const { data } = await supabase.from('members').select('*').eq('username', 'ZZTEST_DAILY_001').eq('period', '2099-01-01').single()
  assertEqual('day1 deposit', data.deposit, 100)
  assertEqual('day1 withdraw', data.withdraw, 10)
}

// Day 2: existing user adds onto day 1, plus a brand-new user
await uploadDay([
  { username: 'ZZTEST_DAILY_001', partner: 'Company', sub_affiliate: 'LakiWinMarketing', sub_affiliate_name: 'LakiWin Marketing', status: 'Active', deposit: 50, withdraw: 5, deposit_times: 1, withdraw_times: 1, company_net_win: 45 },
  { username: 'ZZTEST_DAILY_002', partner: 'Company', sub_affiliate: 'LakiWinMarketing', sub_affiliate_name: 'LakiWin Marketing', status: 'Active', deposit: 20, withdraw: 2, deposit_times: 1, withdraw_times: 1, company_net_win: 18 },
], '2099-01-02')
{
  const { data: u1 } = await supabase.from('members').select('*').eq('username', 'ZZTEST_DAILY_001').eq('period', '2099-01-02').single()
  assertEqual('day2 user1 deposit (100+50)', u1.deposit, 150)
  assertEqual('day2 user1 withdraw (10+5)', u1.withdraw, 15)
  assertEqual('day2 user1 deposit_times (1+1)', u1.deposit_times, 2)
  assertEqual('day2 user1 company_net_win (90+45)', u1.company_net_win, 135)

  const { data: u2 } = await supabase.from('members').select('*').eq('username', 'ZZTEST_DAILY_002').eq('period', '2099-01-02').single()
  assertEqual('day2 user2 deposit (new user, no baseline)', u2.deposit, 20)
}

// Re-upload day 2 unchanged: must be idempotent, not double-added
await uploadDay([
  { username: 'ZZTEST_DAILY_001', partner: 'Company', sub_affiliate: 'LakiWinMarketing', sub_affiliate_name: 'LakiWin Marketing', status: 'Active', deposit: 50, withdraw: 5, deposit_times: 1, withdraw_times: 1, company_net_win: 45 },
], '2099-01-02')
{
  const { data } = await supabase.from('members').select('*').eq('username', 'ZZTEST_DAILY_001').eq('period', '2099-01-02').single()
  assertEqual('day2 re-upload deposit (still 150, not 200)', data.deposit, 150)
}

await cleanup()
console.log('All checks passed; test rows cleaned up.')
```

- [ ] **Step 5: Run the verification script**

Run: `node --env-file=.env.local _tmp_verify_company_daily.mjs`
Expected: five `PASS` lines followed by `All checks passed; test rows cleaned up.` If any `FAIL` line or thrown error appears, the arithmetic or the `>=` date-string exclusion logic has a bug — fix `app/api/members/route.ts` (not the script, which mirrors the intended route logic) and re-run.

- [ ] **Step 6: Delete the temporary verification script**

Run: `rm _tmp_verify_company_daily.mjs`

This script must not be committed — it was only a throwaway check against disposable test rows, consistent with this project's existing pattern of temporary root-level `.mjs` scripts for one-off DB verification.

- [ ] **Step 7: Commit**

```bash
git add app/api/members/route.ts
git commit -m "$(cat <<'EOF'
Add daily-additive uploads for Company members

LakiWin Marketing's source report can only be pulled for a bounded
window, so a fresh "current totals" snapshot loses history past that
window. Company's daily Members uploads now add deposit/withdraw/GGR
onto the prior cumulative total instead of overwriting it, so each
day's file only needs to report that day's new activity.
EOF
)"
```

- [ ] **Step 8: Manual verification in the running app (do this yourself before relying on it for real data)**

1. Go to the Members page for Company, switch to Daily, pick today's date, and upload a small CSV with one or two real usernames and small deposit/withdraw numbers.
2. Confirm those usernames now show the uploaded numbers (this is their starting baseline, no prior data to add).
3. The next day (or by picking tomorrow's date as a test), upload another small file for the same usernames with different numbers.
4. Confirm the Members page (or the Company performance summary) now shows the SUM of both days for those usernames, not just the latest file's numbers.
5. Re-upload that same second file again unchanged — confirm the totals don't change again (idempotent, no double-count).

---

## Self-Review Notes

- **Spec coverage:** the spec's five numbered behavior points (baseline lookup, addition, new-member insert, locked fields untouched, idempotent same-day re-upload) are all implemented in Task 1 Step 2 and checked in Step 4/5's verification script. The spec's "what does NOT change" section requires no additional tasks — nothing elsewhere in the codebase is touched.
- **Placeholder scan:** no TBD/TODO; all code blocks are complete and copy-pasteable.
- **Type consistency:** field names (`deposit`, `withdraw`, `deposit_times`, `withdraw_times`, `company_net_win`, `period`, `period_type`, `partner`, `username`) match the `members` table columns used elsewhere in `app/api/members/route.ts` and `app/api/performance/route.ts`.
