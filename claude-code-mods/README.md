# Claude Code mods

Three mods for the Claude Code terminal. Install with one line at the Claude Code prompt, answer `y` to add the marketplace, then press Enter for the user scope.

## Bare View

A live task checklist above the prompt: the goal, a progress bar, each step and a timer. Tool calls and in-progress text are hidden so only the checklist and the final answer show. `/checklist` toggles the full view back on. A tally line counts the tool calls behind each prompt, naming each built-in tool and each MCP server, with the tool running right now on the right: `⚙ 4 tool calls · Built-in 3: Bash 2, Read 1 · MCP 1: microsoft-learn 1   ▶ Bash`.

```
/plugin install bare-view --marketplace Teddymazrin/Claude
```

## Control Panel

Shows as **◆ Control Panel** in the footer.

- A status row under the prompt: `Subscription | Opus 5.5 | effort Medium | ctx ░░░░░░░░ 1% | 6% 4h 12m` (plan, model, effort, context used, 5-hour usage and time to reset)
- A **◆ Control Panel** button (or `/control-panel`) that opens a panel to pick the model and effort and switch your other mods on and off

```
/plugin install control-panel --marketplace Teddymazrin/Claude
```

## Action Steps

When a task leaves you something to do yourself (run the script, set a parameter, check the portal), Claude sends the steps to a side pane that opens by itself, so they don't get lost in the chat:

```
▸ Check my Azure roles                          0/3
1: Install the Az module
     Install-Module Az -Scope CurrentUser   [Copy]
2: Run the script with your tenant ID
     .\Get-MyAzureRoles.ps1 -TenantId "<id>" [Copy]
3: Sign in when the browser opens
```

- Click a number to tick that step off; **Copy** puts its command on the clipboard
- Earlier tasks stay listed under **Earlier**, kept across sessions (the last 8)
- The pane docks on the right in fullscreen from 110 columns; in a narrower window the steps show in a box above the prompt instead. `/action-steps` opens the pane by hand
- Close it with ✕; it opens again the next time there are new steps

```
/plugin install action-steps --marketplace Teddymazrin/Claude
```

## Notes

- Mods are a hooks-module plugin feature of the Claude Code terminal.
- Control Panel decides Subscription vs API from your environment (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, Bedrock/Vertex flags) and whether `~/.claude.json` holds an API key. It only checks for the key; nothing is sent anywhere.
