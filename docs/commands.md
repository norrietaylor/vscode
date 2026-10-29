# Commands

Run `min-vscode` on the host (any terminal). Shells inside a box run in the
box, where `min-vscode` is not installed.

| Command | Does |
|---|---|
| `min-vscode open [PATH] [-n NAME] [--no-window]` | the session for `PATH` (default `.`): a live one min-vscode made is reused, else one is activated with `--loadout vscode`; then VS Code opens `/workbench` in it. Prints `min-vscode.NAME` |
| `min-vscode new [PATH \| --empty] [-n NAME] [--no-window]` | always a new session for `PATH`, then VS Code; `--empty`: an empty `/workbench` (`--sync none`), named by min (`box-<hex>`) |
| `min-vscode attach [NAME] [--no-window]` | an existing session in VS Code (no NAME: pick one of its own) |
| `min-vscode destroy [-y] [--if-idle] [--force] [NAME]` | ask `[y/N]`, then destroy (no NAME: its one session for the current directory); `--if-idle` refuses with exit 3 while something is connected. Without a terminal, min refuses a session with unsaved changes: exit 4; `-y --force` discards them |
| `min-vscode gc [--older-than SECONDS] [--dry-run]` | list active sessions no ssh client is using (oldest first), then ask `[y/N/q]` for each |
| `min-vscode status [--json]` | table: session, status, project, in use, idle age; `--json`: `[{name, status, project, own, empty, in_use, idle}]` (idle in seconds or null) |
| `min-vscode doctor` | health report; exits 1 on any FAIL |
| `min-vscode setup [--remove]` | the whole install from this copy: links `~/.local/bin/min-vscode` and the `vscode` loadout here, then `ssh-config` and `config`; `--remove` undoes only ours |
| `min-vscode config [--remove\|--print]` | opt in to (or out of) the settings block; `--print` only prints |
| `min-vscode ssh NAME [-- ARGS]` | plain `ssh` over the same transport (debugging: `-- -v`) |
| `min-vscode ssh-config [--remove\|--print]` | opt in: one `Host min-vscode.NAME` stanza per session in `~/.ssh/min-vscode.conf`, included from the top of `~/.ssh/config` |
| `min-vscode completions <zsh\|bash>` | print a completion script (`eval "$(min-vscode completions zsh)"`) |

`--no-window` does everything but open the window; the extension opens it
itself (`vscode-remote://ssh-remote+min-vscode.NAME/workbench`).

Names: without `-n`, min names a new session (`<dir>-<hex>`, e.g.
`myproject-3f9c`), and min-vscode takes the one new session for the path.
Every name, min's or a `-n NAME`, must match `^[a-z0-9][a-z0-9-]*$`: names
become hostnames and ssh `Host` patterns; one that does not is refused.

"In use" means some process on the host is connected to the box: any
`min session exec NAME ... sshd`, which covers VS Code, a terminal `ssh`,
`scp` and any other ssh client. `gc` leaves sessions in use out; their idle age
(`status`, `gc`) restarts while they are in use, and counts from the first
`gc` or `status` that saw the session unused (each run dates them).
`gc` offers only sessions min-vscode has connected to (it has keys for them
under `STATE/sessions/NAME`); boxes other tools or `min` alone made are not its
to tidy. `open`, `destroy` without NAME, the `attach` picker and completions
pass them over too; `attach NAME` still reaches one by name.

just recipes: `check`, `install`, `ssh-config`, `vscode-config`, `skills`,
`uninstall`, `ext-deps`, `vsix`.
