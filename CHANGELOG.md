# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Minimal's banner now shows in ssh shells: each new VS Code terminal and an
  interactive `min-vscode ssh` session print it once, with
  "exit or close the terminal" as the detach hint. `min session attach`
  shells are unchanged.

### Fixed

- Variables whose values hold spaces or shell metacharacters now reach ssh
  shells in a box as they are, so Minimal's banner shows there. The box's
  GNU `env` (coreutils 9.12) shell-quotes such values and sshd reads
  `~/.ssh/environment` literally, so they kept the quotes; PREP and the
  loadout now write the file from `env -0`, and leave out a value with a
  newline.
- Shells over ssh in a box whose `~/.bash_profile` (a user loadout's) does
  not source `~/.bashrc` now get the `min:workbench` and `min:motd` lines
  too: both writers add a marked `min:bashrc` line that sources it.
- `destroy` and `gc`: a failed `min ls` after the answer no longer counts as
  the box being gone. Before, it removed the session's keys, refreshed
  settings and dropped its ssh stanza even after an `n`; now everything is
  kept, with a warning, and after a `y` the command exits non-zero (min's
  own status, or 1 when min destroyed the box). Once `min ls` no longer
  lists the box, `destroy NAME` removes what was kept.

## [0.2.0] - 2026-10-28

Rebuilt as the VS Code twin of min-cursor: a VS Code extension is now the
everyday UI, driving the bundled `min-vscode` CLI.

### Added

- **VS Code extension** (Minimal view): Set Up, New Box from Folder…, New
  Empty Box, Open Box…, Open Box in New Window…, Destroy Box…, Clean Up Idle
  Boxes…, Run Doctor, Remove Setup; the box name in a remote window's status
  bar. Destroyed boxes leave VS Code's recent list. The VSIX carries its own
  copy of the CLI and loadout (`just vsix`;
  `code --install-extension min-vscode.vsix`).
- `min-vscode setup [--remove]`: the whole install (CLI link, loadout, ssh
  Include, settings) from this copy; `just install`/`uninstall` call it.
- `open`/`new`/`attach --no-window`, `new --empty` (an empty `/workbench`),
  `destroy --if-idle` (exit 3 while in use) and `destroy -y --force` (exit 4
  when min refuses unsaved changes), `status --json`.
- The `vscode` loadout adds `git` and copies Minimal's `minimal-sandbox` skill
  into `~/.copilot/skills` and `~/.claude/skills` in the box.
- **Skills**: Minimal's skills from gominimal/minimal-skills 0.7.0 (MIT),
  vendored: `setup` gives Copilot and Claude Code on the Mac the host ones
  (`minimal-setup`, `-config`, `-loadouts`, `-networking`, `-diag`) in `~/.copilot/skills` and `~/.claude/skills`; boxes get
  `minimal-sandbox`.
- Without the `code` shell command on PATH, the CLI uses the one inside
  `/Applications/Visual Studio Code.app` (`MIN_VSCODE_EDITOR_APP`).

### Changed

- min names new sessions (`<dir>-<hex>`; `box-<hex>` for `--empty`) unless
  `-n` is given.
- Each tool keeps its own in-box host key, `~/.ssh/min-vscode/host_ed25519`
  (was the shared `~/.ssh/minx/host_ed25519`): existing boxes re-key on the
  next connect, which re-pins it.
- The plumbing is no longer a vendored min-cmux kernel block; it lives in
  `bin/min-vscode` directly (`tests/kernel.sha` is gone).
- Needs min 0.7.0 or newer (`doctor` fails on older).

### Removed

- `min-vscode watch`, macOS notifications and the Claude Code agent-state hook
  in the loadout.
- The experimental server pre-fetch (`MIN_VSCODE_PREFETCH`,
  `MIN_VSCODE_PREFETCH_WAIT`).
- Herdr integration, bounded in-box reads (`MIN_VSCODE_EXEC_TIMEOUT`).
- `jq` from the loadout; `docs/spike.md` and `docs/manual-test-plan.md`.

### Fixed

- `gc` offers only sessions min-vscode has connected to (has keys for);
  sessions another tool or you created with `min` are never listed or asked
  about.

## [0.1.0] - 2026-10-16

First release, split from [minx](https://github.com/noric-labs/minx).

### Added

- `min-vscode open|new|attach`: a Minimal session (activated with
  `--loadout vscode`), its ssh stanza, then
  `code --remote ssh-remote+min-vscode.NAME /workbench`.
- `min-vscode config`: per-session `remote.SSH.remotePlatform` entries and
  `remote.SSH.useLocalServer` in VS Code's user settings.json, as a marked
  block (comments kept, backups, no-op when unchanged, `--remove`), refreshed
  by open, attach, ssh, destroy and gc.
- `min-vscode watch`: Claude Code state from boxes you are connected to
  (written by the `vscode` loadout's hook to `~/.min-vscode/agent-state`)
  as macOS notifications on needs-input and finished. Spike E1.
- Experimental server pre-fetch from `open`/`new`
  (`MIN_VSCODE_PREFETCH=1`), detached in the box. Spike V1.
- `destroy`, `gc`, `status`, `doctor`, `completions`, `ssh`, `ssh-config`.
- `loadouts/vscode.toml`: openssh, curl, jq, rsync, xxhash; sshd environment;
  `min:workbench` rc line; Claude hook.

### Fixed (review)

- Settings: a key VS Code appends inside the block, or a `useLocalServer`
  edited there, is kept (moved below the end marker) instead of failing every
  refresh or being overwritten; `--remove` restores compact, CRLF and BOM
  files exactly; `config` with `min ls` failing keeps existing entries.
- watch: bounded in-box reads (512 bytes, timeout), strict epochs, a lock so
  only one watch runs (a stale lock, also one whose pid was reused, is
  broken); `watch --ensure` reports `MIN_VSCODE_NO_WATCH=1` and a failed start.
- Pre-fetch: never renames over the installer's files; `open`/`new` wait for
  it (bounded) before opening the window.
- gc re-checks each session right before asking; destroy forgets that
  min-vscode created the session; the loadout's hook merge keeps a user hook
  that shares a group with ours.
- Kernel v2 (from min-cmux): ssh-config lock shared by all tools, stricter
  names and default_loadouts parsing, Herdr query failures count as use.

### Changed (from minx)

- Host alias `min-vscode.NAME`, `~/.ssh/min-vscode.conf`, state in
  `~/.local/state/min-vscode`, env prefix `MIN_VSCODE_`.
- In-box `authorized_keys` per tool (`~/.ssh/min-vscode/`); the host key
  stays shared at `~/.ssh/minx/host_ed25519`.
- "In use" is tool-neutral: any `min session exec NAME ... sshd` on the host.
- The loadout is not added to `default_loadouts`.
- The plumbing lives in a vendored kernel block shared byte for byte by the
  min-* tools (from the min-cmux repo), pinned by `tests/kernel.sha`.
- New sessions keep the user's `default_loadouts` and add `--loadout vscode`.
- What `ssh-config` created under `~/.ssh` is recorded once for all min-*
  tools (`~/.local/state/min-clients/ssh-config-created`), so installing and
  removing several tools in any order restores `~/.ssh/config` byte for byte.
