import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';

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
  try {
    const data = JSON.parse(readFileSync(sessPath, 'utf-8'));
    return data.messages || [];
  } catch {
    return [];
  }
}

function saveSessionMessages(sessPath, sessionMeta, messages) {
  const dir = dirname(sessPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(sessPath, JSON.stringify({ ...sessionMeta, messages }, null, 2));
}

const SYSTEM_PROMPT = `You are Nexus, a coding agent with file system access. You MUST use the provided tools to accomplish tasks. NEVER just describe what you would do — actually DO it by calling tools.

Project directory: ${projectPath}

CRITICAL RULES:
1. When the user asks to create, modify, or run something, you MUST call the appropriate tool.
2. NEVER respond with text like "I can't" or "Please use the tool" — just call the tool.
3. When building a project, create ALL files needed for it to work (package.json, config, source files, etc.).
4. After creating files, run setup commands like "npm install".
5. Use relative paths for all file operations (e.g. "package.json", "src/index.js").
6. Build complete, working projects. Do not stop until everything is set up and working.
7. You can call multiple tools in a single response if needed.`;


const tools = [
  {
    type: 'function',
    function: {
      name: 'write',
      description: 'Create or overwrite a file. Use this to create new files or replace existing ones.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Relative file path (e.g. "package.json", "src/index.js")' },
          content: { type: 'string', description: 'Complete file content' },
          overwrite: { type: 'boolean', description: 'Overwrite existing file (default: false)' },
        },
        required: ['file_path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read',
      description: 'Read file contents',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Relative file path to read' },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: 'Edit a file by replacing exact text. Use this for precise, surgical edits.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Relative file path to edit' },
          old_string: { type: 'string', description: 'Exact text to find (must match exactly)' },
          new_string: { type: 'string', description: 'Replacement text' },
        },
        required: ['file_path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Execute a shell command. Use for running builds, installs, git, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          workdir: { type: 'string', description: 'Working directory (defaults to project root)' },
          timeout: { type: 'number', description: 'Timeout in ms (default: 30000)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: 'Find files matching a glob pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts", "src/**/*.js")' },
          path: { type: 'string', description: 'Directory to search (defaults to project root)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search file contents using regex',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          path: { type: 'string', description: 'File or directory to search (defaults to project root)' },
        },
        required: ['pattern'],
      },
    },
  },
];

const blockedCommands = ['sudo', 'su ', 'chmod', 'chown', 'passwd', 'shutdown', 'reboot', 'kill -9'];
const blockedSubstrings = ['rm -rf /', 'rm -rf ~', ':(){ :|:& };:', '> /dev/sda', '| sh', '| bash'];

function isBlocked(cmd) {
  return blockedCommands.some(b => cmd.includes(b)) || blockedSubstrings.some(b => cmd.includes(b));
}

function resolvePath(p) {
  if (!p) return projectPath;
  return p.startsWith('/') ? resolve(p) : resolve(projectPath, p);
}

