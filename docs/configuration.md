# Configuration

Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `MIN_VSCODE_STATE_DIR` | `${XDG_STATE_HOME:-~/.local/state}/min-vscode` | state directory (keys, facts, backups, logs) |
| `MIN_VSCODE_SETTINGS` | `~/Library/Application Support/Code/User/settings.json` | the settings file `config` edits |
| `MIN_VSCODE_EDITOR_BIN` | `code`, else the app's own | the VS Code CLI (stable VS Code only; Insiders is untested) |
| `MIN_VSCODE_EDITOR_APP` | `/Applications/Visual Studio Code.app` | where the CLI looks for VS Code's own `code` when it is not on PATH |
| `MIN_LOCK_WAIT` | 10 | seconds `ssh-config` waits for the `~/.ssh/config` lock |
| `MIN_VSCODE_DEBUG` | unset | log the editor command and other detail |
| `MIN_BIN` | `min` on PATH | `min` binary; resolved to an absolute path for the ProxyCommand |
| `SSH_KEYGEN_BIN` | `ssh-keygen` | key generator |

`MIN_BIN` and `MIN_VSCODE_STATE_DIR` are baked into each
`~/.ssh/min-vscode.conf` stanza as it is written, because VS Code starts
`ssh` with the launchd PATH and no shell rc; after changing either, re-run
`min-vscode ssh-config` (or any `open`/`attach`).

Needs min 0.7.0 or newer; `doctor` fails on an older one.

**Loadout.** `loadouts/vscode.toml` adds `openssh`, `curl`, `rsync`,
`xxhash` and `git`, copies Minimal's `minimal-sandbox` skill into
`~/.copilot/skills` (Copilot) and `~/.claude/skills` (Claude Code in the box) (vendored in `loadouts/vscode/` from
gominimal/minimal-skills; `just skills` refreshes it), prepares the in-box sshd environment, and adds the
`min:workbench` and `min:motd` (Minimal's banner in each new ssh or VS Code terminal) rc lines. `min-vscode setup` symlinks it to
`~/.config/minimal/loadouts/vscode.toml` and copies `loadouts/vscode/` beside
it. It is never added to
`default_loadouts`: min-vscode activates with your `default_loadouts` plus
`--loadout vscode` (min would drop the defaults once any `--loadout` is
named, so min-vscode passes them on), and boxes made by other tools carry only
their own loadouts (min-vscode can still attach to them).

**Settings.** See [vscode.md](vscode.md#settings-min-vscode-config).

## Rolling back

    just uninstall

takes the settings block out (`min-vscode config
--remove`, with a backup), removes the Include from `~/.ssh/config`
(byte-identical to before; `~/.ssh/min-vscode.conf` is deleted), and removes
the loadout and CLI symlinks if they point into this checkout. It leaves the
state directory, which holds the session keys and every backup.
