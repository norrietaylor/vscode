# Commands

Run `min-vscode` on the host (any terminal). Shells inside a box run in the
box, where `min-vscode` is not installed.

| Command | Does |
|---|---|
| `min-vscode open [PATH] [-n NAME] [--no-window]` | the session for `PATH` (default `.`): a live one min-vscode has connected to is reused, else one is activated with `--loadout vscode`; then VS Code opens `/workbench` in it. Prints `min-vscode.NAME` |
| `min-vscode new [PATH \| --empty] [-n NAME] [--no-window]` | always a new session for `PATH`, then VS Code; `--empty`: an empty `/workbench` (`--sync none`), named by min (`box-<hex>`) |
| `min-vscode attach [NAME] [--no-window]` | an existing session in VS Code (no NAME: pick one of its own) |
| `min-vscode destroy [-y] [--if-idle] [--force] [NAME]` | ask `[y/N]`, then destroy (no NAME: its one session for the current directory); `--if-idle` refuses with exit 3 while something is connected. Without a terminal, min refuses a session with unsaved changes: exit 4; `-y --force` discards them. When the `min ls` that follows fails, the session's keys and stanza stay, with a warning, and after a y the exit is non-zero (min's own status, or 1 when min destroyed it); once `min ls` lists its id no more (a key dir with no id: once no box is named NAME), `destroy NAME` removes what was kept |
| `min-vscode gc [--older-than SECONDS] [--dry-run]` | list active sessions no ssh client is using (oldest first), then ask `[y/N/q]` for each |
| `min-vscode status [--json]` | table: session, status, project, in use, idle age; `--json`: `[{name, id, status, project, own, recorded, empty, in_use, idle}]` (`id`: min's session id; `own`: min-vscode's box, by that id; `recorded`: that id is in `STATE/sessions/NAME/id` (an own box from before ids is not, until a command acts on it); idle in seconds or null, own boxes only) |
| `min-vscode doctor` | health report; exits 1 on any FAIL |
| `min-vscode setup [--remove]` | the whole install from this copy: links `~/.local/bin/min-vscode` and the `vscode` loadout here, then `ssh-config` and `config`; `--remove` undoes only ours |
| `min-vscode config [--remove\|--print]` | opt in to (or out of) the settings block; `--print` only prints |
| `min-vscode ssh NAME [-- ARGS]` | plain `ssh` over the same transport (debugging: `-- -v`) |
| `min-vscode ssh-config [--remove\|--print]` | opt in: one `Host min-vscode.NAME` stanza per session in `~/.ssh/min-vscode.conf`, included from the top of `~/.ssh/config` |
| `min-vscode completions <zsh\|bash>` | print a completion script (`eval "$(min-vscode completions zsh)"`) |

`--no-window` does everything but open the window; the extension opens it
itself (`vscode-remote://ssh-remote+min-vscode.NAME/workbench`).

Internal flags, for the extension: `attach --own NAME` and `destroy --own
NAME` take NAME as a row of its own-box list, which may be stale: when NAME
is no longer min-vscode's own box (another tool's box took the name), they
refuse instead of reaching it. `destroy --own` also refuses a key dir with
no recorded id (from before ids): attach it once first; so does `destroy`
with no NAME (the current directory's box), and the view's Clean up skips
such a box (`recorded: false`). `gc` lists such a
box as "no id recorded (attach NAME once)" and does not ask about it.

Names: without `-n`, min names a new session (`<dir>-<hex>`, e.g.
`myproject-3f9c`), and min-vscode takes the one new session for the path.
Every name, min's or a `-n NAME`, must match `^[a-z0-9][a-z0-9-]*$`: names
become hostnames and ssh `Host` patterns; one that does not is refused.

"In use" means some process on the host is connected to the box: any
`min session exec ID ... sshd` (or, from older connections and other tools,
`... exec NAME ...`), which covers VS Code, a terminal `ssh`,
`scp` and any other ssh client. `gc` leaves sessions in use out; their idle age
(`status`, `gc`) restarts while they are in use, and counts from the first
`gc` or `status` that saw the session unused (each run dates them).
`gc` offers only sessions min-vscode has connected to (it has keys for them
under `STATE/sessions/NAME`, and the box's id in `STATE/sessions/NAME/id`);
boxes it has never connected to (made by other tools or `min` alone) are not
its to tidy. `open` without `-n`, `destroy` without NAME, the `attach` picker
and completions pass them over too; only an explicit name (`attach NAME`,
`ssh NAME`, `destroy NAME`, `open -n NAME`) reaches one.

Box ids: since min 0.8 several boxes may share a name (a stopped box keeps
it, and a new one may take it), and min picks the running one, else the
latest, for a name. So min-vscode reaches its own boxes by the id it
recorded when it made or first connected to them; the name stays the handle
(`ssh min-vscode.NAME`, VS Code's settings, the commands). A box is own only
while `min ls` lists that id under that name. A key dir from before ids
takes the id of the one box with its name; when several share it,
min-vscode cannot tell which is its own and leaves them all alone (`doctor`
says so; naming it says so too). An explicit NAME that is not own goes to
the one box with that name, and is refused when several have it, or when
min-vscode's own box of that name is gone (it never takes another box in its
place; `destroy NAME` then drops only min-vscode's record).

just recipes: `check`, `install`, `ssh-config`, `vscode-config`, `skills`,
`uninstall`, `ext-deps`, `vsix`.
