// Minimal Boxes: VS Code UI over the min-vscode CLI.
// Every action is a `min-vscode` call; the CLI keeps all the invariants
// (pinned keys, opt-in gates, explicit destroy). The extension runs on the
// host (extensionKind "ui"), also in remote windows, because min is a host tool.
import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const TOOL = 'min-vscode';
const HOST_PREFIX = 'min-vscode.';
const WORKDIR = '/workbench';
const SSH_CONF = path.join(os.homedir(), '.ssh', `${TOOL}.conf`);
const CLI_LINK = path.join(os.homedir(), '.local', 'bin', TOOL);
const EXIT_IN_USE = 3; // destroy --if-idle: something connected meanwhile
const EXIT_UNSAVED = 4; // destroy: min wants a confirmation for unsaved changes

interface Box {
  name: string;
  status: string;
  project: string;
  own: boolean;
  empty: boolean; // made by new --empty
  in_use: boolean;
  idle: number | null;
}

interface Result { code: number; stdout: string; stderr: string; kept?: boolean }

let out: vscode.OutputChannel;
let bundled: string;

// The CLI to run: a checkout that ~/.local/bin/min-vscode points to (dev),
// else the copy bundled in this extension.
function cli(): string {
  try {
    const real = fs.realpathSync(CLI_LINK);
    if (!real.includes(`${path.sep}extensions${path.sep}`)) return real;
  } catch { /* no link yet */ }
  return bundled;
}

function run(args: string[]): Promise<Result> {
  const env = { ...process.env };
  // VS Code's own CLI, so doctor can check Remote-SSH without the shell command.
  const editor = path.join(vscode.env.appRoot, 'bin', 'code');
  if (!env.MIN_VSCODE_EDITOR_BIN && fs.existsSync(editor)) env.MIN_VSCODE_EDITOR_BIN = editor;
  out.appendLine(`$ ${TOOL} ${args.join(' ')}`);
  return new Promise((resolve) => {
    const p = spawn('/bin/sh', [cli(), ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; out.append(String(d)); });
    p.on('error', (e) => resolve({ code: -1, stdout, stderr: String(e) }));
    p.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

// The CLI's last stderr line, for an error message.
function why(r: Result): string {
  const lines = r.stderr.trim().split('\n');
  return lines[lines.length - 1] || `exit ${r.code}`;
}

async function failed(what: string, r: Result): Promise<void> {
  const pick = await vscode.window.showErrorMessage(`${what}: ${why(r)}`, 'Show Output');
  if (pick) out.show();
}

function age(s: number): string {
  if (s >= 86400) return `${Math.floor(s / 86400)}d`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 60)}m`;
}

function isSetUp(): boolean { return fs.existsSync(SSH_CONF); }

// Drop VS Code's recent-list entries for boxes `gone` says are gone, so a
// click there does not send Remote-SSH after a host that no longer exists.
// Internal workbench commands: on any failure, log and leave the list alone.
async function forgetRecent(gone: (name: string) => boolean): Promise<void> {
  const prefix = `ssh-remote+${HOST_PREFIX}`;
  try {
    const recent = await vscode.commands.executeCommand<{ workspaces?: Array<{ folderUri?: vscode.Uri }> }>(
      '_workbench.getRecentlyOpened');
    for (const w of recent?.workspaces ?? []) {
      if (!w.folderUri) continue;
      const uri = w.folderUri instanceof vscode.Uri ? w.folderUri : vscode.Uri.from(w.folderUri);
      if (uri.scheme !== 'vscode-remote' || !uri.authority.startsWith(prefix)) continue;
      if (gone(uri.authority.slice(prefix.length))) {
        await vscode.commands.executeCommand('_workbench.removeFromRecentlyOpened', uri);
        out.appendLine(`removed ${uri.toString()} from the recent list`);
      }
    }
  } catch (e) {
    out.appendLine(`recent list not pruned: ${e}`);
  }
}

async function listBoxes(): Promise<Box[]> {
  if (!isSetUp()) return [];
  const r = await run(['status', '--json']);
  if (r.code !== 0) { out.appendLine(`status failed: ${why(r)}`); return []; }
  const all = JSON.parse(r.stdout) as Box[];
  const live = new Set(all.map((s) => s.name));
  void forgetRecent((n) => !live.has(n)); // only from a successful listing
  return all.filter((s) => s.own); // D5
}

class Item extends vscode.TreeItem {
  constructor(readonly sb: Box) {
    super(sb.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'box';
    const state = sb.status !== 'active' ? sb.status
      : sb.in_use ? 'in use'
      : sb.idle !== null ? `idle ${age(sb.idle)}` : 'idle';
    this.description = state;
    this.tooltip = `${sb.name}\n${sb.empty ? 'empty box' : sb.project}\n${state}`;
    this.iconPath = new vscode.ThemeIcon(sb.status !== 'active' ? 'vm-outline' : sb.in_use ? 'vm-active' : 'vm');
    this.command = { command: 'minimal.open', title: 'Open', arguments: [this] };
  }
}

class Boxes implements vscode.TreeDataProvider<Item> {
  private changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  refresh(): void { this.changed.fire(); }
  getTreeItem(i: Item): Item { return i; }
  async getChildren(): Promise<Item[]> {
    return (await listBoxes()).map((s) => new Item(s));
  }
}

// A box from a tree item, or picked from the list.
async function choose(item: Item | undefined, filter: (s: Box) => boolean = () => true): Promise<Box | undefined> {
  if (item) return item.sb;
  const all = (await listBoxes()).filter(filter);
  if (all.length === 0) { vscode.window.showInformationMessage('No Minimal boxes.'); return; }
  const pick = await vscode.window.showQuickPick(
    all.map((s) => ({ label: s.name, description: s.empty ? 'empty' : s.project, sb: s })),
    { placeHolder: 'Box' });
  return pick?.sb;
}

// Prepare the box (pins its key, refreshes stanza and settings), then open
// /workbench over Remote-SSH: in this window when it has nothing open.
async function openBox(name: string, newWindow?: boolean): Promise<void> {
  const r = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Connecting to ${name}…` },
    () => run(['attach', name, '--no-window']));
  if (r.code !== 0) return failed(`Could not open ${name}`, r);
  const forceNewWindow = newWindow ?? (vscode.workspace.workspaceFolders !== undefined || vscode.env.remoteName !== undefined);
  const uri = vscode.Uri.parse(`vscode-remote://ssh-remote+${HOST_PREFIX}${name}${WORKDIR}`);
  await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow });
}

