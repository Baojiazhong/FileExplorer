# Tauri Command Contract Audit (AI-generated)

This document is a detailed follow-up to `docs/ai_generated/project_review_findings.md`.

Goal: map frontend `invoke()` calls to Rust `#[tauri::command]` functions and identify command-name / parameter-key mismatches that are likely to cause runtime errors.

## How Tauri Matches Parameters (Important)

In Tauri, the JSON object you pass from JS to `invoke('command', { ... })` is deserialized into the Rust command function parameters by name.

That means **parameter key spelling matters**. Example:

- Rust: `pub async fn rename(old_path: &str, new_path: &str)`
- JS must call: `invoke('rename', { old_path: ..., new_path: ... })`
- Calling `invoke('rename', { oldPath: ..., newPath: ... })` will typically fail (missing required keys).

## Backend Registration Status

Even if a Rust command exists, it must be included in the handler list in `src-tauri/src/main.rs` via `tauri::generate_handler![ ... ]`.

- Registered handler list: `src-tauri/src/main.rs`
- Notable: `file_system_operation_commands::open_file` is present in Rust but commented out in the handler list.

## High-Impact Mismatches (Likely Runtime Breakage)

### 1) Local filesystem: `open_file` invoked, but not registered

- Frontend calls:
  - `src/utils/fileOperations.js` calls `invoke('open_file', { file_path: filePath })`
  - `src/components/terminal/Terminal.jsx` calls `invoke('open_file', { file_path: filePath })`
- Backend:
  - Command exists: `src-tauri/src/commands/file_system_operation_commands.rs` has `pub async fn open_file(path: &str)`
  - Not registered: `src-tauri/src/main.rs` has `//file_system_operation_commands::open_file,`
- Issues:
  - Command name may be "not found" at runtime because it is not registered.
  - Even if registered, frontend uses `file_path` but Rust expects `path`.
- Fix options:
  1) Register the command in `src-tauri/src/main.rs` AND change frontend payload to `{ path: filePath }`.
  2) Prefer: remove `open_file` usage from frontend and rely on `build_preview` / `open_in_default_app` (if `open_file` was intentionally disabled).

### 2) Settings reset: frontend calls `reset_settings`, backend registers `reset_settings_command`

- Frontend call:
  - `src/providers/SettingsProvider.jsx` calls `invoke('reset_settings')`
- Backend:
  - Registered command: `src-tauri/src/main.rs` registers `settings_commands::reset_settings_command`
  - Rust function: `src-tauri/src/commands/settings_commands.rs` defines `pub fn reset_settings_command(...)`
- Mock hides this mismatch:
  - `src/utils/mockTauriAPI.js` implements `case 'reset_settings': ...`
- Fix options:
  1) Change frontend to `invoke('reset_settings_command')`.
  2) Rename the Rust command to `reset_settings` (or add a wrapper command) and register that name.

### 3) Local filesystem ops: camelCase keys used in providers do not match Rust signatures

Backend signatures (all in `src-tauri/src/commands/file_system_operation_commands.rs`):

- `create_file(folder_path_abs: &str, file_name: &str)`
- `create_directory(folder_path_abs: &str, folder_name: &str)`
- `rename(old_path: &str, new_path: &str)`
- `copy_file_or_dir(source_path: &str, destination_path: &str)`
- `zip(source_paths: Vec<String>, destination_path: Option<String>)`
- `unzip(zip_paths: Vec<String>, destination_path: Option<String>)`

Known frontend payload mismatches:

- `src/providers/FileSystemProvider.jsx`
  - `create_file`: sends `{ folderPathAbs, fileName }` (should be `{ folder_path_abs, file_name }`)
  - `create_directory`: sends `{ folderPathAbs, folderName }` (should be `{ folder_path_abs, folder_name }`)
  - `rename`: sends `{ oldPath, newPath }` (should be `{ old_path, new_path }`)
  - `zip`: sends `{ sourcePaths, destinationPath }` (should be `{ source_paths, destination_path }`)
  - `unzip`: sends `{ zipPaths, destinationPath }` (should be `{ zip_paths, destination_path }`)