async function executeTool(name, args) {
  try {
    switch (name) {
      case 'read': {
        const fp = resolvePath(args.file_path);
        if (!existsSync(fp)) return `File not found: ${args.file_path}`;
        return readFileSync(fp, 'utf-8');
      }
      case 'write': {
        const fp = resolvePath(args.file_path);
        if (existsSync(fp) && !args.overwrite) return `File exists. Use overwrite=true.`;
        mkdirSync(dirname(fp), { recursive: true });
        writeFileSync(fp, args.content);
        return `Written: ${args.file_path}`;
      }
      case 'edit': {
        const fp = resolvePath(args.file_path);
        if (!existsSync(fp)) return `File not found: ${args.file_path}`;
        const c = readFileSync(fp, 'utf-8');
        if (!c.includes(args.old_string)) return `Not found: "${args.old_string}"`;
        writeFileSync(fp, c.replace(args.old_string, args.new_string));
        return `Edited: ${args.file_path}`;
      }
      case 'bash': {
        if (isBlocked(args.command)) return `Blocked: ${args.command}`;
        return execSync(args.command, {
          cwd: args.workdir || projectPath,
          timeout: args.timeout || 30000,
          encoding: 'utf-8',
        }).trim();
      }
      case 'glob': {
        const sp = resolvePath(args.path);
        const r = execSync(`find "${sp}" -name "${args.pattern}" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -50`, {
          encoding: 'utf-8', timeout: 10000,
        });
        return r || 'No files found';
      }
      case 'grep': {
        const sp = resolvePath(args.path);
        const r = execSync(`rg --no-heading -n "${args.pattern}" "${sp}" -l --max-count=20 2>/dev/null || true`, {
          encoding: 'utf-8', timeout: 10000,
        });
        return r || 'No matches found';
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e) {
    return `Error: ${e.message}`;
  }
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

async function callLLM(messages, modelUsed) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelUsed,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 8192,
      stream: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status} ${t}`);
  }
  return res;
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
    ...existingMessages.map(m => {
      if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.toolCallId || m.id, content: m.result?.output || m.result?.error || m.content || '' };
      }
      if (m.role === 'assistant' && m.toolCalls) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.tool, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }
      return { role: m.role, content: m.content };
    }),
    { role: 'user', content },
  ];

  if (existingMessages.length === 0) {
    messages.splice(1, 0,
      { role: 'assistant', content: null, tool_calls: [{ id: 'priming', type: 'function', function: { name: 'read', arguments: '{"file_path":"README.md"}' } }] },
      { role: 'tool', tool_call_id: 'priming', content: 'No README found.' }
    );
  }

  const allMessages = [...messages];
  const savedMessages = existingMessages.slice();
  const MAX_ITERATIONS = 50;
  let inputTokens = messages.reduce((sum, m) => sum + Math.ceil((m.content || '').length / 4), 0);
  let outputTokens = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const res = await callLLM(allMessages, modelUsed);
    const reader = res.body;

    let textContent = '';
    const toolCallsMap = {};

    for await (const chunk of parseSSE(reader)) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (delta?.content) {
        textContent += delta.content;
        outputTokens += Math.ceil(delta.content.length / 4);
        for (const ch of delta.content) emit('stream-token', ch);
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index || 0;
          if (!toolCallsMap[idx]) {
            toolCallsMap[idx] = { id: tc.id || randomUUID(), name: tc.function?.name || '', args: '' };
          }
          if (tc.function?.arguments) {
            toolCallsMap[idx].args += tc.function.arguments;
          }
        }
      }

      if (choice.finish_reason) break;
    }

    const toolCalls = Object.values(toolCallsMap);

    if (toolCalls.length === 0) {
      savedMessages.push({ id: randomUUID(), session_id: sessionId, role: 'assistant', content: textContent, timestamp: new Date().toISOString() });
      allMessages.push({ role: 'assistant', content: textContent });
      saveSessionMessages(sessionFile, sessionMeta, savedMessages);
      emit('stream-success', { success: true });
      return;
    }

    savedMessages.push({
      id: randomUUID(), session_id: sessionId, role: 'assistant', content: textContent || null, timestamp: new Date().toISOString(),
    });
    allMessages.push({
      role: 'assistant', content: textContent || null,
      tool_calls: toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.args } })),
    });

    for (const tc of toolCalls) {
      let parsedArgs = {};
      try { parsedArgs = JSON.parse(tc.args || '{}'); } catch {}

      emit('tool-call', { tool: tc.name, args: parsedArgs });
      const result = await executeTool(tc.name, parsedArgs);
      emit('tool-result', { tool: tc.name, result });

      allMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
  }

  const finalMessages = allMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      id: randomUUID(),
      session_id: sessionId,
      role: m.role,
      content: m.content || '',
      timestamp: new Date().toISOString(),
    }));
  saveSessionMessages(sessionFile, sessionMeta, finalMessages);
  emit('stream-success', { success: true, inputTokens: inputTokens, outputTokens: outputTokens });
}

main().catch((err) => {
  emit('stream-error', { success: false, error: err.message });
  process.exit(1);
});