async function create(args: string[], title: string, view: Boxes): Promise<void> {
  const r = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title }, () => run([...args, '--no-window']));
  view.refresh();
  if (r.code !== 0) return failed('Could not create the box', r);
  const host = r.stdout.trim().split('\n').pop() ?? '';
  if (!host.startsWith(HOST_PREFIX)) return failed('Could not create the box', { ...r, stderr: `unexpected output: ${host}` });
  await openBox(host.slice(HOST_PREFIX.length));
}

async function doctor(quiet: boolean): Promise<boolean> {
  const r = await run(['doctor']);
  out.appendLine(r.stdout);
  if (r.code === 0) {
    if (!quiet && await vscode.window.showInformationMessage('Minimal: doctor found no problems.', 'Show Output')) out.show();
    return true;
  }
  if (!quiet) out.show();
  const pick = await vscode.window.showWarningMessage('Minimal: doctor found problems.', 'Show Output');
  if (pick) out.show();
  return false;
}

async function setUp(view: Boxes): Promise<void> {
  if (!vscode.extensions.getExtension('ms-vscode-remote.remote-ssh')) {
    const pick = await vscode.window.showErrorMessage(
      "Minimal needs Microsoft's Remote - SSH extension (ms-vscode-remote.remote-ssh).", 'Install');
    if (pick) await vscode.commands.executeCommand('workbench.extensions.installExtension', 'ms-vscode-remote.remote-ssh');
    return;
  }
  const r = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Setting up Minimal…' }, () => run(['setup']));
  await vscode.commands.executeCommand('setContext', 'minimal.setUp', isSetUp());
  view.refresh();
  if (r.code !== 0) return failed('Minimal setup finished with problems', r);
  if (await doctor(true)) vscode.window.showInformationMessage('Minimal is set up. Create a box from the Minimal view.');
}

async function removeSetup(view: Boxes): Promise<void> {
  const ok = await vscode.window.showWarningMessage('Remove Minimal setup?', {
    modal: true,
    detail: 'Takes the Include out of ~/.ssh/config and the block out of settings.json. Boxes keep running; set up again to reach them.',
  }, 'Remove');
  if (ok !== 'Remove') return;
  const r = await run(['setup', '--remove']);
  await vscode.commands.executeCommand('setContext', 'minimal.setUp', isSetUp());
  view.refresh();
  if (r.code !== 0) return failed('Could not remove Minimal setup', r);
}

