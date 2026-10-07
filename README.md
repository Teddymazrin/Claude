# Claude

Mods for the Claude Code terminal by Teddymazrin, published as the `teddymazrin-mods` plugin marketplace.

## Mods

| Mod | What it does |
| --- | --- |
| [Bare View](claude-code-mods/README.md#bare-view) | A live task checklist above the prompt, with a tally of every tool call by name; hides the tool-call noise |
| [Control Panel](claude-code-mods/README.md#control-panel) | A status row (plan, model, effort, context, usage) and a panel to pick the model and effort and switch mods on and off |
| [Action Steps](claude-code-mods/README.md#action-steps) | Numbered follow-up steps (run this, sign in, check that) in a side pane that opens by itself after a task |
| [Guard Rails](claude-code-mods/README.md#guard-rails) | Asks before risky commands and edits (rm -rf, force pushes, Azure deletes, settings, .env and SSH files) and logs what it stopped |

## Install

Run these at the Claude Code prompt.

### 1. Add the marketplace (one time)

```
/plugin marketplace add Teddymazrin/Claude
```

This registers the `teddymazrin-mods` marketplace with Claude Code. You only do it once; after that, installs and updates find it by name.

### 2. Install the mods you want

One line per mod. Press Enter for the user scope:

```
/plugin install bare-view@teddymazrin-mods
/plugin install control-panel@teddymazrin-mods
/plugin install action-steps@teddymazrin-mods
/plugin install guard-rails@teddymazrin-mods
```

## Update

### Turn on auto-update (recommended)

Auto-update is off for this marketplace until you turn it on; a marketplace can't switch it on for you. Once a mod is installed:

1. Run `/plugin`
2. Open **Marketplaces** and pick **teddymazrin-mods**
3. Choose **Enable auto-update**

Claude Code then checks in the background, a few minutes into a session. When a mod has a new version it installs it and shows `Plugin updated: <name> · Run /reload-plugins to apply`. Run `/reload-plugins` to use it now, or it loads the next time Claude Code starts.

### Update by hand

Run these in a regular terminal (PowerShell, bash), not at the Claude Code prompt, where `/plugin update` opens the plugin menu instead. The first line refreshes your local copy of the marketplace, which is what `update` compares against:

```
claude plugin marketplace update teddymazrin-mods
claude plugin update bare-view@teddymazrin-mods
claude plugin update control-panel@teddymazrin-mods
claude plugin update action-steps@teddymazrin-mods
```

Then restart Claude Code, or run `/reload-plugins` in a session that is already open. A mod that is already on the latest version is left as it is. `claude plugin list` shows what is installed and at which version.

From inside Claude Code you can also run `/plugin`, find the mod under your installed plugins and update it from there.

More detail on each mod: [claude-code-mods/README.md](claude-code-mods/README.md).
