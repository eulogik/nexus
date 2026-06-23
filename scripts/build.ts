import { execSync } from "node:child_process"
import { readdirSync, existsSync, rmSync } from "node:fs"
import { resolve } from "node:path"

const PACKAGE_DIRS = ["packages", "apps"]

function findPackageJsonDirs(root: string): string[] {
  const dirs: string[] = []
  try {
    const entries = readdirSync(resolve(root), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pkgPath = resolve(root, entry.name)
        if (existsSync(resolve(pkgPath, "package.json"))) {
          dirs.push(pkgPath)
        }
      }
    }
  } catch { /* ignore */ }
  return dirs
}

function cleanDist(dirs: string[]): void {
  for (const dir of dirs) {
    const distPath = resolve(dir, "dist")
    if (existsSync(distPath)) {
      rmSync(distPath, { recursive: true, force: true })
      console.log(`  cleaned ${dir.replace(process.cwd(), ".")}/dist`)
    }
  }
}

async function main(): Promise<void> {
  const allDirs = PACKAGE_DIRS.flatMap(findPackageJsonDirs)

  console.log("Cleaning dist directories...")
  cleanDist(allDirs)
  console.log("")

  console.log("Running TypeScript compilation across all packages...\n")

  let hasFailure = false

  for (const dir of allDirs) {
    const pkgJson = await import(resolve(dir, "package.json"), { with: { type: "json" } })
    const name = pkgJson.default?.name ?? dir.split("/").pop()
    try {
      execSync("pnpm exec tsc", { cwd: dir, stdio: ["inherit", "pipe", "pipe"] })
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

  console.log("")
  if (hasFailure) {
    console.error("Build completed with failures.")
    process.exit(1)
  }
  console.log("All packages built successfully.")
}

main().catch((err) => {
  console.error("Build script error:", err)
  process.exit(1)
})
