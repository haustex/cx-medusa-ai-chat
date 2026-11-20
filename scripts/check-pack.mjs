// `npm pack --dry-run` must be clean: what the package needs is in it, nothing
// else is (tests, test app, CI, secrets, notes). Run after `npm run build`.
//
//   node scripts/check-pack.mjs
import { execFileSync } from "node:child_process"

const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" }))
const paths = pack.files.map((file) => file.path)
const problems = []

const REQUIRED = [
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "SECURITY.md",
  ".medusa/server/src/modules/ai-chat/index.js",
  ".medusa/server/src/admin/index.js",
  ".medusa/server/src/admin/index.mjs",
  ".medusa/server/src/api/middlewares.js",
  ".medusa/server/src/api/store/ai-chat/sessions/[id]/messages/route.js",
  ".medusa/server/src/jobs/ai-chat-retention.js",
  ".medusa/server/src/client.js",
  ".medusa/server/src/client.d.ts",
]
const migrations = paths.filter((p) => /\.medusa\/server\/src\/modules\/ai-chat\/migrations\/Migration\d+\.js$/.test(p))
if (migrations.length < 1) problems.push("missing module migrations")
for (const required of REQUIRED) {
  if (!paths.includes(required)) problems.push(`missing ${required}`)
}

const FORBIDDEN = [
  [/(^|\/)__tests__\//, "tests"],
  [/\.spec\.[jt]sx?$/, "tests"],
  [/^integration-tests\//, "the test app"],
  [/^\.github\//, "CI"],
  [/^scripts\//, "repo scripts"],
  [/^src\//, "sources (only the build ships)"],
  [/(^|\/)\.env/, "environment files"],
  [/^CLAUDE\.md$/, "working notes"],
  [/^docs\//, "docs folder"],
]
for (const p of paths) {
  for (const [re, what] of FORBIDDEN) if (re.test(p)) problems.push(`${p} must not be published (${what})`)
}

if (problems.length) {
  console.error("npm pack would be wrong:\n  " + problems.join("\n  "))
  process.exit(1)
}
console.log(`npm pack ok: ${paths.length} files, ${(pack.unpackedSize / 1024).toFixed(0)} KiB unpacked`)
