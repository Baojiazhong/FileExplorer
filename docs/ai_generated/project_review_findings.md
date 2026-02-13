# Fast File Explorer - Project Review (AI-generated)

This document captures what we discovered so far while scanning the repository, plus a prioritized list of issues and improvement opportunities.

## Goal

- Review this Tauri (Rust backend) + React (Vite) file explorer project.
- Identify things that likely need fixes or could be improved.
- Record findings in `docs/ai_generated/`.

## Scope / What We Did

- Read key project documentation and configs: `README.md`, `package.json`, `vite.config.js`, `.gitignore`, GitHub Actions workflows.
- Reviewed Tauri/Rust configuration and capability policy: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`.
- Spot-checked key Rust command modules and several React providers/components where `invoke()` is used.
- Verified `docs/ai_generated/` exists and is currently empty.

## Repository Shape (High-level)

- Frontend (React): `src/`
  - Components: e.g. `src/components/terminal/Terminal.jsx`, `src/components/thisPc/ThisPCView.jsx`, `src/components/sidebar/Sidebar.jsx`
  - Providers: e.g. `src/providers/FileSystemProvider.jsx`, `src/providers/ContextMenuProvider.jsx`, `src/providers/SettingsProvider.jsx`, `src/providers/SftpProvider.jsx`
  - Utilities: e.g. `src/utils/fileOperations.js`, `src/utils/mockTauriAPI.js`
  - Build: Vite (`package.json`, `vite.config.js`)

- Backend (Rust/Tauri): `src-tauri/`
  - Commands: `src-tauri/src/commands/*`
  - Search engine: `src-tauri/src/search_engine/*`
  - Tauri entrypoint: `src-tauri/src/main.rs`

## Environment Note

- `rg` (ripgrep) appears unavailable in the current environment (`rg: command not found`). For future searches, prefer the project tooling (`functions.grep`) or a system alternative.

## Findings (Prioritized)

### Blockers / High-risk runtime failures

1) Tauri `invoke()` command names and/or parameter names likely mismatch Rust command signatures

- Symptoms: front-end calls may fail at runtime with "command not found" or "missing required key" errors.
- Examples to verify and reconcile:
  - `open_file`
    - Rust command exists in `src-tauri/src/commands/file_system_operation_commands.rs`.
    - But `open_file` appears commented out in the command handler list in `src-tauri/src/main.rs`, while the frontend still calls it.
  - `rename` params
    - Rust signature appears to use `old_path` / `new_path`.
    - Frontend code sometimes uses `oldPath` / `newPath`.
  - `copy_file_or_dir` params
    - Rust signature appears to use `source_path` / `destination_path`.
    - Frontend code sometimes uses `sourcePath` / `destinationPath`.
  - `reset_settings`
    - Frontend uses `reset_settings` (e.g. `src/providers/SettingsProvider.jsx`).
    - Backend command is named `reset_settings_command` (e.g. `src-tauri/src/commands/settings_commands.rs`).

2) Mock API may hide real invoke problems

- `src/utils/mockTauriAPI.js` implements certain commands (including `reset_settings`), which can make UI flows look correct in mock mode while failing against the real Rust backend.

### Security / Privacy risks

3) Arbitrary shell command execution is exposed

- `src-tauri/src/commands/command_exec_commands.rs` provides `execute_command*` commands.
- `src-tauri/capabilities/default.json` includes `shell:default`.
- This combination is powerful but high-risk: it can become a local RCE surface if untrusted input reaches it (e.g., via terminal UI, path injection, or future plugins).
- Recommendation: decide on a security posture:
  - restrict to an allowlist of commands/arguments,
  - require explicit user confirmation for sensitive operations,
  - or disable/remove shell capability in production builds.

4) Terminal output is rendered as HTML

- `src/components/terminal/Terminal.jsx` uses `dangerouslySetInnerHTML`.
- If command output can contain user-controlled content, this can become an XSS vector.
- Recommendation: render as plain text, or sanitize with a strict allowlist if rich formatting is required.

5) SFTP credentials stored in `localStorage`

- `src/providers/SftpProvider.jsx` loads SFTP connections from `localStorage`, including a password field.
- Recommendation: avoid storing secrets in cleartext local storage; prefer OS keychain/credential store, or prompt per session.

### Cross-platform / correctness issues

6) Hard-coded `/tmp/...` paths in frontend

- `src/providers/ContextMenuProvider.jsx` uses `/tmp/...` for zip/unzip operations.
- This is not portable to Windows and may not be correct across macOS/Linux contexts.
- Recommendation: use backend-provided temp paths (`std::env::temp_dir()` on Rust side) or a Tauri API for temp directories.

7) Potential macOS compile issue: `Command::new` import

- `src-tauri/src/commands/permission_commands.rs` uses `Command::new` in a macOS-specific branch.
- The file needs `use std::process::Command;` (verify it is present). If missing, macOS builds will fail.

8) Panic risks (`unwrap` / `expect`) in volume operations

- `src-tauri/src/commands/volume_operations_commands.rs` appears to use `unwrap`/`expect` in some paths.
- Recommendation: replace with fallible handling and return structured errors to the frontend.

### Maintainability / quality

9) Debug logging left in UI code

- `src/providers/FileSystemProvider.jsx` (and potentially others) contains many `console.log` statements.
- Recommendation: gate logs behind a debug flag or environment variable, or use a small logger utility.

10) `unsafe` implementations in search engine

- `src-tauri/src/search_engine/fast_fuzzy_v2.rs`, `src-tauri/src/search_engine/path_cache_wrapper.rs`, `src-tauri/src/search_engine/lru_cache_v2.rs` contain `unsafe`.
- `unsafe` is not automatically wrong, but it raises the bar for review/testing.
- Recommendation: add targeted tests/benchmarks and document invariants.

### Project hygiene / build reproducibility

11) `.gitignore` ignores lockfiles/configs (confirm intent)

- `.gitignore` ignores `Cargo.lock`, `package-lock.json`, and even `vite.config.js`.
- This may be intentional for a library, but for an application it can reduce reproducibility.
- Recommendation: confirm policy; typically apps commit lockfiles.

## Files Touched / Read (Key References)

- Docs/config:
  - `README.md`
  - `package.json`
  - `vite.config.js`
  - `.gitignore`
  - `.github/workflows/test-only.yml`
  - `docs/ai_generated/`

- Tauri/Rust:
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/capabilities/default.json`
  - `src-tauri/src/main.rs`
  - `src-tauri/src/commands/command_exec_commands.rs`
  - `src-tauri/src/commands/file_system_operation_commands.rs`
  - `src-tauri/src/commands/settings_commands.rs`
  - `src-tauri/src/commands/permission_commands.rs`
  - `src-tauri/src/commands/sftp_file_system_operation_commands.rs`
  - `src-tauri/src/commands/volume_operations_commands.rs`
  - `src-tauri/src/search_engine/*`

- React:
  - `src/components/terminal/Terminal.jsx`
  - `src/components/thisPc/ThisPCView.jsx`
  - `src/components/sidebar/Sidebar.jsx`
  - `src/providers/FileSystemProvider.jsx`
  - `src/providers/ContextMenuProvider.jsx`
  - `src/providers/SettingsProvider.jsx`
  - `src/providers/SftpProvider.jsx`
  - `src/utils/fileOperations.js`
  - `src/utils/mockTauriAPI.js`

## Suggested Next Steps

1) Fix the command/parameter mismatches first (these are likely the biggest user-visible breakages).
2) Decide on security posture for shell execution + terminal rendering, then implement guardrails.
3) Address portability issues (`/tmp`), then harden error handling (avoid panics) and reduce debug logs.
4) Revisit `.gitignore` lockfile policy to improve reproducibility.