// destroy -y [extra] NAME. When min refuses because the box has changes it
// has not saved, a second modal asks before -y --force discards them.
async function destroyRun(name: string, extra: string[] = []): Promise<Result> {
  const r = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Destroying ${name}…` },
    () => run(['destroy', '-y', ...extra, name]));
  if (r.code !== EXIT_UNSAVED) return r;
  const said = r.stderr.split('\n').filter((l) => l.trim() && !l.startsWith(`[${TOOL}]`) && !l.includes('without confirmation'));
  const ok = await vscode.window.showWarningMessage(`${name} has changes Minimal has not saved.`, {
    modal: true,
    detail: `${said.length ? said.join('\n') + '\n\n' : ''}Destroying it discards them.`,
  }, 'Discard and Destroy');
  if (ok !== 'Discard and Destroy') return { code: 0, stdout: '', stderr: '', kept: true };
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Destroying ${name}…` },
    () => run(['destroy', '-y', '--force', ...extra, name]));
}

// D6: a modal whose destructive button is clicked is the explicit y.
async function destroy(item: Item | undefined, view: Boxes): Promise<void> {
  const sb = await choose(item);
  if (!sb) return;
  const ok = await vscode.window.showWarningMessage(`Destroy box ${sb.name}?`, {
    modal: true,
    detail: `${sb.empty ? 'An empty box' : sb.project}${sb.in_use ? '\nIt is in use: a window or ssh is connected to it.' : ''}\n` +
      'Its /workbench and anything not pushed is lost.',
  }, 'Destroy');
  if (ok !== 'Destroy') return;
  const r = await destroyRun(sb.name);
  view.refresh();
  if (r.code !== 0) return failed(`Could not destroy ${sb.name}`, r);
  if (r.kept) return;
  await forgetRecent((n) => n === sb.name);
  // This window was on that box: leave it instead of letting Remote-SSH retry a gone host.
  if (thisBox() === sb.name) await vscode.commands.executeCommand('workbench.action.remote.close');
}

// gc from the UI: one question per idle box, oldest first; the CLI
// re-checks idleness right before each destroy (--if-idle).
async function cleanUp(view: Boxes): Promise<void> {
  const idle = (await listBoxes())
    .filter((s) => s.status === 'active' && !s.in_use)
    .sort((a, b) => (b.idle ?? 0) - (a.idle ?? 0));
  if (idle.length === 0) { vscode.window.showInformationMessage('No idle Minimal boxes.'); return; }
  for (const sb of idle) {
    const ok = await vscode.window.showWarningMessage(`Destroy idle box ${sb.name}?`, {
      modal: true,
      detail: `${sb.empty ? 'An empty box' : sb.project}\nNothing connected${sb.idle !== null ? ` for ${age(sb.idle)}` : ''}.`,
    }, 'Destroy', 'Keep');
    if (ok === undefined) break;
    if (ok !== 'Destroy') continue;
    const r = await destroyRun(sb.name, ['--if-idle']);
    if (r.code === EXIT_IN_USE) vscode.window.showInformationMessage(`${sb.name} is in use now; kept.`);
    else if (r.code !== 0) await failed(`Could not destroy ${sb.name}`, r);
    else if (!r.kept) await forgetRecent((n) => n === sb.name);
  }
  view.refresh();
}

// The box this window is connected to, if any.
function thisBox(): string | undefined {
  const auth = vscode.workspace.workspaceFolders?.[0]?.uri.authority ?? '';
  const prefix = `ssh-remote+${HOST_PREFIX}`;
  return auth.startsWith(prefix) ? auth.slice(prefix.length) : undefined;
}

