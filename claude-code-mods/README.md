# Claude Code mods

Five mods for Claude Code. They work in the terminal and in the desktop app's Code tab.

| Mod | What it does |
| --- | --- |
| [Bare View](#bare-view) | A live task checklist above the prompt, with a tally of every tool call and a peek at each step's calls; hides the tool-call noise |
| [Control Panel](#control-panel) | A status row (plan, model, effort, context, usage) and a panel to pick the model and effort, reload or clear, and switch mods on and off |
| [Action Steps](#action-steps) | Follow-up steps (run this, sign in, check that) in a side pane you can tick off |
| [Guard Rails](#guard-rails) | Asks before risky commands and edits, and logs what it stopped |
| [Context Handoff](#context-handoff) | Warns as the context window fills, and writes a handoff note you copy into a fresh session |

## Install

At the Claude Code prompt, add the marketplace once:

```
/plugin marketplace add Teddymazrin/Claude
```

Then install the mods you want, one line each (press Enter for the user scope):

```
/plugin install bare-view@teddymazrin-mods
/plugin install control-panel@teddymazrin-mods
/plugin install action-steps@teddymazrin-mods
/plugin install guard-rails@teddymazrin-mods
/plugin install context-handoff@teddymazrin-mods
```

Run `/reload-plugins` to load them, or start a new session.

## Bare View

A live task checklist above the prompt: the goal, a progress bar, each step and a timer. Tool calls and in-progress text are hidden, so only the checklist and the final answer show.

- **Tally:** a line counts the tool calls behind each prompt, naming each built-in tool and each MCP server, with the tool running right now on the right: `⚙ 4 tool calls · Built-in 3: Bash 2, Read 1 · MCP 1: microsoft-learn 1   ▶ Bash`
- **Peek at a step:** a step that has made tool calls shows a count at the end of its row (`▸3`). Click the step to list its calls under it, each with what it did (the command, file or search) and a red `✗` for any that failed. Click again to hide them. The newest 8 show, with a count of the earlier ones
- **`/checklist`:** switches the full view back on, and off again

## Control Panel

Shows as **◆ Control Panel** in the footer, with a status row under the prompt:

```
Subscription | Opus 5.5 | effort Medium | ctx ░░░░░░░░ 1% | 6% 4h 12m
```

- **Subscription / API:** how this session is billed. **Subscription** is your Claude plan (usage comes out of its limits); **API** is an API key, Bedrock or Vertex (billed per token). It only shows this; it doesn't change it. It's worked out on your computer: Subscription once Claude Code reports plan usage limits, otherwise API if `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, a Bedrock or Vertex setting, or a key in `~/.claude.json` is present. It only checks that a key exists; it never reads, stores or sends it
- **Model** (`Opus 5.5`): the model your requests go out with: the one you picked in the panel, or what Claude Code last used
- **Effort** (`effort Medium`): the reasoning effort your requests go out with, picked the same way
- **Context** (`ctx ░░░░░░░░ 1%`): how full the conversation's context window is. Green under 50%, gold to 75%, orange above
- **Usage** (`6% 4h 12m`): how much of your plan's 5-hour usage limit you've used, and the time until it resets. Shown on a subscription once Claude Code reports it

Click **◆ Control Panel** (or run `/control-panel`) to open the panel:

- **Model:** pick Haiku, Sonnet, Opus, Opus 1M or Fable (keys `1`-`5`)
- **Effort:** pick Low, Medium, High, XHigh or Max (keys `l`, `m`, `h`, `x`, `z`)
- **Run:** **↻ Reload plugins** runs `/reload-plugins`; **⌫ Clear** runs `/clear` after asking you to confirm
- **Mods:** switch each installed mod on or off. The switch is saved straight away, and one `/reload-plugins` runs 1.5 seconds after your last click, so flipping several mods quickly applies them all at once

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

## Context Handoff

Keeps a long session from losing its thread when the context window fills.

- **Warnings:** a toast at 70% context full, and a more urgent one at 85%. Each shows once, and again after `/clear` or a compact brings the context back down
- **`/handoff`:** Claude writes a handoff note for this project: the goal, what's done, what's in progress, next steps, key files, and decisions and gotchas. It goes straight to the Handoff pane; no file is written
- **The Handoff pane:** opens on the right with the note and one button, **⧉ Copy prompt**. It copies the whole note with a line asking Claude to sum up where things stand and wait for you to confirm the next step. In a narrow window a box above the prompt shows **⧉ Copy prompt** instead, plus **▸ Open** for the full note
- **`/handoff open`:** shows the saved note again without writing a new one. The mod keeps the last note for each project (up to 20 projects), and a new note replaces the old one
- **At session start:** when a note from the last 7 days exists for the project, a toast reminds you it's there

The usual flow is `/handoff`, then **⧉ Copy prompt**, then `/clear` (or **Clear** in Control Panel), then paste.

## Updating the mods

### Turn on auto-update (recommended)

Auto-update is off for this marketplace until you turn it on; a marketplace can't switch it on for you. Once a mod is installed:

1. Run `/plugin`
2. Open **Marketplaces** and pick **teddymazrin-mods**
3. Choose **Enable auto-update**

Claude Code then checks in the background, a few minutes into a session. When a mod has a new version it installs it and shows `Plugin updated: <name> · Run /reload-plugins to apply`. Run `/reload-plugins` to use it now, or it loads the next time Claude Code starts.

### Update by hand

Run these in a regular terminal (PowerShell, bash). Don't run them at the Claude Code prompt, where `/plugin update` usually just opens the plugin menu. The first line refreshes your local copy of the marketplace, which is what `update` compares against:

```
claude plugin marketplace update teddymazrin-mods
claude plugin update bare-view@teddymazrin-mods
claude plugin update control-panel@teddymazrin-mods
claude plugin update action-steps@teddymazrin-mods
claude plugin update guard-rails@teddymazrin-mods
claude plugin update context-handoff@teddymazrin-mods
```

Then run `/reload-plugins` in a session that's already open, or restart Claude Code. A mod that's already on the latest version is left as it is. `claude plugin list` shows what's installed and at which version.
