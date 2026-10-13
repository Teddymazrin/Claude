# Context Handoff log

## 1.4.0 (2026-10-12)

**Asked for:** a prompt at 50% context offering a handoff before compaction.

**What changed:** at 50%, 65% and 80% context a box above the prompt offers a handoff, with **Write handoff** (the same as `/handoff`) and **Not now**. Each says why in plain words, including the usage cost, more urgently each time:
- 50%: "This chat is 50% full · Long chats use up more of your usage and Claude gets less sharp. Start fresh with a summary?"
- 65%: "This chat is 65% full · Every message now costs more usage, and Claude may start missing details. Start fresh at your next break."
- 80%: "This chat is 80% full · Almost full: soon Claude shrinks the chat and forgets details, and each message costs the most usage. Start fresh now."

Each level shows once, and comes back only after the context drops below it (after /clear or a compact) and climbs again. `/handoff ask [50|65|80]` previews it. These replace the 70%/85% toasts, which disappeared after 10 seconds and had no button; 65/80 leave more room to write the note.

**Also in 1.4.0:** the note has two ways on, in the pane and in the box above the prompt. **⧉ Copy & continue in a new chat** copies the prompt for a new session and leaves this chat as it is (a mod can't open a new desktop-app chat itself). **↻ Clear this chat & continue with note** asks once, then runs /clear and sends the note as the fresh chat's first message.