function statusBar(ctx: vscode.ExtensionContext): void {
  const name = thisBox();
  if (!name) return;
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.text = `$(vm) ${name}`;
  item.tooltip = `Minimal box ${name}`;
  item.command = 'workbench.view.extension.minimal';
  item.show();
  ctx.subscriptions.push(item);
}

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  out = vscode.window.createOutputChannel('Minimal');
  bundled = path.join(ctx.extensionPath, 'cli', 'bin', TOOL);
  // A VSIX may not keep exec bits; ssh runs the CLI through the ~/.local/bin link.
  for (const f of [bundled, path.join(ctx.extensionPath, 'cli', 'bin', `${TOOL}-config`)]) {
    try { fs.chmodSync(f, 0o755); } catch { /* dev host without cli/ */ }
  }
  const view = new Boxes();
  const tree = vscode.window.createTreeView('minimal.boxes', { treeDataProvider: view });
  let timer: NodeJS.Timeout | undefined;
  const poll = (on: boolean) => {
    if (timer) clearInterval(timer);
    timer = on ? setInterval(() => view.refresh(), 30_000) : undefined;
  };
  tree.onDidChangeVisibility((e) => { poll(e.visible); if (e.visible) view.refresh(); });
  ctx.subscriptions.push(out, tree, { dispose: () => poll(false) },
    vscode.commands.registerCommand('minimal.setup', () => setUp(view)),
    vscode.commands.registerCommand('minimal.removeSetup', () => removeSetup(view)),
    vscode.commands.registerCommand('minimal.newFromFolder', async (uri?: vscode.Uri) => {
      if (!uri) {
        // A file: start folder keeps the dialog on the Mac; in a remote window
        // it would otherwise browse the box (or fail on a disconnected one).
        const here = vscode.workspace.workspaceFolders?.find((f) => f.uri.scheme === 'file')?.uri
          ?? vscode.Uri.file(os.homedir());
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
          defaultUri: here, openLabel: 'Create Box', title: 'Folder to copy into the box',
        });
        uri = picked?.[0];
      }
      if (uri) await create(['new', uri.fsPath], `Creating a box for ${path.basename(uri.fsPath)}…`, view);
    }),
    vscode.commands.registerCommand('minimal.newEmpty', () => create(['new', '--empty'], 'Creating an empty box…', view)),
    vscode.commands.registerCommand('minimal.open', async (item?: Item) => {
      const sb = await choose(item); if (sb) await openBox(sb.name);
    }),
    vscode.commands.registerCommand('minimal.openNewWindow', async (item?: Item) => {
      const sb = await choose(item); if (sb) await openBox(sb.name, true);
    }),
    vscode.commands.registerCommand('minimal.destroy', (item?: Item) => destroy(item, view)),
    vscode.commands.registerCommand('minimal.cleanUp', () => cleanUp(view)),
    vscode.commands.registerCommand('minimal.refresh', () => view.refresh()),
    vscode.commands.registerCommand('minimal.doctor', () => doctor(false)),
  );
  await vscode.commands.executeCommand('setContext', 'minimal.setUp', isSetUp());
  statusBar(ctx);
  void listBoxes(); // prunes the recent list of boxes destroyed elsewhere
  // After an update the bundled CLI moved or its loadout changed: setup
  // re-points ~/.local/bin (the path every ssh stanza runs) and re-copies the
  // loadout's directory. Only once set up: setup is the opt-in.
  if (isSetUp() && cli() === bundled && fs.existsSync(bundled)) {
    let linked = '';
    try { linked = fs.realpathSync(CLI_LINK); } catch { /* missing */ }
    const loadoutDir = path.join(ctx.extensionPath, 'cli', 'loadouts', 'vscode');
    const copyMark = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
      'minimal', 'loadouts', 'vscode', `.${TOOL}-copy`);
    let copiedFrom = '';
    try { copiedFrom = fs.readFileSync(copyMark, 'utf8').trim(); } catch { /* not copied yet */ }
    // A bundled Minimal skill with nothing (neither ours nor the user's) at its
    // place in ~/.copilot/skills or ~/.claude/skills: setup installs it.
    let skills: string[] = [];
    try { skills = fs.readdirSync(path.join(ctx.extensionPath, 'cli', 'skills'), { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name); } catch { /* none bundled */ }
    const skillMissing = ['.copilot', '.claude'].some((a) =>
      skills.some((n) => !fs.existsSync(path.join(os.homedir(), a, 'skills', n))));
    if (linked !== fs.realpathSync(bundled) || copiedFrom !== fs.realpathSync(loadoutDir) || skillMissing) {
      const r = await run(['setup']);
      if (r.code !== 0) out.appendLine(`setup after update: ${why(r)}`);
    }
  }
}

export function deactivate(): void { /* subscriptions dispose */ }
