# Claude Code mods

Two mods for the Claude Code terminal. Install with one line at the Claude Code prompt, answer `y` to add the marketplace, then press Enter for the user scope.

## Bare View

A live task checklist above the prompt: the goal, a progress bar, each step and a timer. Tool calls and in-progress text are hidden so only the checklist and the final answer show. `/checklist` toggles the full view back on.

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

## Notes

- Mods are a hooks-module plugin feature of the Claude Code terminal.
- Control Panel decides Subscription vs API from your environment (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, Bedrock/Vertex flags) and whether `~/.claude.json` holds an API key. It only checks for the key; nothing is sent anywhere.
