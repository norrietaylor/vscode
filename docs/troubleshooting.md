# Troubleshooting

Start with `min-vscode doctor`. It checks `min`, the `code` CLI and its
commit, Microsoft's Remote-SSH extension (`ms-vscode-remote.remote-ssh`),
`jq`/`python3`/`ssh`, the `vscode` loadout, the state dir, the ssh Include and that `ssh -G min-vscode.NAME`
routes through `_proxy` and the settings block, and prints a one-line fix for each problem.
`min-vscode status` lists sessions, whether something is connected, and how
long each has been idle.

- **`openssh is not installed in this session`.** The session was activated
  without a loadout carrying openssh. `min-vscode open` activates with
  `--loadout vscode`; for a session made by `min` directly, re-activate it
  with `--loadout vscode`.
- **Connection problems.** `min-vscode ssh NAME -- -v` runs plain ssh over
  the same transport and prints the negotiation;
  `~/.local/state/min-vscode/proxy.log` has one line per connection attempt:
  `ok`, or `fail: no session named NAME`, `fail: prepare` (the box's facts
  could not be fetched, were invalid or could not be written) or
  `fail: invalid home|sshd in PATH` (a stored fact no longer valid; the next
  `min-vscode attach NAME` rewrites it).
  ssh runs the ProxyCommand under `$SHELL -c`: nushell and xonsh users
  should give VS Code a POSIX `SHELL`.
- **An earlier `Host`/`Match` block shadows the stanza.** doctor says so;
  keep the min-vscode Include at the top of `~/.ssh/config`.
- **A setting of yours moved below `// min-vscode:end`.** VS Code adds new
  settings at the end of the file, which can be inside the marked block; the
  next refresh moves them out, and `--remove` keeps them.
- **`remote.SSH.remotePlatform in the // min-vscode:begin block is not an
  object; fix it by hand`.** Something rewrote it inside the block; make it
  an object (or delete it), then run `min-vscode config` again.

VS Code specifics (platform prompt):
[vscode.md](vscode.md#troubleshooting).