- `src/providers/ContextMenuProvider.jsx`
  - `rename`: sends `{ oldPath, newPath }` (should be `{ old_path, new_path }`)
  - `copy_file_or_dir`: sends `{ sourcePath, destinationPath }` (should be `{ source_path, destination_path }`)
  - `zip`: sends `{ sourcePaths, destinationPath }` (should be `{ source_paths, destination_path }`)
  - `unzip`: sends `{ zipPaths, destinationPath }` (should be `{ zip_paths, destination_path }`)

- `src/components/explorer/FileItem.jsx`
  - `rename`: sends `{ oldPath, newPath }` (should be `{ old_path, new_path }`)

- `src/components/terminal/Terminal.jsx` (built-in commands)
  - `mkdir`: sends `{ folder_path_abs, directory_name }` (should be `{ folder_path_abs, folder_name }`)
  - `cat`: sends `{ file_path }` to `open_file` (Rust expects `path`; also command not registered)

- `src/utils/fileOperations.js` (this file is mostly correct for local FS ops)
  - `create_file`: uses correct `{ folder_path_abs, file_name }`
  - `rename`: uses correct `{ old_path, new_path }`
  - `copy_file_or_dir`: uses correct `{ source_path, destination_path }`
  - `zip`: uses correct `{ source_paths, destination_path }`
  - `unzip`: uses correct `{ zip_paths, destination_path }`
  - `create_directory`: uses `{ directory_name }` but Rust expects `folder_name` (mismatch)

### 4) Templates: frontend uses `templatePath`/`destPath`, backend expects snake_case

- Backend signatures in `src-tauri/src/commands/template_commands.rs`:
  - `add_template(..., template_path: &str)`
  - `use_template(template_path: &str, dest_path: &str)`
  - `remove_template(..., template_path: &str)`

- Frontend mismatches:
  - `src/utils/fileOperations.js`
    - `add_template`: `{ templatePath: ... }` (should be `{ template_path: ... }`)
    - `use_template`: `{ templatePath, destPath }` (should be `{ template_path, dest_path }`)
    - `remove_template`: `{ templatePath: ... }` (should be `{ template_path: ... }`)
  - `src/providers/ContextMenuProvider.jsx`
    - `add_template`: `{ templatePath: ... }` (should be `{ template_path: ... }`)

### 5) SFTP: frontend camelCase keys do not match Rust SFTP command params

Backend signatures in `src-tauri/src/commands/sftp_file_system_operation_commands.rs` use snake_case:

- `load_dir(..., directory: String)`
- `open_file_sftp(..., file_path: String)`
- `create_file_sftp(..., file_path: String)`
- `delete_file_sftp(..., file_path: String)`
- `rename_file_sftp(..., old_path: String, new_path: String)`
- `copy_file_sftp(..., source_path: String, destination_path: String)`
- `move_file_sftp(..., source_path: String, destination_path: String)`
- `create_directory_sftp(..., directory_path: String)`
- `delete_directory_sftp(..., directory_path: String)`
- `rename_directory_sftp(..., old_path: String, new_path: String)`
- `copy_directory_sftp(..., source_path: String, destination_path: String)`
- `move_directory_sftp(..., source_path: String, destination_path: String)`
- `build_preview_sftp(..., file_path: String)`
- `download_and_open_sftp_file(..., file_path: String, open_file: Option<bool>)`

Frontend callsites with camelCase keys (examples):

