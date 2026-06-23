#!/usr/bin/env tsx
import { mkdir, open, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MODEL_DIR = join(homedir(), '.nexus', 'models');
const MODELS: Record<string, { url: string; size: string; description: string }> = {
  'qwen3.5-0.5b-instruct-q4_k_m': {
    url: 'https://huggingface.co/Qwen/Qwen3.5-0.5B-Instruct-GGUF/resolve/main/qwen3.5-0.5b-instruct-q4_k_m.gguf',
    size: '~300MB',
    description: 'Default routing model (0.5B, Q4_K_M)',
  },
  'qwen3.5-0.5b-instruct-q8_0': {
    url: 'https://huggingface.co/Qwen/Qwen3.5-0.5B-Instruct-GGUF/resolve/main/qwen3.5-0.5b-instruct-q8_0.gguf',
    size: '~500MB',
    description: 'Higher quality routing model (0.5B, Q8_0)',
  },
};

async function main() {
  const modelName = process.argv[2] || 'qwen3.5-0.5b-instruct-q4_k_m';
  const model = MODELS[modelName];

  if (!model) {
    console.error(`Unknown model: ${modelName}`);
    console.error('Available models:');
    for (const [name, info] of Object.entries(MODELS)) {
      console.error(`  ${name} — ${info.description} (${info.size})`);
    }
    process.exit(1);
  }

  const dest = join(MODEL_DIR, `${modelName}.gguf`);

  if (existsSync(dest)) {
    const stats = (await import('node:fs')).statSync(dest);
    console.log(`Model already exists at ${dest} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
    console.log('To re-download, delete the file first.');
    process.exit(0);
  }

  console.log(`Downloading ${modelName}...`);
  console.log(`URL: ${model.url}`);
  console.log(`Size: ${model.size}`);
  console.log(`Destination: ${dest}`);
  console.log();

  await mkdir(MODEL_DIR, { recursive: true });

  const response = await fetch(model.url);
  if (!response.ok) {
    console.error(`Download failed: HTTP ${response.status} ${response.statusText}`);
    console.error('Check the URL or your network connection.');
    process.exit(1);
  }

  const total = parseInt(response.headers.get('content-length') || '0');
  const file = await open(dest, 'w');
  const reader = response.body!.getReader();
  let downloaded = 0;
  const startTime = Date.now();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await file.write(value);
      downloaded += value.length;
      if (total > 0) {
        const progress = ((downloaded / total) * 100).toFixed(1);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const speed = (downloaded / 1024 / 1024 / (Date.now() - startTime) * 1000).toFixed(1);
        process.stdout.write(`\r${progress}% — ${(downloaded / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB — ${speed} MB/s — ${elapsed}s`);
      } else {
        process.stdout.write(`\rDownloaded ${(downloaded / 1024 / 1024).toFixed(1)}MB`);
      }
    }
  } finally {
    await file.close();
  }

  console.log('\n\nDownload complete!');
  console.log(`Model saved to: ${dest}`);

  const finalStats = (await import('node:fs')).statSync(dest);
  console.log(`File size: ${(finalStats.size / 1024 / 1024).toFixed(1)}MB`);
  console.log(`Elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('Download failed:', err.message);
  process.exit(1);
});
