# Session Manager log

## 1.0.1 (2026-10-13)

**Asked for:** in the desktop app, the numbers crowded Control Panel's button out of the footer, and Bare View's checklist must stay the lowest box above the prompt.

**What changed:** the app's footer shows just the cache (`cache 59m` / `cache cold`) as a button left of Control Panel; pressing it shows the full row. A line above the prompt was tried and dropped, since it sat under Bare View's checklist. The model is now the session's own (what `/model` and the app's menu set); Control Panel's old model override is ignored. The screen redraws every 2 seconds, so a switch in the app's model menu shows within moments.

## 1.0.0 (2026-10-13)

**Asked for:** one mod instead of three. Session Lens and Session Meter were the same meter split by where it runs, and the cold-cache box already relied on Context Handoff's `/handoff`.

**What changed:** Session Lens 1.2.0, Session Meter 0.5.0 and Context Handoff 1.4.0 are now Session Manager. It picks its display by where it runs: the full status row under the prompt in the terminal, the short `ctx · cache · 5h` line in the desktop app's footer. The cold-cache box shows in both and its **Write handoff** writes the note directly, with no second mod needed. The handoff boxes, `/handoff`, the pane and Clear & continue work as before; the pane is now titled **Handoff**, and Claude's note tool is `mcp__session-manager__handoff_note`.

**Built:** everything that uses the engine sits in `register.tsx` (the engine follows `$` only within one file); the wording and math live in `session.ts`, `status.ts`, `cold.ts` and `handoff.ts`.

The entries below are Context Handoff's history.

## Context Handoff 1.4.0 (2026-10-12)

**Asked for:** a prompt at 50% context offering a handoff before compaction.

**What changed:** at 50%, 65% and 80% context a box above the prompt offers a handoff, with **Write handoff** (the same as `/handoff`) and **Not now**. Each says why in plain words, including the usage cost, more urgently each time:
- 50%: "This chat is 50% full · Long chats use up more of your usage and Claude gets less sharp. Start fresh with a summary?"
- 65%: "This chat is 65% full · Every message now costs more usage, and Claude may start missing details. Start fresh at your next break."
- 80%: "This chat is 80% full · Almost full: soon Claude shrinks the chat and forgets details, and each message costs the most usage. Start fresh now."

Each level shows once, and comes back only after the context drops below it (after /clear or a compact) and climbs again. `/handoff ask [50|65|80]` previews it. These replace the 70%/85% toasts, which disappeared after 10 seconds and had no button; 65/80 leave more room to write the note.

**Also in 1.4.0:** the note has two ways on, in the pane and in the box above the prompt. **⧉ Copy & continue in a new chat** copies the prompt for a new session and leaves this chat as it is (a mod can't open a new desktop-app chat itself). **↻ Clear this chat & continue with note** asks once, then runs /clear and sends the note as the fresh chat's first message.
