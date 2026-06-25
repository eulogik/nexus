import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';

function collectProjectContext(projectPath) {
  const contextFiles = ['AGENTS.md', '.cursorrules', 'CLAUDE.md', '.nexus.md'];
  const parts = [];
  for (const file of contextFiles) {
    const filePath = resolve(projectPath, file);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8').trim();
        if (content) parts.push(`<${file}>\n${content}\n</${file}>`);
      } catch {}
    }
  }
  if (parts.length === 0) return '';
  return `## Project Configuration\n\n${parts.join('\n\n")}\n\nFollow the above project rules and conventions.\n`;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = JSON.parse(process.argv[2]);
const { sessionId, projectPath, content, apiKey, model, projectId } = args;

function emit(type, data) {
  process.stdout.write(JSON.stringify({ type, data }) + '\n');
}

function nexusDir() {
  const h = homedir();
  if (process.platform === 'darwin') return resolve(h, 'Library/Application Support/nexus');
  if (process.platform === 'win32') return resolve(process.env.APPDATA || h, 'nexus');
  return resolve(h, '.config/nexus');
}

function loadSessionMessages(sessPath) {
  if (!existsSync(sessPath)) return [];
  try { return JSON.parse(readFileSync(sessPath, 'utf-8')).messages || []; } catch { return []; }
}

function saveSessionMessages(sessPath, sessionMeta, messages) {
  const dir = dirname(sessPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(sessPath, JSON.stringify({ ...sessionMeta, messages }, null, 2));
}

const SYSTEM_PROMPT = `You are Nexus, a coding agent with file system access. You have tools that the system will execute for you. When you need to perform an action, call the appropriate tool using the function calling interface.

Project directory: ${projectPath}

${collectProjectContext(projectPath)}

CRITICAL RULES:
1. ALWAYS use tools when the user asks to create, modify, or run something.
2. NEVER say "I can't" or describe what you would do — just call the tool.
3. When building a project, create ALL files needed for it to work.
4. After creating files, run setup commands like "npm install".
5. Use relative paths (e.g. "package.json", "src/index.js").
6. Build complete, working projects. Do not stop until everything is set up.
7. You can call multiple tools in a single response if needed.`;

const tools = [
  { type: 'function', function: { name: 'write', description: 'Create or overwrite a file.', parameters: { type: 'object', properties: { file_path: { type: 'string', description: 'Relative file path' }, content: { type: 'string', description: 'File content' }, overwrite: { type: 'boolean', description: 'Overwrite existing' } }, required: ['file_path', 'content'] } } },
  { type: 'function', function: { name: 'read', description: 'Read file contents.', parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] } } },
  { type: 'function', function: { name: 'edit', description: 'Edit file by replacing exact text.', parameters: { type: 'object', properties: { file_path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['file_path', 'old_string', 'new_string'] } } },
  { type: 'function', function: { name: 'bash', description: 'Execute a shell command.', parameters: { type: 'object', properties: { command: { type: 'string' }, workdir: { type: 'string' }, timeout: { type: 'number' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'glob', description: 'Find files matching a glob pattern.', parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'grep', description: 'Search file contents using regex.', parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] } } },
];

const blockedCommands = ['sudo', 'su ', 'chmod', 'chown', 'passwd', 'shutdown', 'reboot', 'kill -9'];
const blockedSubstrings = ['rm -rf /', 'rm -rf ~', ':(){ :|:& };:', '> /dev/sda', '| sh', '| bash'];
function isBlocked(cmd) { return blockedCommands.some(b => cmd.includes(b)) || blockedSubstrings.some(b => cmd.includes(b)); }
function resolvePath(p) { return !p ? projectPath : p.startsWith('/') ? resolve(p) : resolve(projectPath, p); }

async function executeTool(name, rawArgs) {
  let p = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs || {};
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = {}; } }
  try {
    switch (name) {
      case 'read': { const fp = resolvePath(p.file_path); return existsSync(fp) ? readFileSync(fp, 'utf-8') : 'File not found'; }
      case 'write': {
        const fp = resolvePath(p.file_path);
        if (existsSync(fp) && !p.overwrite) return 'File exists. Use overwrite=true.';
        mkdirSync(dirname(fp), { recursive: true });
        const c = typeof p.content === 'string' ? p.content.replace(/\\n/g, '\n').replace(/\\t/g, '\t') : String(p.content);
        writeFileSync(fp, c);
        return `Written: ${p.file_path}`;
      }
      case 'edit': {
        const fp = resolvePath(p.file_path);
        if (!existsSync(fp)) return 'File not found';
        const c = readFileSync(fp, 'utf-8');
        if (!c.includes(p.old_string)) return `Not found: "${p.old_string}"`;
        writeFileSync(fp, c.replace(p.old_string, p.new_string));
        return `Edited: ${p.file_path}`;
      }
      case 'bash': {
        if (isBlocked(p.command)) return `Blocked: ${p.command}`;
        return execSync(p.command, { cwd: p.workdir || projectPath, timeout: p.timeout || 30000, encoding: 'utf-8' }).trim();
      }
      case 'glob': {
        const sp = resolvePath(p.path);
        const r = execSync(`find "${sp}" -name "${p.pattern}" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -50`, { encoding: 'utf-8', timeout: 10000 });
        return r || 'No files found';
      }
      case 'grep': {
        const sp = resolvePath(p.path);
        const r = execSync(`rg --no-heading -n "${p.pattern}" "${sp}" -l --max-count=20 2>/dev/null || true`, { encoding: 'utf-8', timeout: 10000 });
        return r || 'No matches found';
      }
      default: return `Unknown tool: ${name}`;
    }
  } catch (e) { return `Error: ${e.message}`; }
}

