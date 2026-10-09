# Claude Code mods

Six mods for Claude Code. They work in the terminal and in the desktop app's Code tab.

| Mod | Latest | What it does |
| --- | --- | --- |
| [Bare View](#bare-view) | 1.11.0 | A live task checklist above the prompt, with what Claude is doing right now, a tally of every tool call and a peek at each step's calls; folds to one line when finished and hides the tool-call noise |
| [Control Panel](#control-panel) | 1.8.1 | A status row (plan, model, effort, context, cache countdown, 5-hour and weekly limits) and a panel to pick the model and effort, switch Bare View and Guard Rails on or off, and run quick actions |
| [Action Items](#action-items) | 5.0.0 | Everything Claude needs from you, decisions apart from actions, in a box above the prompt; clear old asks you don't need |
| [Guard Rails](#guard-rails) | 1.0.0 | Asks before risky commands and edits, and logs what it stopped |
| [Context Handoff](#context-handoff) | 1.3.0 | Warns as the context window fills, and writes a handoff note you copy into a fresh session |
| [Context Lens](#context-lens) | 1.1.0 | Shows what is filling your context window, by category: system prompt, tools, memory files, MCP servers, skills and messages |

`claude plugin list` shows the version you have installed; if it's behind **Latest**, see [Updating the mods](#updating-the-mods).

## Install

At the Claude Code prompt, add the marketplace once:

```
/plugin marketplace add Teddymazrin/Claude
```

Then install the mods you want, one line each (press Enter for the user scope):

```
/plugin install bare-view@teddymazrin-mods
/plugin install control-panel@teddymazrin-mods
/plugin install action-items@teddymazrin-mods
/plugin install guard-rails@teddymazrin-mods
/plugin install context-handoff@teddymazrin-mods
/plugin install context-lens@teddymazrin-mods
```

Run `/reload-plugins` to load them, or start a new session.

## Bare View

A live task checklist above the prompt: the goal, a progress bar, each step and a timer. Tool calls and in-progress text are hidden, so only the checklist and the final answer show. The final answer leads with the result in a few sentences, and the checklist updates at the start, when the plan changes, and at the end.

- **Activity:** while Claude is working, a row under the progress bar says what it's doing right now, with a timer: `◐ Thinking 6s`, `Writing`, `Waiting for the model`, `Starting Edit`, or `Running Bash` (the tool only, not the command), plus `· 2 agents working` when subagents are busy. It shows on every turn, including slash commands, turns Claude starts by itself (goal `Continuing`), and turns with no task list. While a permission dialog is open it reads `⏸ Waiting for you to approve Bash` in orange (it stays on that until the approved tool finishes)
- **Folds when finished:** once every step is done, the band shrinks to one line, `✓ All 4 done · 2m 13s · 14 tool calls · 1 error ▸`. Click it to see the full checklist, and click `▾ All 4 done` to fold it again
- **Errors vs failures:** a tool call that errors (a missing file, a search with no match, a check Claude re-runs) is only counted, dim: `· 1 error`. A step only shows a pink `✗` and reads **Failed** when Claude marks it failed because its result really didn't happen, such as a rejected push or tests that still fail; the folded line then reads `✗ 3 done · 1 step failed · …`, with each failed step and why under it (`✗ Push to main: GitHub rejected the push`), and opened out the reason sits under the step. Whenever a call errored, Claude's final answer says in one line whether it affected the result
- **Tally:** a line counts the tool calls behind each prompt, split into built-in and MCP: `⚙ 4 tool calls · ▸ Built-in: 3 · ▸ MCP: 1`. Click a group to list the tools it ran under the line (`› Bash 2`, `› microsoft-learn › microsoft_docs_search 1`), and click again to fold it back up
- **Peek at a step:** a step that has made tool calls shows a count at the end of its row (`▸3`). Click the step to list its calls under it. Each shows the tool (`server › tool` for MCP), what it did (the command, file or search), how long it took, and the first line it returned underneath. A call that errored is marked with an orange `!` and the line that says what went wrong underneath (`fatal: Needed a single revision (exit 128)`), not just the exit code. Click again to hide them. The newest 8 show, with a count of the earlier ones
- **`/checklist`:** switches the full view back on, and off again

## Control Panel

Shows as **◆ Control Panel** in the footer, with a status row under the prompt:

```
Subscription | Opus 5.5 | effort Medium | ctx ░░░░░░░░ 1% | cache 42m | usage 6% · resets 4h12m | weekly 31% · resets Fri
```

- **Subscription / API:** how this session is billed. **Subscription** is your Claude plan (usage comes out of its limits); **API** is an API key, Bedrock or Vertex (billed per token). It only shows this; it doesn't change it. It's worked out on your computer: Subscription once Claude Code reports plan usage limits, otherwise API if `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, a Bedrock or Vertex setting, or a key in `~/.claude.json` is present. It only checks that a key exists; it never reads, stores or sends it
- **Model** (`Opus 5.5`): the model your requests go out with: the one you picked in the panel, or what Claude Code last used
- **Effort** (`effort Medium`): the reasoning effort your requests go out with, picked the same way
- **Context** (`ctx ░░░░░░░░ 1%`): how full the conversation's context window is. Green under 50%, gold to 75%, orange above
- **Cache** (`cache 42m`, in red): time until the prompt cache goes cold. While it's warm, your next message re-reads the conversation cheaply; once it shows `cache cold`, the next message re-sends the whole conversation at full price, so a long session is a good time to `/compact` or `/clear` first. Claude Code doesn't tell mods the cache lifetime, so it assumes the usual one: an hour on a subscription, five minutes on an API key, counted from Claude's last reply. Each model has its own cache, so after you switch models it shows `cache cold · new model` until the new model's first reply
- **Usage** (`usage 6% · resets 4h12m`): how much of your plan's rolling 5-hour usage limit you've used, and the time until it resets
- **Weekly** (`weekly 31% · resets Fri`): the same for the 7-day limit. The reset shows as a weekday, or as a countdown once it's under a day away
- Both show on a subscription once Claude Code reports them. Each percentage turns gold at 50% and orange at 75%

Click **◆ Control Panel** (or run `/control-panel`) to open the panel:

- **Model:** pick Haiku, Sonnet, Opus, Opus 1M or Fable (keys `1`-`5`)
- **Effort:** pick Low, Medium, High, XHigh or Max (keys `l`, `m`, `h`, `x`, `z`)
- **Settings:** switch **Bare View** and **Guard Rails** on or off. The switch is saved straight away, and one `/reload-plugins` runs 1.5 seconds after your last click, so flipping both quickly applies them at once. The other mods have no switch and always stay on
- **Actions:** one row each, at the bottom of the panel:
  - **Context Lens ▸ Open:** closes the panel and opens Context Lens in front. Shows only while Context Lens is installed and on
  - **Reload plugins ▸ Run:** runs `/reload-plugins`
  - **Clear chat ▸ Run:** runs `/clear` after asking you to confirm

## Action Items

Whenever Claude needs something from you, it goes in one box above the prompt instead of getting lost in the chat: questions you answer, apart from things you do yourself. It replaced Action Steps and its side pane.

The box has two tabs, so it stays small:

- **? Decide**: questions for you. The first waiting question opens with its options, and its line of context waits behind **▸ info**; the rest wait one line each, and answered ones fold into "✓ N answered". Click an option and your answer goes back to Claude as your reply; with several questions it waits until all are answered and sends them together. **Other…** (or **Answer…** for an open question) puts the question in the prompt box for you to type your own; sending it blank keeps the question open
- **▶ Do**: things you do yourself, numbered. Each shows just the task and the exact command with a **Copy** button. Its **Why:** and how to tell it worked sit behind **▸ info** after the task: click to open them, and again to close. Click the number to tick it off

The box opens on Decide while a question waits and moves to Do once they're answered; click a tab to switch.

**In a short window** the Do tab first drops its blank lines, then keeps the command on one action and folds the rest to one row each (title · command, with Copy). Click a folded action's title (**▸**) to open it, and the open one's title (**▾**) to fold it. Ticked actions fold into **✓ N done ▸ show**, which lists them again so you can untick one.

**Answering by typing:** a typed message doesn't wipe the box. Claude is told which questions are still open and clears only the ones your message answered.

**Safety net:** if Claude ends a reply asking you something without using the box, the questions are put there anyway. Numbered steps and shell commands in such a reply go into the box too, under "From Claude's reply". The mod reads the reply's shape itself, so this costs no tokens.

**Closing it:** the box closes when everything is answered and done, or with ✕. When one set is done, the box moves on to the next one still waiting. ✕ only hides the box; `/action-items` brings back what's still open. **Clear** (next to ✕) drops the set you're looking at for good, done or not, so the box never goes back to it. **Clear all N** shows when more than one set is still open, and empties the box.

**The look:** a Claude-orange frame and header, near-white text, charcoal buttons that turn orange on hover.

### Moving from Action Steps

Action Steps has been removed from the marketplace. If you still have it installed, Action Items is a new install, not an update. In a regular terminal:

```
claude plugin marketplace update teddymazrin-mods
claude plugin install action-items@teddymazrin-mods
claude plugin uninstall action-steps@teddymazrin-mods
```

Restart Claude Code (or run `/reload-plugins`). Steps saved by Action Steps don't carry over.

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
- **`/handoff`:** Claude writes a handoff note for this session: the goal, what's done, what's in progress, next steps, key files, and decisions and gotchas. It goes straight to the Handoff pane; no file is written
- **The Handoff pane:** opens on the right with the note and one button, **⧉ Copy prompt**. It copies the whole note with a line asking Claude to sum up where things stand and wait for you to confirm the next step. In a narrow window a box above the prompt shows **⧉ Copy prompt** instead, plus **▸ Open** for the full note
- **`/handoff open`:** shows this session's note again without writing a new one. Notes are never saved: copy it before `/clear`, because a new session starts with none

The usual flow is `/handoff`, then **⧉ Copy prompt**, then `/clear` (or **Clear** in Control Panel), then paste.

## Context Lens

Shows where your context window is going, so you can see what to trim before it fills. Run `/context-lens`, or press **Context Lens ▸ Open** in Control Panel, to open the pane:

```
◆  C O N T E X T   L E N S                                   Opus 5.5
17%  34.0k of 200.0k · compacts at 184.0k
██████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
■ Messages                    30.0k    15%
■ System tools                 9.2k     5%
■ System prompt                4.0k     2%
■ Memory files                 3.0k     2%
...
```

- **The bar and rows:** the same categories `/context` shows (system prompt, system tools, MCP tools, custom agents, memory files, skills and messages), largest first, each with its tokens and share of the window, plus free space and the autocompact buffer
- **Biggest items:** the top 5 memory files (such as each `CLAUDE.md`), MCP servers, skills and agents by tokens, so you can see which one to cut
- **Updates by itself:** while the pane is open it refreshes after each turn with a quick local estimate, which costs nothing
- **Count exactly** (key `c`): counts every category with the token-count API, as `/context` does. The footer says whether the numbers are **Estimated** or **Counted exactly**
- **Show all:** each list shows its 5 biggest items; **▸ Show all** opens the full list. The Skills heading also says how many skills were left out of the listing because it ran over its token budget

### Trimming your context with it

1. **Open it and press `c`** at the start of a session, before you've done anything. That's your fixed cost, sent with every request.
2. **Find the biggest row** and trim by what it is:
   - **Messages:** the conversation itself. `/clear` before an unrelated task; mid-task, `/compact` or `/handoff` then `/clear`. Ask for targeted reads (a search, a line range) rather than whole files
   - **MCP tools:** check **MCP servers**. Turn off any you don't use in this project with `/mcp`
   - **Skills:** **▸ Show all**, and look at the note column for the plugin each came from. Uninstall or disable plugins you don't use with `/plugin`
   - **Memory files:** a long `CLAUDE.md` is paid for on every request. Keep the rules, move reference material into files Claude reads only when needed
   - **Custom agents:** remove agent definitions you no longer use
   - **System prompt and system tools:** Claude Code's own; you can't trim these
3. **Check again in a new session** with `c` to see what you saved.

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
claude plugin update action-items@teddymazrin-mods
claude plugin update guard-rails@teddymazrin-mods
claude plugin update context-handoff@teddymazrin-mods
claude plugin update context-lens@teddymazrin-mods
```

Then run `/reload-plugins` in a session that's already open, or restart Claude Code. A mod that's already on the latest version is left as it is. `claude plugin list` shows what's installed and at which version.
