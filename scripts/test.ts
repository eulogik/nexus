import { execSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

const PACKAGE_DIRS = ["packages", "apps"]

function findPackageWithTests(root: string): string[] {
  const dirs: string[] = []
  try {
    const entries = readdirSync(resolve(root), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pkgPath = resolve(root, entry.name)
        const testDir = resolve(pkgPath, "test")
        const testSrcDir = resolve(pkgPath, "src", "__tests__")
        if (existsSync(testDir) || existsSync(testSrcDir)) {
          dirs.push(pkgPath)
        }
      }
    }
  } catch { /* ignore */ }
  return dirs
}

async function main(): Promise<void> {
  const allDirs = PACKAGE_DIRS.flatMap(findPackageWithTests)

  if (allDirs.length === 0) {
    console.log("No packages with tests found. Running vitest from root...")
    try {
      execSync("pnpm vitest run --coverage", { stdio: "inherit", cwd: process.cwd() })
    } catch {
      process.exit(1)
    }
    return
  }

  let hasFailure = false

  for (const dir of allDirs) {
    const pkgJson = await import(resolve(dir, "package.json"), { with: { type: "json" } })
    const name = pkgJson.default?.name ?? dir.split("/").pop()
    try {
      execSync("pnpm vitest run --coverage", { cwd: dir, stdio: ["inherit", "pipe", "pipe"] })
      console.log(`  ✓ ${name}`)
    } catch (err: unknown) {
      hasFailure = true
      const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? ""
      console.error(`  ✗ ${name}`)
      if (stderr) {
        process.stderr.write(stderr + "\n")
      }
    }
  }

  if (hasFailure) {
    console.error("\nSome test suites failed.")
    process.exit(1)
  }
  console.log("\nAll tests passed.")
}

main().catch((err) => {
  console.error("Test script error:", err)
  process.exit(1)
})
