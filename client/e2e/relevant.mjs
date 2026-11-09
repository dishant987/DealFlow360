// Run only the e2e specs that cover what you changed (vs main), plus the smoke
// and company-isolation specs. Shared plumbing changes run everything.
//   npm run test:e2e:relevant            # compare with main
//   npm run test:e2e:relevant -- HEAD~1  # compare with another ref
//   E2E_DRY=1 npm run test:e2e:relevant  # only print which specs would run
// CI always runs the full suite; this is for the edit → check loop.
import { execSync, spawnSync } from 'node:child_process'

const base = process.argv[2] || 'main'
const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim()
// E2E_FILES=a,b simulates a change list (to check the mapping)
const changed = process.env.E2E_FILES ? process.env.E2E_FILES.split(',') : [
  ...git(`diff --name-only ${base}...HEAD`).split('\n'),
  ...git('diff --name-only HEAD').split('\n'), // uncommitted edits too
  ...git('ls-files --others --exclude-standard').split('\n'),
].filter(Boolean)

// anything here can break any screen: run the whole suite
const EVERYTHING = [
  /^server\/src\/config\//, /^server\/src\/middlewares\//, /^server\/src\/models\//, /^server\/drizzle\//,
  /^server\/src\/app\.ts$/, /^server\/src\/utils\/crud\.ts$/, /^client\/e2e\/helpers\.ts$/,
  /^client\/playwright\.config\.ts$/, /^client\/src\/(main|App)\.tsx$/, /^client\/src\/lib\/api\.ts$/,
  /^client\/src\/hooks\/useAuth\.ts$/,
]

// source path pattern -> spec files that exercise it
const MAP = [
  [/auth|mfa|google|totp|token|Login|Signup|Password|Profile|TwoFactor/i, ['01-auth', '18-mfa']],
  [/roles|requireRole|ProtectedRoute|AppShell|navFor/i, ['02-rbac', '11-role-capabilities', '16-shell']],
  [/quotation|QuotationBuilder|Quotations|pricing|risk|lines/i, ['03-quote-builder', '10-guards', '13-filters']],
  [/approval|Approvals|ApprovalDetail/i, ['04-approval', '13-filters']],
  [/fulfil|Fulfillment|replenish|stock|StockPanel/i, ['05-fulfillment']],
  [/billing|invoice|Invoice|subscription|Subscriptions/i, ['06-billing']],
  [/portal|Portal|mailer/i, ['07-portal']],
  [/config|Admin|ResourceManager|report|Reports/i, ['08-config-reports', '17-permissions']],
  [/socket|useLiveUpdates/i, ['12-live-updates']],
  [/notification|NotificationBell/i, ['14-notifications']],
  [/Landing|ThemeToggle|index\.css|theme/i, ['15-landing']],
  [/CommandPalette|AppShell/i, ['16-shell']],
  [/import|ImportDialog/i, ['19-import']],
  [/dashboard|Dashboard|DealHealth|anomaly/i, ['11-role-capabilities']],
]
const ALWAYS = ['09-smoke', '20-tenancy']

const code = changed.filter((f) => /^(server|client)\//.test(f) && !/\.md$/.test(f))
let specs
if (code.some((f) => EVERYTHING.some((re) => re.test(f)))) {
  console.log('Shared plumbing changed → running the full suite.')
  specs = []
} else {
  const set = new Set(ALWAYS)
  for (const f of code) {
    const m = f.match(/^client\/e2e\/(\d\d-[\w-]+)\.spec\.ts$/)
    if (m) set.add(m[1]) // an edited spec always runs
    for (const [re, list] of MAP) if (re.test(f)) list.forEach((s) => set.add(s))
  }
  specs = [...set].sort().map((s) => `e2e/${s}.spec.ts`)
  console.log(`Changed (vs ${base}): ${code.length} file(s) → ${specs.length} spec file(s):\n  ${specs.join('\n  ')}`)
}

if (process.env.E2E_DRY) process.exit(0) // just show the selection
const r = spawnSync('npx', ['playwright', 'test', ...specs, ...process.argv.slice(3)], { stdio: 'inherit', shell: true })
process.exit(r.status ?? 1)