async function callLLM(messages, modelUsed) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelUsed, messages, tools,       tool_choice: 'auto', temperature: 0.2, max_tokens: 8192, stream: true }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res;
}

async function* parseSSE(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const d = line.slice(6).trim();
        if (d === '[DONE]') return;
        try { yield JSON.parse(d); } catch {}
      }
    }
  }
}

async function main() {
  const sessionDir = resolve(nexusDir(), 'projects', projectId, 'sessions');
  const sessionFile = resolve(sessionDir, `${sessionId}.json`);
  const sessionMeta = existsSync(sessionFile)
    ? (() => { const d = JSON.parse(readFileSync(sessionFile, 'utf-8')); return { id: d.id || sessionId, name: d.name || 'Session 1', created_at: d.created_at || new Date().toISOString() }; })()
    : { id: sessionId, name: 'Session 1', created_at: new Date().toISOString() };
  const existingMessages = loadSessionMessages(sessionFile);
  const modelUsed = model || 'openai/gpt-4o-mini';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...existingMessages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content },
  ];

  if (existingMessages.length === 0) {
    messages.splice(1, 0,
      { role: 'assistant', content: null, tool_calls: [{ id: 'priming1', type: 'function', function: { name: 'read', arguments: '{"file_path":"README.md"}' } }] },
      { role: 'tool', tool_call_id: 'priming1', content: 'No README found.' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'priming2', type: 'function', function: { name: 'write', arguments: '{"file_path":"hello.txt","content":"Hello World","overwrite":true}' } }] },
      { role: 'tool', tool_call_id: 'priming2', content: 'Written: hello.txt' },
      { role: 'assistant', content: 'I created the file hello.txt with "Hello World" content.' }
    );
  }

  const allMessages = [...messages];
  const MAX_ITERATIONS = 50;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const res = await callLLM(allMessages, modelUsed);
    let textContent = '';
    const toolCallsMap = {};

    for await (const chunk of parseSSE(res.body)) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;
      if (delta?.content) { textContent += delta.content; for (const ch of delta.content) emit('stream-token', ch); }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index || 0;
          if (!toolCallsMap[idx]) toolCallsMap[idx] = { id: tc.id || randomUUID(), name: tc.function?.name || '', args: '' };
          if (tc.function?.arguments) toolCallsMap[idx].args += tc.function.arguments;
        }
      }
      if (choice.finish_reason) break;
    }

    const toolCalls = Object.values(toolCallsMap);

    if (toolCalls.length === 0) {
      allMessages.push({ role: 'assistant', content: textContent });
      saveAllMessages(allMessages, sessionFile, sessionMeta);
      emit('stream-success', { success: true });
      return;
    }

    allMessages.push({ role: 'assistant', content: textContent || null, tool_calls: toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.args } })) });

    for (const tc of toolCalls) {
      let parsed = {};
      try { parsed = JSON.parse(tc.args || '{}'); } catch {}
      emit('tool-call', { tool: tc.name, args: parsed });
      const result = await executeTool(tc.name, tc.args);
      emit('tool-result', { tool: tc.name, result });
      allMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
  }

  saveAllMessages(allMessages, sessionFile, sessionMeta);
  emit('stream-success', { success: true });
}

function saveAllMessages(allMessages, sessionFile, sessionMeta) {
  const toSave = allMessages
    .filter(m => m.role !== 'system')
    .map(m => ({
      id: m.id || randomUUID(),
      session_id: m.session_id || sessionId,
      role: m.role,
      content: m.content || '',
      timestamp: m.timestamp || new Date().toISOString(),
      tool_calls: m.tool_calls || undefined,
      tool_call_id: m.tool_call_id || undefined,
    }));
  saveSessionMessages(sessionFile, sessionMeta, toSave);
}

main().catch((err) => { emit('stream-error', { success: false, error: err.message }); process.exit(1); });
