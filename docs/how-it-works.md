# How min-vscode works

## The shape of it

```
VS Code ──ssh min-vscode.NAME──▶ /usr/bin/ssh ──ProxyCommand──▶ min-vscode _proxy NAME
                                                                   │ prepare (re-pin, push key)
                                                                   ▼
                                                 exec min session exec ID sshd -i ...
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

`min session exec ID argv...` is a byte-transparent, non-PTY exec channel
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
stanza) `prepare` runs one `min session exec ID sh -c PREP min-vscode
PUBKEY`, ID being the box's id (below). PREP, in the box:

- generates the box's host key once, under a lock (`.keygen` dir; stale
  locks broken by one waiter at a time; the pair renamed into place whole),
  so concurrent connects agree on one key;
- writes `authorized_keys`;
- rewrites `~/.ssh/environment` from `env`, without `PROMPT_COMMAND`;
- appends the `min:workbench` and `min:motd` rc lines (each unless there; an older `min:motd` line is replaced) and a `~/.bash_profile` that sources
  `~/.bashrc` (or, when one exists without a mention of `~/.bashrc`, a marked
  `min:bashrc` line in it);
- prints `user=`, `home=`, `sshd=`, `hostkey=`.

The host validates every fact (they come from an untrusted box), then writes
`known_hosts` (`min-vscode.NAME <key>`), `user`, `home`, `sshd` and `id`
under `~/.local/state/min-vscode/sessions/NAME/`, each by rename, and
refreshes the stanza file; if a write fails, `prepare` stops there. `_proxy`
and the ProxyCommand `min-vscode ssh` builds re-check the stored `home`,
`sshd` and `id` before using them. A box min-vscode recreates (`open -n NAME`
once the old one is gone) gets a new id and heals on its first connect;
`prepare` never replaces a recorded id with another one.

### Box ids

min 0.8 ([gominimal/minimal#2756](https://github.com/gominimal/minimal/pull/2756))
made a session name an alias: a stopped box keeps its name, and `min ls`
still lists it, but it doesn't stop a new box from taking the name; only a
running box (or a resume in flight) does. min resolves a name to the
running box, else the latest. Every min command min-vscode runs
on one box takes a full session id first, so min-vscode addresses its own
boxes by id: `session exec` (prepare, `_proxy`, `ssh`'s ProxyCommand) and
`session destroy`. The id is `sessions/NAME/id`, one line, checked against
`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}` whenever it is
read; a file that fails the check is never used (the box is not own, and
naming it is refused). Activation records it: the one id `min ls` lists
afterwards and not before (named NAME with `-n`, else for the folder).

Own means: a key dir whose recorded id `min ls` lists under the dir's name
(a box renamed outside min-vscode, or another tool's box that took the
name, is not own). Own boxes are the ones that get a stanza and a
`remote.SSH.remotePlatform` entry. A key dir from before ids is adopted, its
id written, when exactly one box has its name, by a command that acts on
that box (`open`, `attach`, `ssh`, `_proxy`; never `destroy`, which
destroys by the id it finds but writes none, so an N leaves nothing
behind); only that
box's key dir adopts, never another one on the way (the stanza and
settings refresh after a connect). `ssh-config`, `config`, `setup`,
`status`, `gc`, completions and `doctor` count it own without writing
(`doctor` says it will be adopted). The extension's `destroy --own`,
`destroy` with no NAME (the current directory's box) and `gc` never adopt
and destroy in one step: the first two refuse a key dir with no id ("attach
it once"), `gc` lists it as "no id recorded" without asking, and the view's
Clean up skips it (`status --json` gives `recorded: false`). `open` adopts
only through `prepare`, after its checks of the folder. With several,
none is own, no stanza is written for it, and `doctor` warns; so does one
box of that name that min lists with no usable id.
The adoption has a risk: a legacy key dir whose own box is long gone adopts
the one box that now holds the name, whoever made it. "Gone" is a
successful `min ls` that no longer lists the recorded id. A recorded id is
never traded for a box found by name: when ours is gone and another box has
the name, `destroy NAME` drops only our keys and records, and `attach`,
`ssh`, `open -n` and `_proxy` refuse ("your box NAME is gone; another box
now has the name"); when min lists our id under another name (renamed
outside min-vscode), everything refuses. `_proxy NAME` reaches only an own
box (or, with no key dir at all, the one box of that name). When `min ls`
fails, the stanzas on disk stay (all but those with a bad `id`); `_proxy`
decides at connect.

### Stanzas and `_proxy`

`min-vscode ssh-config` adds two marked lines at the top of `~/.ssh/config`:

    # min-vscode ssh-config (remove with: min-vscode ssh-config --remove)
    Include ~/.ssh/min-vscode.conf

`~/.ssh/min-vscode.conf` (mode 600) has one stanza per prepared session that
min still lists as own (by its id, above):

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
stdout before it `exec`s `min session exec ID sshd ...`, and logs one line
per attempt to `proxy.log` (mode 600, capped): `ok`, or `fail:` and why.

Any other `Include ~/.ssh/min-*.conf` line in `~/.ssh/config` is left
alone. What the install created (`~/.ssh`, `~/.ssh/config`) is recorded in
`~/.local/state/min-clients/ssh-config-created`, and removing the last such
Include deletes those, so `~/.ssh/config` ends byte for byte as it was.

### In use

`in_use_names` reads the host process table (`ps -xo pid=,ppid=,args=`)
for processes whose argv has `session exec X <path ending /sshd>`:
`_proxy` after its exec, ControlPersist masters, any ssh client. X is an id
or, for connections opened before ids or by other tools, a name; a box
counts as in use when either its name or its id is there. Nothing
contacts a box to find out.

## Client layer

### open / new / attach

1. Pick or activate the session (`min session activate --no-prompt
   [--loadout D]... --loadout vscode [-n NAME] PATH`, D being your
   `[loadouts] default_loadouts`, which min skips once any `--loadout` is
   named; without `-n`, min names it and min-vscode takes the one new
   session for PATH). The new box's id goes in `sessions/NAME/id`.
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
| `sessions/NAME/` | `id_ed25519` keypair, `known_hosts`, `user`, `home`, `sshd`, `id` (the box's min session id: min-vscode reaches it by that) |
| `created/NAME` | the session was activated by min-vscode (has the loadout) |
| `orphan/NAME`, `kept/NAME` | first seen unused by `gc` or `status` (epoch); kept at a destroy prompt |
| `backups/` | `ssh_config.<time>`, `settings.json.<time>` |
| `settings-installed`, `settings-created` | opt-in records (the ssh-config one is `~/.local/state/min-clients/ssh-config-created`) |
| `proxy.log` | one line per connection attempt |

In the box: `~/.ssh/min-vscode/host_ed25519`, `~/.ssh/min-vscode/authorized_keys`,
`~/.ssh/environment`, `~/.vscode-server/`, the `minimal-sandbox` skill in
`~/.copilot/skills/` and `~/.claude/skills/`.
