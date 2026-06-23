import { execSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

interface BenchmarkResult {
  name: string
  durationMs: number
  iterations: number
}

interface BenchmarkSuite {
  timestamp: string
  system: string
  nodeVersion: string
  results: BenchmarkResult[]
}

function measure(name: string, fn: () => void, iterations = 10): BenchmarkResult {
  const start = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) {
    fn()
  }
  const end = process.hrtime.bigint()
  const durationMs = Number(end - start) / 1e6 / iterations
  return { name, durationMs: Math.round(durationMs * 100) / 100, iterations }
}

function benchmarkCliColdStart(): BenchmarkResult {
  return measure("CLI cold start (--help)", () => {
    try {
      execSync("node dist/index.js --help", {
        cwd: resolve("apps/nexus-cli"),
        stdio: "pipe",
        timeout: 30_000,
      })
    } catch { /* expected for cold start timing */ }
  }, 5)
}

function benchmarkCompression(): BenchmarkResult[] {
  const samples: Record<string, string> = {
    "JSON (package.json)": JSON.stringify({
      name: "test",
      version: "1.0.0",
      dependencies: { a: "^1.0.0", b: "^2.0.0", c: "^3.0.0" },
      scripts: { build: "tsc", test: "vitest" },
    }),
    Code (100 lines): Array.from({ length: 100 }, (_, i) =>
      `function func${i}(a: number, b: number): number { return a + b + ${i}; }`
    ).join("\n"),
    Prose (Lorem ipsum): Array.from({ length: 50 }, (_, i) =>
      `Paragraph ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`
    ).join("\n\n"),
  }

  const results: BenchmarkResult[] = []

  for (const [label, content] of Object.entries(samples)) {
    const result = measure(`Compress ${label}`, () => {
      try {
        execSync(
          `node -e "
            const { SmartCrusher } = require('./packages/nexus-compress/dist/index.js');
            const crusher = new SmartCrusher();
            crusher.compress(JSON.parse(process.argv[1]));
          "`,
          {
            input: JSON.stringify({ text: content }),
            stdio: "pipe",
            timeout: 10_000,
          }
        )
      } catch { /* expected */ }
    }, 3)
    results.push(result)
  }

  return results
}

interface BenchmarkEntry {
  name: string
  results: BenchmarkResult[]
}

async function main(): Promise<void> {
  console.log("Nexus Benchmark Suite\n")
  console.log(`${"─".repeat(70)}\n`)

  const entries: BenchmarkEntry[] = []

  console.log("1. CLI Cold Start\n")
  const cliResult = benchmarkCliColdStart()
  console.log(`   ${cliResult.name}: ${cliResult.durationMs}ms (avg of ${cliResult.iterations})`)
  entries.push({ name: "CLI", results: [cliResult] })

  console.log("\n2. Compression\n")
  const compressionResults = benchmarkCompression()
  for (const r of compressionResults) {
    console.log(`   ${r.name}: ${r.durationMs}ms (avg of ${r.iterations})`)
  }
  entries.push({ name: "Compression", results: compressionResults })

  console.log(`\n${"─".repeat(70)}`)

  const suite: BenchmarkSuite = {
    timestamp: new Date().toISOString(),
    system: `${process.platform} ${process.arch}`,
    nodeVersion: process.version,
    results: entries.flatMap((e) => e.results),
  }

  const benchmarkDir = resolve(process.cwd(), ".nexus", "benchmarks")
  if (!existsSync(benchmarkDir)) {
    mkdirSync(benchmarkDir, { recursive: true })
  }

  const outPath = resolve(benchmarkDir, "latest.json")
  writeFileSync(outPath, JSON.stringify(suite, null, 2))
  console.log(`\nResults saved to .nexus/benchmarks/latest.json`)
}

main().catch((err) => {
  console.error("Benchmark error:", err)
  process.exit(1)
})
