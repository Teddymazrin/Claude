# Claude Code mods

Seven mods for Claude Code. They all work in the terminal and in the desktop app's Code tab.

| Mod | Latest | Works in | What it does |
| --- | --- | --- | --- |
| [Bare View](#bare-view) | 1.16.0 | Both | A live task checklist above the prompt, with what Claude is doing right now, a tally of every tool call and a peek at each step's calls; folds to one line when finished and hides the tool-call noise |
| [Control Panel](#control-panel) | 1.14.0 | Both | A footer button that opens a panel to pick the model and effort, switch Bare View and Guard Rails on or off, and run quick actions |
| [Session Manager](#session-manager) | 1.2.1 | Both | Plan, model, context, cache and usage (a row in the terminal; the cache time in the app's footer); a box when the cache goes cold; writes a handoff note by itself before the cache runs out while you're away; handoff reminders at 50/65/80% and a note to continue from in a fresh chat |
| [Action Items](#action-items) | 8.1.0 | Both | Everything Claude needs from you, decisions apart from actions, in one list above the prompt; unfinished asks carry over |
| [Guard Rails](#guard-rails) | 1.0.0 | Both | Asks before risky commands and edits, and logs what it stopped |
| [Tenant Lens](#tenant-lens) | 1.1.0 | Both | An **Azure Context** button beside Control Panel that reveals the Azure tenant and subscription az CLI and Az PowerShell are pointed at; red on production |
| [Context Lens](#context-lens) | 1.2.0 | Both | Shows what is filling your context window, by category: system prompt, tools, memory files, MCP servers, skills and messages |

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
/plugin install session-manager@teddymazrin-mods
/plugin install action-items@teddymazrin-mods
/plugin install guard-rails@teddymazrin-mods
/plugin install context-lens@teddymazrin-mods
/plugin install tenant-lens@teddymazrin-mods
```

Run `/reload-plugins` to load them, or start a new session.

## Bare View

A live task checklist above the prompt: the goal, a progress bar, each step and a timer. Tool calls and in-progress text are hidden, so only the checklist and the final answers show; every earlier answer stays in the transcript when you scroll back. Every final answer has the same short shape: a status line (✅ worked, ❌ failed, ⚠️ partly worked) with the outcome in one bold sentence, then, only when they apply, `Cause:` (what was wrong and is fixed), `Issue:` (what is still wrong), `Changes made:` (one plain bullet per change) and `💡 Recommendation:` (what to do next), with any decisions or actions (including how-to steps and commands) in the Action Items box. It stays under about 60 words, not counting the Changes made list, unless you asked for an explanation. A plain question gets a direct answer with no icon or labels. The shape is repeated in the result of the call that finishes the checklist, right before Claude writes the answer, so long turns stick to it too. Also, the checklist moves one step at a time: Claude ticks off each step as it finishes it with a short `{"advance": true}` call, and resends the whole list only when the plan changes or a step fails.

- **Activity:** while Claude is working, a row under the progress bar says what it's doing right now, with a timer: `◐ Thinking 6s`, `Writing`, `Waiting for the model`, `Starting Edit`, or `Running Bash` (the tool only, not the command), plus `· 2 agents working` when subagents are busy. It shows on every turn, including slash commands, turns Claude starts by itself (goal `Continuing`), and turns with no task list. While a permission dialog is open it reads `⏸ Waiting for you to approve Bash` in orange (it stays on that until the approved tool finishes)
- **No empty bar:** the goal and progress bar show only for a turn with a checklist. A turn without one (a quick question, a slash command) shows just the activity row, and the band goes away when that turn ends, instead of sitting at `No plan yet · 0%`
- **Short windows:** as the window gets shorter, both boxes above the prompt stay in view. While Claude works, the checklist fits the rows left after Action Items' one-line box: steps that don't fit fold into `✓ … N done` above and `○ N more` below the working step
- **Folds when finished:** once every step is done, the band shrinks to one line, `✓ All 4 done · 2m 13s · 14 tool calls · 1 error ▸`. Click it to see the full checklist, and click `▾ All 4 done` to fold it again
- **Errors vs failures:** a tool call that errors (a missing file, a search with no match, a check Claude re-runs) is only counted, dim: `· 1 error`. A step only shows a pink `✗` and reads **Failed** when Claude marks it failed because its result really didn't happen, such as a rejected push or tests that still fail; the folded line then reads `✗ 3 done · 1 step failed · …`, with each failed step and why under it (`✗ Push to main: GitHub rejected the push`), and opened out the reason sits under the step. Whenever a call errored, Claude's final answer says in one line whether it affected the result
- **Tally:** a line counts the tool calls behind each prompt, split into built-in and MCP: `⚙ 4 tool calls · ▸ Built-in: 3 · ▸ MCP: 1`. Click a group to list the tools it ran under the line (`› Bash 2`, `› microsoft-learn › microsoft_docs_search 1`), and click again to fold it back up
- **Peek at a step:** a step that has made tool calls shows a count at the end of its row (`▸3`). Click the step to list its calls under it. Each shows the tool (`server › tool` for MCP), what it did (the command, file or search), how long it took, and the first line it returned underneath. A call that errored is marked with an orange `!` and the line that says what went wrong underneath (`fatal: Needed a single revision (exit 128)`), not just the exit code. Click again to hide them. The newest 8 show, with a count of the earlier ones
- **The answer always shows:** if Claude forgets to tick off the last step, its final answer still shows once the turn ends; working text from earlier in the turn stays hidden
- **`/checklist`:** switches the full view back on, and off again

## Control Panel

Shows as **◆ Control Panel** in the footer. The status row it used to draw under the prompt is now part of [Session Manager](#session-manager).

Click **◆ Control Panel** (or run `/control-panel`) to open the panel:

- **Model:** pick Haiku, Sonnet, Opus, Opus 1M or Fable (keys `1`-`5`). It's the same as typing `/model <name>` yourself, so the model really changes everywhere. In the terminal it switches straight away. In the desktop app the pick goes in the prompt box; press Enter to switch, so the app's own model menu changes too (a mod can't send it for you there)
- **Effort:** pick Low, Medium, High, XHigh or Max (keys `l`, `m`, `h`, `x`, `z`). It's the same as typing `/effort <level>` yourself, so the effort really changes, and `/effort` and the panel always agree. In the terminal it switches straight away; in the desktop app the pick goes in the prompt box and Enter switches it
- **Settings:** switch **Bare View** and **Guard Rails** on or off. The switch is saved straight away, and one `/reload-plugins` runs 1.5 seconds after your last click, so flipping both quickly applies them at once. The other mods have no switch and always stay on
- **Actions:** one row each, at the bottom of the panel:
  - **Context Lens ▸ Open:** closes the panel and opens Context Lens in front. Shows only while Context Lens is installed and on
  - **Reload plugins ▸ Run:** runs `/reload-plugins`
  - **Clear chat ▸ Run:** runs `/clear` after asking you to confirm

## Session Manager

Everything about the session in one mod: what it costs, how full it is, and moving to a fresh chat before it gets slow and expensive. It replaced Session Lens, Session Meter and Context Handoff ([moving from them](#moving-from-session-lens-session-meter-and-context-handoff)).

It shows itself where there's room, so the same install works in both places:

| | Terminal | Desktop app |
| --- | --- | --- |
| **Session numbers** | A full row under the prompt | Just the cache time, in the footer left of Control Panel |
| **Cold-cache box** | Above the prompt | Above the prompt |
| **Handoff boxes, `/handoff`, the Handoff pane** | Yes | Yes |

The desktop app doesn't draw a mod's row under the prompt, and its footer only fits about one button beside Control Panel, so the app shows just the cache. Bare View's checklist stays the lowest box above the prompt.

### The row (terminal)

```
Subscription | Opus 5.5 | effort Medium | ctx ░░░░░░░░ 1% | cache 42m | usage 6% · resets 4h12m | weekly 31% · resets Fri
```

- **Subscription / API:** how this session is billed. **Subscription** is your Claude plan (usage comes out of its limits); **API** is an API key, Bedrock or Vertex (billed per token). It only shows this; it doesn't change it. It's worked out on your computer: Subscription once Claude Code reports plan usage limits, otherwise API if `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, a Bedrock or Vertex setting, or a key in `~/.claude.json` is present. It only checks that a key exists; it never reads, stores or sends it
- **Model** (`Opus 5.5`): the model your requests go out with: the one you picked in Control Panel, or what Claude Code last used
- **Effort** (`effort Medium`): the reasoning effort your requests go out with, as `/effort` or Control Panel set it
- **Context** (`ctx ░░░░░░░░ 1%`): how full the conversation's context window is. Green under 50%, gold to 75%, orange above
- **Cache** (`cache 42m`, in red): time until the prompt cache goes cold. While it's warm, your next message re-reads the conversation cheaply; once it shows `cache cold`, the next message re-sends the whole conversation at full price, so a long session is a good time to `/compact` or `/clear` first. Claude Code doesn't tell mods the cache lifetime, so it assumes the usual one: an hour on a subscription, five minutes on an API key, counted from Claude's last reply. Each model has its own cache, so after you switch models it shows `cache cold · new model` until the new model's first reply
- **Usage** (`usage 6% · resets 4h12m`): how much of your plan's rolling 5-hour usage limit you've used, and the time until it resets
- **Weekly** (`weekly 31% · resets Fri`): the same for the 7-day limit. The reset shows as a weekday, or as a countdown once it's under a day away
- Both show on a subscription once Claude Code reports them. Each percentage turns gold at 50% and orange at 75%

The model and effort are the session's own: what `/model`, `/effort`, the app's model menu or [Control Panel](#control-panel) set.

### The footer (desktop app)

Just the cache, left of **◆ Control Panel**:

```
cache 59m   ◆ Control Panel   Opus 5.5
```

- It reads `cache 59m`, then `cache cold` once it has gone cold or after you switch models
- Click it to see the full row (plan, model, effort, context, 5-hour and weekly usage) as a pop-up message
- Stays current: redraws every 2 seconds, so a switch in the app's model menu shows within moments

### Cold-cache box

Whenever the prompt cache has gone cold, or you've switched models, whatever the chat's size, a box pops up above the prompt with an orange frame:

```
╭──────────────────────────────────────────────────────────────────────────────────────────╮
│ ⚠ Cache cold · Your next message re-reads the entire chat at full price and uses     ✕  │
│   more of your usage.                                                                    │
│ [✎ Write handoff] [Keep going]                                                           │
╰──────────────────────────────────────────────────────────────────────────────────────────╯
```

- **After a model switch**, it reads *Sonnet 5.5 hasn't read this chat yet, so your next message sends all of it again at full price and uses more of your usage. Opus 5.5 still has it saved.* and the button is **↩ Switch back to Opus 5.5** (click, then Enter). It shows on every switch, as long as the old model's cache is still warm
- **✎ Write handoff** has Claude write the handoff note ([Handoff](#handoff)); then **↻ Clear this chat & continue with note** starts a small fresh chat. That's the moment a handoff saves the most, and the bigger the chat the more the re-read costs
- **Keep going** or **✕** closes it. It comes back the next time the cache goes cold, after your next reply or another model switch
- After a model switch the title reads **Cache cold · new model**
- The row and the footer stay short: they just say `cache cold` (or `cache cold · new model`)

### Note before the cache goes cold

Once the cache has gone cold, writing a handoff note re-reads the whole chat at full price, the very cost it's meant to avoid. So when you step away, Session Manager writes the note for you while the chat is still cheap to read:

- **When:** at 85% of the cache's life (about 51 minutes after Claude's last reply on a subscription), once per break. That is before Claude Code's own idle compaction at 90% (54 minutes), so the note is written from the whole chat, not a summary
- **Only if it's worth it:** the chat is at least 20% full, no reply is running, and you haven't switched models. Never on an API key, where the cache lasts only 5 minutes
- **How:** one background request that reads the saved chat and adds nothing to it. Reading it also keeps the cache warm, so you get about another hour
- **Where it shows:** the note opens in the Handoff pane on the right (on a narrow terminal, **▸ Open** in the box opens it). If you're back before the cache runs out, that's all: keep chatting at the cached price. Once it has run out, an orange box appears above the prompt instead of the cold-cache box:

```
╭──────────────────────────────────────────────────────────────────────────────────────────╮
│ ◈ Cache ran out while you were away · here is your handoff note                       ✕  │
│ Written at 12:58 PM, before the cache expired. Continue in a new chat from it to skip    │
│ re-reading this one at full price.                                                       │
│ [⧉ Copy & continue in a new chat] [▸ Open] [Keep going]                                  │
╰──────────────────────────────────────────────────────────────────────────────────────────╯
```

  It stays until you close it or send a message. The note lives only in this session: closing Claude Code loses it
- **`/handoff away`:** writes the note now and shows that box, to see it without waiting an hour

### Handoff

Keeps a long session from getting slow, costly and forgetful. As a chat grows, every message uses more of your usage and Claude starts missing details; Session Manager tells you when, in plain words, and moves you to a fresh chat without losing your place.

- **Reminders at 50%, 65% and 80% full:** a violet box above the prompt, more urgent each time. It stays until you click **✎ Write handoff** or **Not now** (or ✕):
  - **50%:** *This chat is 50% full · Long chats use up more of your usage and Claude gets less sharp. Start fresh with a summary?*
  - **65%:** *This chat is 65% full · Every message now costs more usage, and Claude may start missing details. Start fresh at your next break.*
  - **80%:** *This chat is 80% full · Almost full: soon Claude shrinks the chat and forgets details, and each message costs the most usage. Start fresh now.*

  Each shows once per chat, and again only after the chat shrinks below it (after a clear or a compact) and grows back. `/handoff ask 50`, `ask 65` or `ask 80` previews one
- **`/handoff`** (or **✎ Write handoff**): Claude writes a handoff note for this session: the goal, what's done, what's in progress, next steps, key files, and decisions and gotchas. It opens in the Handoff pane; no file is written
- **Two ways on**, in the pane (or in a box above the prompt when the window is narrow):
  - **↻ Clear this chat & continue with note:** asks once, then clears this chat and sends the note as the fresh chat's first message. Claude sums up where things stand and waits for you to confirm the next step
  - **⧉ Copy & continue in a new chat:** copies the note with that same request, to paste into a new chat; this chat stays as it is
- **`/handoff open`:** shows this session's note again without writing a new one. It's the note as it was written, so after more work run `/handoff` again for an up-to-date one. Notes are never saved: a new chat starts with none

The usual flow: when a box appears, click **✎ Write handoff**, then **↻ Clear this chat & continue with note**.

### Moving from Session Lens, Session Meter and Context Handoff

Those three have been removed from the marketplace. Session Manager is a new install, not an update. In a regular terminal:

```
claude plugin marketplace update teddymazrin-mods
claude plugin install session-manager@teddymazrin-mods
claude plugin uninstall session-lens@teddymazrin-mods
claude plugin uninstall session-meter@teddymazrin-mods
claude plugin uninstall context-handoff@teddymazrin-mods
```

Uninstall only the ones you have. Then run `/reload-plugins`. A handoff note from the old mod doesn't carry over; run `/handoff` for a new one.

## Action Items

Whenever Claude needs something from you, it goes in one box above the prompt instead of getting lost in the chat: questions you answer, apart from things you do yourself. It replaced Action Steps and its side pane.

The box has two tabs, so it stays small:

- **? Decide**: questions for you. The first waiting question opens with its options, and its line of context waits behind **▸ info**; the rest wait one line each, and answered ones fold into "✓ N answered". Click an option and your answer goes back to Claude as your reply; with several questions it waits until all are answered and sends them together. **Other…** (or **Answer…** for an open question) puts the question in the prompt box for you to type your own; sending it blank keeps the question open
- **▶ Do**: things you do yourself, laid out as an STE procedure. One short intro says once what the steps do and what you need first. Then the numbered steps, each with its exact command and a **Copy** button. A step gets a second line only when the result matters: "Make sure that…". No info buttons. Click the number to tick it off

The box opens on Decide while a question waits and moves to Do once they're answered; click a tab to switch.

**In a short window** the Do tab first drops its blank lines, then keeps the command on one action and folds the rest to one row each (title · command, with Copy). Click a folded action's title (**▸**) to open it, and the open one's title (**▾**) to fold it. Ticked actions fold into **✓ N done ▸ show**, which lists them again so you can untick one.

**Answering by typing:** a typed message doesn't wipe the box. Claude is told which questions are still open and clears only the ones your message answered.

**Updates on the fly:** when what Claude needs changes, it updates the box in the same turn. While the box holds open asks, Claude is reminded of them with each message.

**Steps in STE:** the intro and every step are written in Simplified Technical English, like the `ste` skill, without loading that skill. The mod checks them (no semicolons, contractions, should/may/might/could/would, check/verify/confirm/ensure, a step 20 words or fewer, an intro 3 sentences or fewer, and a check that starts with "Make sure that") and sends back any that break a rule. A risky step shows a **CAUTION:** (data, a service or access) or **WARNING:** (people) line before it.

**Only Claude fills it:** the box shows only what Claude put there itself. The mod doesn't guess from the reply, so nothing in the box is a false alarm. If Claude ends a turn with a question or a step for you and forgets the box, the mod sends it back once to put it there.

**Ticks itself:** an action whose command runs exactly as given is ticked for you: a slash command you run (`/reload-plugins`), a command you paste as your message, or one Claude runs for you that succeeds. A toast says so. Claude also sees the open actions with each message and ticks the ones the conversation shows are finished. Click a ticked number to untick it.

**One box per conversation:** each conversation keeps its own asks. A new conversation (or `/clear`) starts with an empty box, and resuming a conversation brings its box back.

**One list, nothing stacks:** the box holds one list. New asks from Claude go on top. Anything you haven't finished from before moves under a dim **── Earlier ──** line in the same list and stays until you tick it, or drop it with its **✕**. Finished ones drop off. There are no older sets to page through.

**Closing it:** the box closes once nothing in it is still open, or with ✕. ✕ only hides the box; `/action-items` brings back what's still open. **Mark as done** (next to ✕) ticks off everything in the box and closes it; questions it closes don't send an answer to Claude.

**While Claude is working:** the box's buttons only respond once Claude stops. To finish it mid-turn, type `/action-items done` or `/action-items hide`; these run straight away.

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

## Tenant Lens

Shows which Azure tenant and subscription your tools are pointed at, so a script that changes every subscription never runs against the wrong one. An **Azure Context** button in the bottom-right corner, left of **◆ Control Panel**:

```
                             Tenant:        contoso.onmicrosoft.com
                                            72f988bf-86f1-41af-91ab-2d7cd011db47
                             Subscription:  Contoso Dev
                                            00000000-1111-2222-3333-444444444444
                                              ▾ Azure Context  ◆ Control Panel
```

- **Click to reveal:** the tenant and the subscription open above the button in a black box, each name with its id on the line under it. Click again to hide them
- **The tenant's domain:** read from the Azure files when they hold it. They don't when you signed in with `az login --tenant`, so the first time you open the details for such a tenant, az looks the domain up (`az rest` on Azure Resource Manager's tenant list) and it's remembered from then on. That one call goes to Azure with your own sign-in and uses no Claude tokens. If az isn't signed in, the box says `domain unknown: run az login to show it`
- **Production in red:** when the subscription's name has `prod`, `production`, `prd` or `live` in it, the button turns from Azure blue to red, so you see it without opening it
- **When the two tools differ:** the button reads `Azure Context ≠`, and the reveal lists az CLI and Az PowerShell separately, with an orange line saying they point at different subscriptions
- **Where it looks:** az CLI's `~/.azure/azureProfile.json` (or `AZURE_CONFIG_DIR`) and Az PowerShell's `~/.Azure/AzureRmContext.json`. It reads these local files: no sign-in, no tokens, and nothing goes into Claude's context. The only network call is the one-time domain lookup above
- **Stays current:** it rereads after every Bash and PowerShell call (where `az login`, `az account set` and `Set-AzContext` usually run) and once a minute
- **`/tenant-lens`:** prints the full subscription, tenant and account, with ids, for both tools
- **Not signed in:** with neither file present the button doesn't show. These files say what each tool last selected, not that the sign-in is still valid
- **Az PowerShell** only saves its file while context autosave is on (the default; `Enable-AzContextAutosave` turns it back on)

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
claude plugin update session-manager@teddymazrin-mods
claude plugin update action-items@teddymazrin-mods
claude plugin update guard-rails@teddymazrin-mods
claude plugin update context-lens@teddymazrin-mods
claude plugin update tenant-lens@teddymazrin-mods
```

Then run `/reload-plugins` in a session that's already open, or restart Claude Code. A mod that's already on the latest version is left as it is. `claude plugin list` shows what's installed and at which version.