- `src/providers/SftpProvider.jsx`
  - `create_file_sftp`: sends `{ filePath }` (should be `{ file_path }`)
  - `create_directory_sftp`: sends `{ directoryPath }` (should be `{ directory_path }`)
  - `delete_file_sftp`: sends `{ filePath }` (should be `{ file_path }`)
  - `delete_directory_sftp`: sends `{ directoryPath }` (should be `{ directory_path }`)
  - `rename_*_sftp`: sends `{ oldPath, newPath }` (should be `{ old_path, new_path }`)
  - `copy_*_sftp`: sends `{ sourcePath, destinationPath }` (should be `{ source_path, destination_path }`)
  - `move_*_sftp`: sends `{ sourcePath, destinationPath }` (should be `{ source_path, destination_path }`)
  - `open_file_sftp`: sends `{ filePath }` (should be `{ file_path }`)
  - `download_and_open_sftp_file`: sends `{ filePath, openFile }` (should be `{ file_path, open_file }`)

- `src/hooks/usePreview.js`
  - `build_preview_sftp`: sends `{ filePath }` (should be `{ file_path }`)

Note: `load_dir` usage appears correct in `src/providers/SftpProvider.jsx` (it sends `{ directory: ... }`).

## Quick Reference Table

Columns:
- Invoke: `invoke('command', payload)`
- Backend: Rust command signature
- Handler: whether registered in `src-tauri/src/main.rs`
- Status: OK / mismatch / not registered

| Invoke command | Frontend payload keys (examples) | Backend signature | Handler | Status |
|---|---|---|---|---|
| `open_file` | `file_path` | `open_file(path)` | no (commented) | not registered + key mismatch |
| `open_directory` | `path` | `open_directory(path: String)` | yes | OK |
| `open_in_default_app` | `path` | `open_in_default_app(path: &str)` | yes | OK |
| `create_file` | `folderPathAbs`, `fileName` (provider) / `folder_path_abs`, `file_name` (utils) | `create_file(folder_path_abs, file_name)` | yes | mixed (some OK, some mismatch) |
| `create_directory` | `folderPathAbs`, `folderName` (provider) / `directory_name` (utils + terminal) | `create_directory(folder_path_abs, folder_name)` | yes | mismatch |
| `rename` | `oldPath`, `newPath` (providers/components) / `old_path`, `new_path` (utils) | `rename(old_path, new_path)` | yes | mixed (some OK, some mismatch) |
| `copy_file_or_dir` | `sourcePath`, `destinationPath` (context menu) / `source_path`, `destination_path` (utils) | `copy_file_or_dir(source_path, destination_path)` | yes | mixed |
| `zip` | `sourcePaths`, `destinationPath` (providers) / `source_paths`, `destination_path` (utils) | `zip(source_paths, destination_path)` | yes | mixed |
| `unzip` | `zipPaths`, `destinationPath` (providers) / `zip_paths`, `destination_path` (utils) | `unzip(zip_paths, destination_path)` | yes | mixed |
| `reset_settings` | none | `reset_settings_command(...)` | yes (as `reset_settings_command`) | command name mismatch |
| `add_template` | `templatePath` | `add_template(template_path)` | yes | key mismatch |
| `use_template` | `templatePath`, `destPath` | `use_template(template_path, dest_path)` | yes | key mismatch |
| `remove_template` | `templatePath` | `remove_template(template_path)` | yes | key mismatch |
| `open_file_sftp` | `filePath` | `open_file_sftp(file_path)` | yes | key mismatch |
| `build_preview_sftp` | `filePath` | `build_preview_sftp(file_path)` | yes | key mismatch |
| `download_and_open_sftp_file` | `filePath`, `openFile` | `download_and_open_sftp_file(file_path, open_file)` | yes | key mismatch |

## Recommended Remediation Approach (No Code Changes Yet)

To avoid regressions, pick one convention and apply it consistently:

1) Prefer aligning frontend payload keys to Rust snake_case parameter names.
   - This is the lowest-risk change because the Rust APIs are already defined.
2) Optionally add a thin frontend wrapper layer that normalizes keys (camelCase -> snake_case) so component code stays idiomatic JS.
3) For command names, ensure the frontend uses the exact registered command name, or add aliases on the backend.

## Next Concrete Step

If you want, the next document can be a checklist of specific edits (file-by-file) to bring all `invoke()` calls into conformance, including exact replacement snippets.
