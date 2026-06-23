import { execSync } from "node:child_process"
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { createInterface } from "node:readline/promises"

const PACKAGE_DIRS = ["packages", "apps"]

function findPackageJsonFiles(): string[] {
  const files: string[] = [resolve("package.json")]
  for (const root of PACKAGE_DIRS) {
    try {
      const entries = readdirSync(resolve(root), { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pkgPath = resolve(root, entry.name, "package.json")
          if (existsSync(pkgPath)) files.push(pkgPath)
        }
      }
    } catch { /* ignore */ }
  }
  return files
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8"))
}

function writeJson(path: string, data: Record<string, unknown>): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n")
}

function bumpVersion(version: string, type: "patch" | "minor" | "major"): string {
  const parts = version.split(".").map(Number)
  if (type === "major") return `${parts[0] + 1}.0.0`
  if (type === "minor") return `${parts[0]}.${(parts[1] ?? 0) + 1}.0`
  return `${parts[0]}.${parts[1] ?? 0}.${(parts[2] ?? 0) + 1}`
}

async function main(): Promise<void> {
  const rootPkg = readJson(resolve("package.json"))
  const currentVersion = rootPkg.version as string

  console.log(`Current version: ${currentVersion}\n`)

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question("Bump type (patch/minor/major): ")
  rl.close()

  const type = answer.trim().toLowerCase() as "patch" | "minor" | "major"
  if (!["patch", "minor", "major"].includes(type)) {
    console.error('Invalid bump type. Use "patch", "minor", or "major".')
    process.exit(1)
  }

  const newVersion = bumpVersion(currentVersion, type)
  console.log(`\nBumping to ${newVersion}...`)

  const pkgFiles = findPackageJsonFiles()
  for (const file of pkgFiles) {
    const pkg = readJson(file)
    if (typeof pkg.version === "string") {
      pkg.version = newVersion
      writeJson(file, pkg)
      console.log(`  updated ${file.replace(process.cwd(), ".")}`)
    }
  }

  try {
    execSync(`git add ${pkgFiles.join(" ")}`, { stdio: "pipe" })
    execSync(`git commit -m "chore: bump version to ${newVersion}"`, { stdio: "pipe" })
    execSync(`git tag v${newVersion}`, { stdio: "pipe" })
    console.log(`\nCreated git tag v${newVersion}`)
  } catch (err) {
    console.warn("\nWarning: git operations failed (not a git repository or no changes staged).")
    const msg = (err as Error).message
    process.stderr.write(`  ${msg}\n`)
  }

  console.log(`\nRelease v${newVersion} ready.`)
  console.log("To publish, run: npm publish or pnpm publish -r")
  console.log("\nRelease Notes Summary:")
  console.log(`  Version: ${newVersion}`)
  console.log(`  Bump:    ${type}`)
  console.log(`  Date:    ${new Date().toISOString().split("T")[0]}`)
}

main().catch((err) => {
  console.error("Release script error:", err)
  process.exit(1)
})
