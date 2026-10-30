# How min-vscode works

## The shape of it

```
VS Code ──ssh min-vscode.NAME──▶ /usr/bin/ssh ──ProxyCommand──▶ min-vscode _proxy NAME
                                                                   │ prepare (re-pin, push key)
                                                                   ▼
                                                 exec min session exec NAME sshd -i ...
                                                                   │ (min's exec channel)
                                                                   ▼
                                                       sshd in the box ◀── VS Code server
```

`bin/min-vscode` has three parts: tool constants (`TOOL`, `HOST_PREFIX`,
...), the **plumbing** (transport, ssh, sessions), and the **client layer**
(everything VS Code). The plumbing never mentions an editor:
it calls `client_on_connect`, `client_on_destroy` and `client_linked` when
the client layer defines them.

## Transport

`min session exec NAME argv...` is a byte-transparent, non-PTY exec channel
into the box. The ProxyCommand runs `sshd -i` over it, so ssh speaks to a
real OpenSSH server on stdin/stdout. No port listens anywhere.

sshd runs with a fixed flag set: `-f /dev/null` (no config file), the
box's host key `~/.ssh/min-vscode/host_ed25519`, `AuthorizedKeysFile
~/.ssh/min-vscode/authorized_keys`, public-key auth only,
`PermitUserEnvironment=yes` (sshd scrubs the environment; `~/.ssh/environment`
restores the session's variables), TCP forwarding on, agent and X11
forwarding off, `internal-sftp`.

### prepare and PREP

Before every connection (`open`, `attach`, `ssh`, and `_proxy` behind every
stanza) `prepare` runs one `min session exec NAME sh -c PREP min-vscode
PUBKEY`. PREP, in the box:

- generates the box's host key once, under a lock (`.keygen` dir; stale
  locks broken by one waiter at a time; the pair renamed into place whole),
  so concurrent connects agree on one key;
- writes `authorized_keys`;
- rewrites `~/.ssh/environment` from `env`, without `PROMPT_COMMAND`;
- appends the `min:workbench` and `min:motd` rc lines (each unless there; an older `min:motd` line is replaced) and a `~/.bash_profile` that sources
  `~/.bashrc`;
- prints `user=`, `home=`, `sshd=`, `hostkey=`.

The host validates every fact (they come from an untrusted box), then writes
`known_hosts` (`min-vscode.NAME <key>`), `user`, `home`, `sshd` under
`~/.local/state/min-vscode/sessions/NAME/`, each by rename, and refreshes the
stanza file; if a write fails, `prepare` stops there. `_proxy` and the
ProxyCommand `min-vscode ssh` builds re-check the stored `home` and `sshd`
before using them. A session recreated under the same name therefore heals on the
next connect.

### Stanzas and `_proxy`

`min-vscode ssh-config` adds two marked lines at the top of `~/.ssh/config`:

    # min-vscode ssh-config (remove with: min-vscode ssh-config --remove)
    Include ~/.ssh/min-vscode.conf

`~/.ssh/min-vscode.conf` (mode 600) has one stanza per prepared session that
min still lists:

    # myproject-3f9c
    Host min-vscode.myproject-3f9c
        User <box user>
        IdentitiesOnly yes
        AddKeysToAgent no
        UserKnownHostsFile "~/.local/state/min-vscode/sessions/myproject-3f9c/known_hosts"
        StrictHostKeyChecking yes
        ForwardAgent no
        ForwardX11 no
        ForwardX11Trusted no
        IdentityFile "~/.local/state/min-vscode/sessions/myproject-3f9c/id_ed25519"
        ProxyCommand env MIN_BIN=/path/to/min MIN_VSCODE_STATE_DIR=... ~/.local/bin/min-vscode _proxy myproject-3f9c

then a catch-all `Host min-vscode.* !min-vscode.*.*` whose ProxyCommand
explains that no stanza exists (it passes no hostname to the shell). The
file is rewritten only when its content changes. `_proxy` writes nothing to
stdout before it `exec`s `min session exec NAME sshd ...`, and logs one line
per attempt to `proxy.log` (mode 600, capped): `ok`, or `fail:` and why.

Any other `Include ~/.ssh/min-*.conf` line in `~/.ssh/config` is left
alone. What the install created (`~/.ssh`, `~/.ssh/config`) is recorded in
`~/.local/state/min-clients/ssh-config-created`, and removing the last such
Include deletes those, so `~/.ssh/config` ends byte for byte as it was.

### In use

`in_use_names` reads the host process table (`ps -xo pid=,ppid=,args=`)
for processes whose argv has `session exec NAME <path ending /sshd>`:
`_proxy` after its exec, ControlPersist masters, any ssh client. Nothing
contacts a box to find out.

## Client layer

### open / new / attach

1. Pick or activate the session (`min session activate --no-prompt
   [--loadout D]... --loadout vscode [-n NAME] PATH`, D being your
   `[loadouts] default_loadouts`, which min skips once any `--loadout` is
   named; without `-n`, min names it and min-vscode takes the one new
   session for PATH).
2. `prepare` (above).
3. `client_on_connect`: settings refresh (below).
4. `code --remote ssh-remote+min-vscode.NAME /workbench` (skipped with
   `--no-window`).

### Settings merger (`bin/min-vscode-config`)

settings.json is JSONC and VS Code edits it too, so it is never rewritten
from a parsed object. The merger blanks comments (keeping byte offsets) to
parse it, then makes one of two textual edits: a marked block after the
opening brace holding `remote.SSH.remotePlatform` when you do not have it, or,
when you do, a replacement of just that object's value; plus
`remote.SSH.useLocalServer: false` in the block when you have not set that
key (one ssh per window, so every window runs `_proxy`). A
`--sync NAME...` list is the full set of live prepared sessions; entries with
the `min-vscode.` prefix not in it are dropped, every other entry stays,
including ones VS Code added inside our block. The opt-in record is
`STATE/settings-installed`; a refresh is skipped when `min ls` fails, so a
transient error never empties the list.

## State directory

`~/.local/state/min-vscode/`:

| Path | What |
|---|---|
| `sessions/NAME/` | `id_ed25519` keypair, `known_hosts`, `user`, `home`, `sshd` |
| `created/NAME` | the session was activated by min-vscode (has the loadout) |
| `orphan/NAME`, `kept/NAME` | first seen unused by `gc` or `status` (epoch); kept at a destroy prompt |
| `backups/` | `ssh_config.<time>`, `settings.json.<time>` |
| `settings-installed`, `settings-created` | opt-in records (the ssh-config one is `~/.local/state/min-clients/ssh-config-created`) |
| `proxy.log` | one line per connection attempt |

In the box: `~/.ssh/min-vscode/host_ed25519`, `~/.ssh/min-vscode/authorized_keys`,
`~/.ssh/environment`, `~/.vscode-server/`, the `minimal-sandbox` skill in
`~/.copilot/skills/` and `~/.claude/skills/`.
