# Claude

Mods for the Claude Code terminal by Teddymazrin, published as the `teddymazrin-mods` plugin marketplace.

## Mods

| Mod | What it does |
| --- | --- |
| [Bare View](claude-code-mods/README.md#bare-view) | A live task checklist above the prompt, with a tally of every tool call by name; hides the tool-call noise |
| [Control Panel](claude-code-mods/README.md#control-panel) | A status row (plan, model, effort, context, usage) and a panel to pick the model and effort and switch mods on and off |
| [Action Steps](claude-code-mods/README.md#action-steps) | Numbered follow-up steps (run this, sign in, check that) in a side pane that opens by itself after a task |

## Install

At the Claude Code prompt, one line per mod. Answer `y` to add the marketplace, then press Enter for the user scope:

```
/plugin install bare-view --marketplace Teddymazrin/Claude
/plugin install control-panel --marketplace Teddymazrin/Claude
/plugin install action-steps --marketplace Teddymazrin/Claude
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
