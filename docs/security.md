# What never leaves the host

- **Only the public key enters the box.** Each session gets its own ed25519
  key under `~/.local/state/min-vscode/sessions/NAME`, and the box gets it in
  `~/.ssh/min-vscode/authorized_keys`.
- **`~/.ssh/config` is yours.** Nothing under `~/.ssh` is touched until
  `min-vscode ssh-config` runs. That adds two marked lines at the top of
  `~/.ssh/config` and keeps the stanzas in `~/.ssh/min-vscode.conf`;
  `--remove` restores `~/.ssh/config` byte for byte. A dated backup is taken
  before every write.
- **settings.json is yours.** Nothing in it is touched until
  `min-vscode config` runs; then only a marked block, the min-vscode.*
  entries of `remote.SSH.remotePlatform` and (if you have not set it)
  `remote.SSH.useLocalServer` change, with a backup first.
- **What the box reports is checked.** The user name, home, sshd path and
  host key a box prints are validated before any of them reaches
  `known_hosts`, a stanza or an ssh option.
- **The box's host key is pinned** (`StrictHostKeyChecking=yes`, never
  `accept-new`), and re-pinned by `_proxy` on every connect, so only the box
  min itself reaches can present it.
- **Destroy always asks `[y/N]`**, default No; `-y` is the only way past it.
  `gc` asks for each session.
- **No agent or X11 forwarding.** Each stanza sets `ForwardAgent no`,
  `ForwardX11 no`, `ForwardX11Trusted no` before any `Host *` of yours can
  turn them on, and the box's sshd runs with `AllowAgentForwarding=no` and
  `X11Forwarding=no`. An explicit `ssh -A min-vscode.NAME` still wins on the
  client; then only the box's sshd refuses it (defence in depth, not a
  boundary). Port forwards work.
- **Boxes are never woken to be asked.** `gc` and `status` read the host's
  process table to tell what is in use; no box is contacted to find out.
