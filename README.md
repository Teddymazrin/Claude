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

`/plugin update` compares against your local copy of the marketplace, not GitHub, so refresh that copy first, then update the mods that changed:

```
/plugin marketplace update teddymazrin-mods
/plugin update bare-view@teddymazrin-mods
/plugin update control-panel@teddymazrin-mods
/plugin update action-steps@teddymazrin-mods
/reload-plugins
```

The refresh says how many mods have a new version (`1 plugin bumped`). `/plugin` lists what is installed and at which version.

More detail on each mod: [claude-code-mods/README.md](claude-code-mods/README.md).
