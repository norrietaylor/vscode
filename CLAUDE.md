# CLAUDE.md

`min-vscode` opens Minimal boxes (`min` sessions, libkrun microVMs) in VS Code
over Microsoft's Remote-SSH, with sshd running inside the box behind a
`min session exec` ProxyCommand. A VS Code extension (the Minimal view) is the
everyday UI; it drives one POSIX shell script plus a python3 settings merger,
which also work alone from a terminal. It is the VS Code twin of min-cursor
([norrietaylor/cursor](https://github.com/norrietaylor/cursor)): same plumbing, extension and commands; only
the editor-specific constants, settings keys and loadout differ.

## Layout

| File | Role |
|---|---|
| `bin/min-vscode` | tool constants, then the transport/ssh/session plumbing, then the client layer, whose first block holds every editor-specific constant |
| plumbing | transport, PREP/prepare, `stored_path`, ssh options and stanzas, `ssh-config`, `_proxy`, `ssh`, naming, `activate_session`, `destroy_one`, `in_use_names`/`box_in_use`, `track_orphans`, `default_loadouts`, the ssh-config record, report helpers; editor-neutral, reaching the client layer only through its hooks |
| client layer | `open`/`new`/`attach` (session, stanza, settings, `code --remote` unless `--no-window`; `new --empty`), `destroy` (`--if-idle`), `gc`, `status` (`--json`), `doctor`, `completions`, `config`, `setup`, hidden `_sessions`; hooks `client_on_connect` and `client_on_destroy` (settings sync) |
| `bin/min-vscode-config` | python3: marked-block merge of per-host `remote.SSH.remotePlatform` and `remote.SSH.useLocalServer: false` into VS Code's user settings.json; `--install`, `--sync NAME...`, `--remove`, `--doctor`, `--dry-run` |
| `loadouts/vscode.toml`, `loadouts/vscode/` | `openssh curl rsync xxhash git`; sshd env prep; `min:workbench` and `min:motd` rc lines; patches copying `vscode/skills/minimal-sandbox` to `~/.copilot/skills` and `~/.claude/skills` in the box. `setup` copies `vscode/` beside the linked toml: `$LOADOUT_ROOT` must be a real directory |
| `skills/`, `loadouts/vscode/skills/` | Minimal's skills, vendored from gominimal/minimal-skills (MIT) at a pinned commit by `just skills`: the host ones (`setup` copies them into the Mac's `~/.copilot/skills` and `~/.claude/skills`, marked `.min-vscode-copy`, never over a dir with no `.min-*-copy` mark; one another min tool marked is shared, keeping its mark, and `--remove` deletes it only once no other mark is left) and `minimal-sandbox` (box only: the host ones teach commands a box lacks) |
| `extension/` | the VS Code extension (TypeScript, `extensionKind: ui`): Minimal view, commands, status bar; every action is a `min-vscode` call. The VSIX bundles `bin/`, `loadouts/` and `skills/` under `cli/` |
| `minimal.toml` | developing this repo in a box: session packages for `just check`/`just vsix`; tasks `check`, `vsix` (`min task run check`) |
| `justfile` | `check` (also type-checks `extension/`), `install`/`uninstall` (= `setup`), `ssh-config`, `vscode-config`, `skills`, `ext-deps`, `vsix` |
| `tests/run.sh`, `tests/stubs/` | plain-sh tests over stub `min`, `code`, `ssh`, `ssh-keygen`, `ps` and a `tripwire` for bare GUI commands; `LONG_PREFIX=1` reruns them with a long host prefix |
| `docs/` | `vscode.md` (guide, VS Code's Remote-SSH and a box, settings), `commands.md`, `configuration.md`, `security.md`, `troubleshooting.md`, `how-it-works.md`, `public/` marks and badge |

## Invariants

- Session names match `^[a-z0-9][a-z0-9-]*$`, `-n` included: they are
  hostnames and ssh `Host` patterns. Without `-n`, min names the session;
  `activate_session` takes the one new session for the path and refuses a
  name that is no hostname.
- Host alias is `min-vscode.NAME` (`HOST_PREFIX`); nothing hard-codes the
  prefix length (the long-prefix test run guards it).
- `prepare` re-pins the host key and re-pushes the public key on every
  `open`/`attach`/`ssh`/`_proxy`, so a recreated session self-heals.
  `_proxy` always runs `prepare` and writes nothing to stdout before `exec`
  (stdout is the SSH byte stream). `_proxy` and `prepare` never call client
  hooks, never touch settings.json.
- `ssh-config` is an opt-in gate: nothing under `~/.ssh` is touched until it
  has run. `ssh-config --remove` leaves `~/.ssh/config` byte-identical to
  before install; `--print` writes nothing. Other tools' Include lines are
  never touched.
- `config` is the same kind of gate for settings.json: `--sync` is a no-op
  until `config` has run (`STATE/settings-installed`). The merger keeps the
  user's bytes outside its marked block, edits only the value of an existing
  `remote.SSH.remotePlatform`, never removes a host entry without our prefix,
  writes no key but `remote.SSH.remotePlatform` and
  `remote.SSH.useLocalServer` (only when the user has not set it; their value
  always wins), backs up to
  `STATE/backups/` before a write, and never writes when the effective
  settings are unchanged. Settings sync is skipped when `min ls` fails.
- The host key is pinned (`StrictHostKeyChecking=yes`); never `accept-new`.
- Agent and X11 forwarding stay off on every client path: one option list
  (`ssh_common`) feeds both the stanza and `ssh_opts`.
- Facts the box reports (user, hostkey, home, sshd) are untrusted: `prepare`
  validates them before writing anything, and dies if a write fails; stored
  `home`/`sshd` are re-checked on read (`stored_path`) by `_proxy` and by the
  ProxyCommand `ssh` builds.
- `gc` and `destroy` never destroy without an explicit y; `-y` is the only
  way past `destroy`'s question.
- A box is gone (keys, records and stanza dropped, `client_on_destroy` run
  by `destroy_one`) only when a successful `min ls` no longer lists it; a
  failed `min ls` keeps everything (ssh-config not rewritten), warns, and
  after a y exits non-zero; `destroy NAME` drops what was kept once a
  successful `min ls` no longer lists NAME.
- `gc` offers only own sessions (`own_ls`: a key dir `STATE/sessions/NAME`),
  and `gc`/`status` date only those in `orphan/` (`track_orphans`, each run);
  boxes made by `min` alone are never listed. The same holds wherever a
  session is chosen for the user: `open`'s reuse of a live session for PATH,
  `destroy`'s cwd lookup, the `attach` picker and `_sessions` (completions).
  Only an explicit NAME (`attach NAME`, `destroy NAME`, `open -n NAME`) may
  reach another tool's box.
- In use = some host process runs `min session exec NAME ... sshd` (any ssh
  client's connection). Never contact a box without such a live process: a
  connect starts a stopped box.
- `gc` re-checks `gc_still_idle` before each question.
- `config`/doctor never prune on a failed `min ls`. `--remove` restores the
  bytes it found (brace framing, CRLF, BOM); a user's own remotePlatform
  object that we rewrote is re-indented.
- Activation passes the user's `default_loadouts` on before `--loadout vscode`.
- What `ssh-config` created under `~/.ssh` is recorded in
  `~/.local/state/min-clients/ssh-config-created`; removing the last
  `Include ~/.ssh/min-*.conf` deletes only that, so `~/.ssh/config` ends
  byte-identical.
- Install never edits `default_loadouts`; `setup --remove` (`just uninstall`)
  removes only our own links, marked skill copies, settings entries and
  Include. `setup` replaces
  a link only when missing, dangling, or pointing to another copy of the same
  file (a checkout or an older extension dir); stanzas bake the
  `~/.local/bin` link, so it follows the extension across updates.
- The extension never decides a destroy itself: a modal's destructive button
  is the explicit y (`destroy -y`); unsaved changes (exit 4, min refused
  without a terminal) need a second modal before `destroy -y --force`;
  clean-up calls `destroy -y --if-idle`, which re-checks `gc_still_idle`
  (exit 3 when in use). It lists only own sessions, runs `setup` on startup
  only once `~/.ssh/min-vscode.conf` exists, and prunes VS Code's recent list
  only from a successful `status --json`.

## External facts that bite

- `min` is a zsh function on the host; `MIN_BIN` is resolved to an absolute
  path and baked into each stanza (VS Code spawns ssh with the launchd PATH).
- Without `code` on PATH, `bin/min-vscode` uses the app's own
  (`MIN_VSCODE_EDITOR_APP`, `/Applications/Visual Studio Code.app`); the
  extension passes `MIN_VSCODE_EDITOR_BIN` from `vscode.env.appRoot`.
- `bin/min-vscode` appends `/opt/homebrew/bin`, `/usr/local/bin` and
  `~/.local/bin` to PATH (unless `MIN_NO_PATH_EXTEND=1`, which tests set,
  with `ZDOTDIR VISUAL EDITOR` unset), where the real `code` lives: tests must point `MIN_VSCODE_EDITOR_BIN` (and every
  other `*_BIN`) at an absolute stub path, never a bare name. Bare `open`,
  `osascript`, `zed`, `code`, `cursor` and `windsurf` on the test
  PATH are `tests/stubs/tripwire` (stubs live in `$T/stub-bin`), and any
  tripwire line fails the case. A mutation check never removes or bypasses a
  stub or the tripwire; skip any that could launch a real app.
- ssh runs the ProxyCommand via `$SHELL -c "exec ..."` and expands `%`
  tokens: every word goes through `shq` and the whole string through `pct`.
- Remote-SSH is Microsoft's `ms-vscode-remote.remote-ssh`, not bundled
  with VS Code; doctor checks it is installed.
- `remote.SSH.remotePlatform` has no wildcard keys
  ([microsoft/vscode-remote-release#8065](https://github.com/microsoft/vscode-remote-release/issues/8065)):
  one entry per session, or VS Code asks for the platform.
- `remote.SSH.useLocalServer: false` keeps one ssh per window, so every
  window runs `_proxy` and the in-use check sees it.
- VS Code's exec server keeps the CLI at `~/.vscode-server/code-<commit>`
  and the server in `~/.vscode-server/cli/servers/Stable-<commit>/server`
  (seen in a box with VS Code 1.143.0, 2026-10-28).
- The box is uid 1000 with `$HOME=/home`, aarch64, glibc 2.44, has bash, tar,
  curl, python3, zsh; `sshd` at `/usr/sbin/sshd`.
- sshd scrubs the environment: PREP writes `~/.ssh/environment` (filtering
  `PROMPT_COMMAND`, keeping `MINIMAL_MOTD` for the `min:motd` rc line) and
  sshd runs with `PermitUserEnvironment=yes`.
- In the box, the host key and `authorized_keys` live in `~/.ssh/min-vscode/`.
- Without a terminal, `min session destroy` refuses a box with unsaved
  changes ("refusing to destroy the session without confirmation; pass
  --force").

## Working here

- Verify: `just check`.
- Tests never touch the real min, VS Code, `~/.ssh` or settings: stubs first
  on a private PATH, `HOME`, `MIN_VSCODE_STATE_DIR` and
  `MIN_VSCODE_SETTINGS` in a tempdir.
- Don't create, attach or destroy min sessions, or `min session exec` into
  one, without asking. Don't run `ssh-config`, `config`, `_proxy`,
  `just install`/`uninstall` against the real HOME; use `HOME=<scratch>`
  `XDG_CONFIG_HOME=<scratch>` and a stub `MIN_BIN`.

## Unverified (needs a live session)

- The unsaved-changes modal's detail and the `--force` destroy after it.
- The folder picker from a remote window starts on the Mac.
- Destroying the box a window is on closes that remote connection.
- Copilot and Claude Code use the skills (they are copied to
  `~/.copilot/skills` and `~/.claude/skills` on the Mac and in the box;
  seen 2026-10-28).
- The env of `min session exec` (where PREP runs) has MINIMAL_MOTD; without
  it, PREP rewrites `~/.ssh/environment` without it and no ssh shell shows
  the banner.
- A VS Code terminal shows the banner once, the remote shell-env probe prints
  nothing, and a `min session attach` shell keeps minimald's own banner.
