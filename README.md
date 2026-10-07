# Claude

Add-ons for Claude by Teddymazrin.

## What's here

| Folder | What it is |
| --- | --- |
| [claude-code-mods](claude-code-mods/README.md) | Mods for Claude Code: panes, status rows and safety checks that run inside your sessions. They work in the terminal and in the desktop app's Code tab |
| [claude-code-skills](claude-code-skills/) | Skills for Claude. Coming soon |

## Install

Everything here is published as the `teddymazrin-mods` plugin marketplace.

1. **Add the marketplace (one time).** At the Claude Code prompt, run:

   ```
   /plugin marketplace add Teddymazrin/Claude
   ```

2. **Install what you want.** Each add-on installs with one line. Press Enter for the user scope:

   ```
   /plugin install <name>@teddymazrin-mods
   ```

   The names and what each one does are in each folder's README.

3. **Load it.** Run `/reload-plugins`, or start a new session.

## Updates

- **Automatic (recommended):** run `/plugin`, open **Marketplaces**, pick **teddymazrin-mods** and choose **Enable auto-update**. Claude Code then installs new versions in the background; run `/reload-plugins` to use them.
- **By hand:** in a regular terminal (not at the Claude Code prompt), run:

  ```
  claude plugin marketplace update teddymazrin-mods
  claude plugin update <name>@teddymazrin-mods
  ```

  Then run `/reload-plugins`. `claude plugin list` shows what's installed and at which version.

## License

MIT. See [LICENSE](claude-code-mods/LICENSE).
