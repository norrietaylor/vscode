# VS Code guide

min-vscode turns a Minimal session into a Remote-SSH host named
`min-vscode.NAME` and opens VS Code on `/workbench` in it. Everything VS Code
does after that (installing its server in the box, terminals, extensions,
port forwarding) is the behaviour of Microsoft's Remote-SSH
extension.

## Requirements

- VS Code with the `code` shell command (Command Palette, "Shell Command:
  Install 'code' command in PATH").
- Microsoft's Remote-SSH extension, `ms-vscode-remote.remote-ssh`. It does
  not ship with VS Code:
  `code --install-extension ms-vscode-remote.remote-ssh`.
- `min-vscode ssh-config` installed (Set Up or `just install` does it):
  VS Code's ssh reads `~/.ssh/config`, which then includes
  `~/.ssh/min-vscode.conf`.
- The box: glibc ≥ 2.28, bash, tar, curl (all present; checked 2026-10-02).

`min-vscode doctor` checks each of these.

## Opening a session

| Command | Session | Window |
|---|---|---|
| `min-vscode open [PATH]` | the live session for PATH if there is one, else a new one | yes |
| `min-vscode open PATH -n NAME` | NAME if it exists (for PATH), else a new one named NAME | yes |
| `min-vscode new [PATH]` | always a new one | yes |
| `min-vscode new --empty` | a new one with an empty `/workbench` | yes |
| `min-vscode attach [NAME]` | an existing one (no NAME: a numbered picker) | yes |

`--no-window` on any of them skips the window; the extension uses it and
opens the window itself.

New sessions are activated with your `default_loadouts` plus
`--loadout vscode`. Each command prepares the box (pins its host key, pushes
the public key, refreshes the stanza), refreshes the settings block, then
runs:

    code --remote ssh-remote+min-vscode.NAME /workbench

The command prints `min-vscode.NAME`, so `ssh "$(min-vscode open)"` works too.

Recent folders in VS Code's welcome page and the Remote Explorer reconnect
the same way: every connection goes through `min-vscode _proxy NAME`, which
prepares the box again first, so a session recreated under the same name
heals itself.

## VS Code's Remote-SSH and a box

- **Platform prompt.** Without a `remote.SSH.remotePlatform` entry VS Code
  asks which platform each new host runs. The setting has no wildcard keys
  ([microsoft/vscode-remote-release#8065](https://github.com/microsoft/vscode-remote-release/issues/8065)),
  so min-vscode keeps one entry per session (below).
- **One ssh per window.** min-vscode sets `remote.SSH.useLocalServer: false`
  unless you have set it yourself, so every window runs its own ssh, and with
  it `_proxy`: each window re-pins and self-heals, and shows up as in use.
- **The server.** Remote-SSH installs VS Code's server into
  `/home/.vscode-server`, which persists with the session: the CLI at
  `~/.vscode-server/code-<commit>` and the server in
  `~/.vscode-server/cli/servers/Stable-<commit>/server`, downloaded from
  `update.code.visualstudio.com` (seen in a box with VS Code 1.143.0,
  2026-10-28).
- **Agent forwarding** stays off: the stanza says `ForwardAgent no` and the
  box's sshd refuses it anyway.

## Settings (`min-vscode config`)

min-vscode keeps one `remote.SSH.remotePlatform` entry per session, and
`remote.SSH.useLocalServer: false`, in VS Code's user settings:

```jsonc
{
  // min-vscode:begin (managed by `min-vscode config`; `min-vscode config --remove` removes it)
  "remote.SSH.remotePlatform": {
    "min-vscode.myproject-3f9c": "linux"
  },
  "remote.SSH.useLocalServer": false
  // min-vscode:end
  ...your settings...
}
```

- Entries are added by `open`, `attach` and `ssh`, and dropped by
  `destroy`, `gc` and any later refresh once min no longer lists the session.
- If you already have `remote.SSH.remotePlatform` (VS Code writes it when you
  pick a platform for any host), only that object's value is rewritten,
  keeping every host that does not start with `min-vscode.`. That object
  comes back re-indented as plain JSON (comments inside it are lost);
  everything else in the file keeps its bytes.
- `remote.SSH.useLocalServer: false` is added only if you have not set it;
  your value always wins, also when you edit ours inside the block: it then
  becomes yours, moves below the end marker, and `--remove` keeps it.
- `--remove` restores the file byte for byte when the block was ours: the
  original framing after `{` (the end marker says `(joined)` when it had to
  add a line break), CRLF line endings and a UTF-8 BOM are all kept.
- When `min ls` fails, `config` leaves the existing `min-vscode.*` entries
  as they are (a partial list would prune live ones), and doctor says it
  could not check them.
- `remote.SSH.serverInstallPath` is left alone.
- Before each write the old file is copied to
  `~/.local/state/min-vscode/backups/settings.json.<time>`. A symlinked
  settings.json is written through.
- `min-vscode config --print` shows the result without writing;
  `min-vscode config --remove` takes everything out (and deletes the file if
  min-vscode created it and it is empty again).

The file is `~/Library/Application Support/Code/User/settings.json`, or
`MIN_VSCODE_SETTINGS`.

## Copilot and Claude Code

`min-vscode setup` copies Minimal's host skills (`minimal-setup`, `-config`, `-loadouts`, `-networking`, `-diag`) into
`~/.copilot/skills` and `~/.claude/skills` on the Mac, marked
`.min-vscode-copy`; a skill directory of yours with the same name is left
alone, and `setup --remove` takes out only the marked copies. min-zed
installs the same skills into `~/.claude/skills`: a copy marked by another
min tool is shared (each keeps its own mark, the last `setup` writes the
files), and `--remove` leaves it while another mark is in it.

In a box, the `vscode` loadout copies Minimal's `minimal-sandbox` skill into
`~/.copilot/skills` (VS Code's Copilot) and `~/.claude/skills` (Claude Code
run in the box), so an agent can add a missing tool or package from inside
the box instead of guessing.

## Troubleshooting

- **VS Code asks for the platform.** `min-vscode config` (once), then
  `min-vscode attach NAME`. `min-vscode doctor` shows missing or stale
  entries.
- **"Could not establish connection".** `min-vscode doctor`, then
  `ssh -v min-vscode.NAME true`, then `~/.local/state/min-vscode/proxy.log`
  (one line per connection attempt). The Remote-SSH output panel shows the
  ProxyCommand's stderr.
- **"no min-vscode ssh stanza for this min-vscode.\* host".** The session is
  gone, or was never prepared by min-vscode: `min-vscode status`, then
  `min-vscode attach NAME`.
- **Host key changed after recreating a session.** Reconnect: `_proxy`
  re-pins before sshd starts.
- **Window opens but the terminal is in `/home`.** The `min:workbench` rc
  line moves interactive shells that start in `$HOME`; sessions without the
  loadout get it on the next connect.
