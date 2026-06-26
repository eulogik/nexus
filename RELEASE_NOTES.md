# Nexus v1.1.0 Release Notes

## 🎉 Highlights

**Nexus 1.1.0 is a major upgrade** that transforms Nexus from a chat-only tool into a real coding agent that can actually build things:

- ✅ Multi-turn agent loop (50 iterations of think → act → observe)
- ✅ Git stage/unstage/discard from within the app
- ✅ Project context from AGENTS.md/.cursorrules/CLAUDE.md
- ✅ Onboarding experience for new users
- ✅ Fix for the "bridge error" that plagued earlier builds
- ✅ Fix for disappearing chat responses

---

## 📥 Downloads

| Platform | Download | Size |
|----------|----------|------|
| **macOS (Apple Silicon)** | [nexus-desktop-aarch64.dmg](https://github.com/eulogik/nexus/releases/download/v1.1.0/nexus-desktop-aarch64.dmg) | 18 MB |
| **macOS (Intel)** | [nexus-desktop-x64.dmg](https://github.com/eulogik/nexus/releases/download/v1.1.0/nexus-desktop-x64.dmg) | 18 MB |
| **Windows** | [nexus-desktop-x64.msi](https://github.com/eulogik/nexus/releases/download/v1.1.0/nexus-desktop-x64.msi) | 16 MB |
| **Linux (Debian)** | [nexus-desktop-amd64.deb](https://github.com/eulogik/nexus/releases/download/v1.1.0/nexus-desktop-amd64.deb) | 20 MB |
| **Linux (AppImage)** | [nexus-desktop-amd64.AppImage](https://github.com/eulogik/nexus/releases/download/v1.1.0/nexus-desktop-amd64.AppImage) | 22 MB |

**Build from source:**
```bash
git clone https://github.com/eulogik/nexus.git
cd nexus && pnpm install && pnpm --filter nexus-desktop tauri dev
```

---

## 🆕 What's New

### Agent Loop v2
The agent can now perform complex multi-step tasks:
```
You: "Build a Next.js blog with admin panel"
Nexus: → reads project structure (glob/grep)
       → creates package.json (write)
       → creates pages (write)
       → creates components (write)
       → runs npm install (bash)
       → shows all changes (diff)
```

### Git Operations
Stage, unstage, or discard changes directly from the diff viewer:
- `stage_file` — Add file to git staging area
- `unstage_file` — Remove file from staging area
- `discard_changes` — Revert file to last commit
- `list_unstaged_files` — List all modified files

### Project Context
Nexus now reads and respects project configuration files:
- `AGENTS.md` — Project-specific agent instructions
- `.cursorrules` — Cursor IDE rules (compatible)
- `CLAUDE.md` — Claude Code project config (compatible)
- `.nexus.md` — Nexus-specific configuration

### Onboarding Page
Beautiful first-time user experience:
- Large "Add Local Directory" button
- "Clone Repository" coming soon
- Clear description of what Nexus can do

### Sidebar Improvements
- Footer with always-visible "Project" button
- Connection status indicator (green dot)
- Project switcher always visible when multiple projects exist

---

## 🐛 Notable Bug Fixes

1. **Bridge script path resolution** — Fixed `bridge.mjs` not being found when app is launched from different directories or read-only DMG mounts
2. **Disappearing chat bubbles** — Fixed race condition where streaming content was cleared before disk reload
3. **Double assistant messages** — Fixed duplicate message creation during save cycle
4. **Session disappearing after send** — Fixed `syncSessions()` resetting active session ID
5. **Save settings crash** — Fixed argument mismatch when calling `save_settings`

---

## 📊 Stats

- **571 tests** passing (no regressions)
- **~18MB** desktop binary
- **1262 lines** of Rust code
- **100%** TypeScript strict mode
- **MIT** licensed

---

## 🔗 Links

- **Website**: https://nexus.ai
- **Documentation**: https://docs.nexus.ai
- **Discord**: https://discord.gg/nexus
- **Twitter**: https://twitter.com/nexus_ai
- **Blog**: https://nexus.ai/blog

---

## 🤝 Thanks

Thanks to all contributors and early adopters! Star ⭐ the repo if Nexus helps you build cool things.

**Full Changelog**: https://github.com/eulogik/nexus/blob/main/CHANGELOG.md
