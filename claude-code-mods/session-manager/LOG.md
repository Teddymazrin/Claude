# Session Manager log

## 1.1.3 (2026-10-18)

**Asked for:** the note written while you're away should open in the Handoff pane on the right, like a /handoff note, with the away box still showing.

**What changed:** the note opens in the Handoff pane as well as the away box. Written while you're away, the pane opens where the terminal is wide enough; `/handoff away` opens it at any width.

## 1.1.2 (2026-10-18)

**Asked for:** a way to see the away box without waiting an hour.

**What changed:** `/handoff away` writes the note from the cache now, the same way it is written while you're away, and shows the away box. `/handoff away cold` shows it as if the cache had run out.

## 1.1.1 (2026-10-18)

**Asked for:** when the note was written while you were away, a clear message on return: the cache ran out, here is the handoff note. The side pane opens on its own only in a wide terminal, so it couldn't be counted on.

**What changed:** a box above the prompt, which always shows, in the terminal and the app. Its title is **"Cache ran out while you were away · here is your handoff note"** (or **"You were away · a handoff note is ready"** while the cache is still warm). It says when the note was written and shows its first lines, with **↻ Continue from note**, **Copy prompt**, **▸ Open** (the whole note in the pane) and **Keep going**. It stays until you use it, close it, or send a message. While it shows, the plain cold-cache box doesn't.

## 1.1.0 (2026-10-18)

**Asked for:** when the cache goes cold from being away, **Write handoff** re-reads the whole chat at full price, the very cost it should avoid.

**What changed:** while you're away, about 5 minutes before the cache goes cold, Session Manager writes the handoff note itself from the cache, with a side request that adds nothing to the chat. It does this once per idle spell, only when the chat is at least 20% of context, no turn is running, and the model hasn't changed. It never does it on API billing (the 5-minute cache is too short to be away from). Reading the cache keeps it warm, so the countdown starts over from the write. When you come back and the cache has gone cold, the box says a note was saved and offers **↻ Continue from note** (clear and continue from it) instead of **Write handoff**. The note also shows in the Handoff pane, with Copy prompt.

## 1.0.2 (2026-10-13)

**Found in use:** after a model switch the cold-cache box offered **Write handoff**, but the new model has no cache, so writing the note there re-reads the whole chat at full price, which is the cost the box warns about.

**What changed:** when the cache is cold only because the model changed and the old model's cache is still warm, the box offers **↩ Switch back to <old model>** (put in the prompt box, Enter sends it) and says to write the handoff there. In plain words, with no mention of handoffs: "Sonnet 5.5 hasn't read this chat yet, so your next message sends all of it again at full price… Opus 5.5 still has it saved." The box comes back on every switch, also a second switch to the same model with no reply between (closing it used to hide it for good until the next reply). When the cache is cold because of the idle hour, or the old model's is cold too, it still offers **Write handoff**, which costs the same as any next message.

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
