# Minimal Boxes

**Run your agent in a Minimal box, and open it in VS Code.**

<a href="https://minimal.dev/docs"><img src="https://img.shields.io/badge/Docs-read-blue?style=for-the-badge" alt="Docs"></a>
<a href="https://discord.com/invite/qgX8sm6X7G"><img src="https://img.shields.io/badge/Discord-join-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>

[Minimal](https://minimal.dev) runs each box in its own microVM on your own
computer. This extension creates, opens and tidies Minimal boxes from
VS Code: each box is a Remote-SSH host, and Microsoft's Remote - SSH does the
rest (terminals, extensions, port forwarding, the agent all run in the box).

## Requirements

- macOS with [Minimal](https://minimal.dev/docs) installed (`min` 0.7.0 or newer).
- Microsoft's Remote - SSH extension, `ms-vscode-remote.remote-ssh` (Set up
  offers to install it).
- `jq` and `python3` on the host.

## Getting started

1. Open the **Minimal** view in the activity bar.
2. Click **Set up Minimal boxes**. Set up adds one `Include` line to the top
   of `~/.ssh/config` and a marked block to VS Code's `settings.json`, backing
   up both first, and gives Copilot and Claude Code Minimal's skills in
   `~/.copilot/skills` and `~/.claude/skills`; **Minimal: Remove Setup**
   takes them out again.
3. **New Box from Folder…** copies a folder into a new box at `/workbench`
   and opens a window on it. **New Empty Box** starts one with an empty
   `/workbench`.

The box is a copy: edits inside it do not change the folder on your Mac.
Get work out with git (commit and push from the box's terminal).

## Commands

| Command | Does |
|---|---|
| **New Box from Folder…** | a new box from a folder (also on a folder's right-click menu in the Explorer) |
| **New Empty Box** | a new box with an empty `/workbench`, named `box-…` by Minimal |
| **Open Box…** / **Open Box in New Window…** | connect to a box; clicking it in the view does the same |
| **Destroy Box…** | asks first, and again when the box has changes Minimal has not saved; the box and anything not pushed are gone |
| **Clean Up Idle Boxes…** | asks about each box nothing is connected to, oldest first |
| **Run Doctor** | checks Minimal, Remote-SSH and the setup; output in **Output → Minimal** |
| **Remove Setup** | undoes Set up; boxes keep running |

A window connected to a box shows its name in the status bar.

## What stays on your Mac

- Each box is reached through `ssh min-vscode.NAME`, whose sshd runs inside
  the box over Minimal's own exec channel: nothing listens on a port.
- The box's host key is pinned; agent and X11 forwarding are off.
- Nothing is destroyed without your click on **Destroy**.

## More

- [min-vscode](https://github.com/norrietaylor/vscode): this extension and
  the `min-vscode` CLI it runs, with the full docs
- [minimal](https://github.com/gominimal/minimal): the `min` CLI, daemon and microVM host
- [Documentation](https://minimal.dev/docs)
