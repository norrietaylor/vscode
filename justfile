# min-vscode: Minimal sessions as VS Code Remote-SSH hosts. Every recipe runs on the HOST.
# `just --list` for the menu.


_default:
    @just --list

# shellcheck, py_compile, and the test suite (normal and long host prefix).
check:
    #!/bin/sh
    set -eu
    shellcheck -s sh bin/min-vscode tests/run.sh tests/stubs/*
    python3 -m py_compile bin/min-vscode-config
    sh tests/run.sh
    LONG_PREFIX=1 sh tests/run.sh
    if [ -d extension/node_modules ]; then (cd extension && npm run --silent check)
    else echo "extension/node_modules missing: run just ext-deps to type-check the extension" >&2; exit 1; fi

# Install the extension's build tools (TypeScript, vsce) into extension/node_modules.
ext-deps:
    cd extension && npm ci

# Build min-vscode.vsix: the extension plus the bundled CLI, merger and loadout (same layout as the repo).
vsix: ext-deps
    #!/bin/sh
    set -eu
    rm -rf extension/cli extension/out
    mkdir -p extension/cli/bin extension/cli/loadouts
    cp bin/min-vscode bin/min-vscode-config extension/cli/bin/
    chmod 755 extension/cli/bin/*
    cp -R loadouts/vscode.toml loadouts/vscode extension/cli/loadouts/
    cp -R skills extension/cli/skills
    cp LICENSE extension/LICENSE
    cd extension && npm run --silent compile && npm run --silent package

# Link min-vscode into ~/.local/bin, install the `vscode` loadout, write the ssh stanzas, wire VS Code's settings.
install:
    "$PWD/bin/min-vscode" setup

# Minimal's skills for VS Code's agents (Copilot, Claude Code), vendored from gominimal/minimal-skills (MIT) at a pinned commit
# (version 0.7.0): the host ones in skills/ (setup installs them into ~/.copilot/skills and ~/.claude/skills on the Mac),
# minimal-sandbox in loadouts/vscode/skills/ (the loadout copies it into every box).
skills_commit := "d3ccc13ed4286978e2581a30eb3859dcbed59076"
skills_sha256 := "bea8b245fc5e32de55ca4175dfc46c271c3a9ee8befa5d4c276336fc7a8aa993"

# Re-fetch the vendored skills (after changing skills_commit and skills_sha256).
skills:
    #!/bin/sh
    set -eu
    t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
    curl -fsSL "https://codeload.github.com/gominimal/minimal-skills/tar.gz/{{ skills_commit }}" -o "$t/a.tgz"
    got=$(shasum -a 256 "$t/a.tgz" 2>/dev/null || sha256sum "$t/a.tgz"); got=${got%% *}
    [ "$got" = "{{ skills_sha256 }}" ] || { echo "sha256 mismatch: $got" >&2; exit 1; }
    tar -xzf "$t/a.tgz" -C "$t" --strip-components 1
    rm -rf skills loadouts/vscode/skills
    mkdir -p skills loadouts/vscode/skills
    for d in "$t"/skills/*/; do
        d=${d%/}; n=$(basename "$d")   # no trailing slash: BSD cp would copy the contents only
        if [ "$n" = minimal-sandbox ]; then cp -R "$d" loadouts/vscode/skills/; else cp -R "$d" skills/; fi
    done
    cp "$t/LICENSE" skills/LICENSE
    cp "$t/LICENSE" loadouts/vscode/skills/LICENSE
    echo "skills at {{ skills_commit }}: $(ls skills | grep -v LICENSE | tr '\n' ' ')+ minimal-sandbox (box)"

# Write Host min-vscode.NAME stanzas to ~/.ssh/min-vscode.conf and Include them from the top of ~/.ssh/config.
ssh-config:
    "$PWD/bin/min-vscode" ssh-config

# Opt in to the VS Code settings (remote.SSH.useLocalServer false, remote.SSH.remotePlatform per session) in the user settings.json.
vscode-config:
    "$PWD/bin/min-vscode" config

# Undo `install`, touching only what is ours: settings entries, ssh Include, loadout link and copy, CLI link.
uninstall:
    "$PWD/bin/min-vscode" setup --remove
