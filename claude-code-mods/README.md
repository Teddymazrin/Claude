# Claude Code mods

Four mods for the Claude Code terminal.

## Before you install: add the marketplace (one time)

At the Claude Code prompt, run this once:

```
/plugin marketplace add Teddymazrin/Claude
```

This registers the `teddymazrin-mods` marketplace. After that, each mod below installs with one line (press Enter for the user scope).

## Bare View

A live task checklist above the prompt: the goal, a progress bar, each step and a timer. Tool calls and in-progress text are hidden so only the checklist and the final answer show. `/checklist` toggles the full view back on. A tally line counts the tool calls behind each prompt, naming each built-in tool and each MCP server, with the tool running right now on the right: `⚙ 4 tool calls · Built-in 3: Bash 2, Read 1 · MCP 1: microsoft-learn 1   ▶ Bash`.

```
/plugin install bare-view@teddymazrin-mods
```

## Control Panel

Shows as **◆ Control Panel** in the footer, with a status row under the prompt:

```
Subscription | Opus 5.5 | effort Medium | ctx ░░░░░░░░ 1% | 6% 4h 12m
```

- **Subscription / API:** how this session is billed. **Subscription** is your Claude plan (usage comes out of its limits); **API** is an API key, Bedrock or Vertex (billed per token). It only shows this, it doesn't change it. Worked out on your computer: Subscription once Claude Code reports plan usage limits, otherwise API if `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, a Bedrock/Vertex setting or a key in `~/.claude.json` is present. It only checks that a key exists; it never reads, stores or sends it
- **Model** (`Opus 5.5`): the model your requests go out with: the one you picked in the panel, or what Claude Code last used
- **Effort** (`effort Medium`): the reasoning effort your requests go out with, picked the same way
- **Context** (`ctx ░░░░░░░░ 1%`): how full the conversation's context window is. Green under 50%, gold to 75%, orange above
- **Usage** (`6% 4h 12m`): how much of your plan's 5-hour usage limit you've used, and the time until it resets. Shown on a subscription once Claude Code reports it

Click **◆ Control Panel** (or run `/control-panel`) to open the panel:

- **Model:** pick Haiku, Sonnet, Opus, Opus 1M or Fable (keys `1`-`5`)
- **Effort:** pick Low, Medium, High, XHigh or Max (keys `l`, `m`, `h`, `x`, `z`)
- **Mods:** switch each of your installed mods on or off

```
/plugin install control-panel@teddymazrin-mods
```

## Action Steps

When a task leaves you something to do yourself (run the script, set a parameter, check the portal), Claude sends the steps to a side pane that opens by itself, so they don't get lost in the chat:

```
Check my Azure roles                       3 steps
1: Install the Az module
     Install-Module Az -Scope CurrentUser   [Copy]
2: Run the script with your tenant ID
     .\Get-MyAzureRoles.ps1 -TenantId "<id>" [Copy]
3: Sign in when the browser opens
```

- Click a number to tick that step off (the count then reads `3 steps · 1 done`); **Copy** puts its command on the clipboard
- Earlier tasks stay listed under **Earlier**, kept across sessions (the last 8)
- The pane docks on the right in fullscreen from 110 columns; in a narrower window the steps show in a box above the prompt instead. `/action-steps` opens the pane by hand
- Close it with ✕; it opens again the next time there are new steps

```
/plugin install action-steps@teddymazrin-mods
```

## Guard Rails

Before Claude runs a risky command or edits a sensitive file, Guard Rails stops and asks: **Block** or **Allow once**. Anything else runs as normal.

It asks about:

- **Deletes:** `rm -rf`, `Remove-Item -Recurse -Force`, `git clean -f`
- **Git history:** `git push --force` (not `--force-with-lease`), `git reset --hard`
- **Azure and Microsoft Graph:** `Remove-Az…`, `Remove-Mg…`, `az … delete`
- **The machine:** `Format-Volume`, `Clear-Disk`, `diskpart`, `Restart-Computer`, `Stop-Computer`, `shutdown`
- **Files:** edits to `~/.claude/settings.json`, `.env` files and anything under `.ssh`

Commands are checked in both Bash and PowerShell. A blocked call tells Claude not to retry or work around it, and shows a toast. If the question is dismissed, or nobody can answer it (`claude -p`), the call is blocked.

`/guard-rails` lists the last 20 calls it stopped or let through, newest first.

```
/plugin install guard-rails@teddymazrin-mods
```

## Updating the mods

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
