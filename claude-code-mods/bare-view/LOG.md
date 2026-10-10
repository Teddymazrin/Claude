# Bare View log

## 1.13.1 (2026-10-10)

**Found in use:** scrolling back, only your prompts and the latest answer showed. Earlier answers were gone, and asked for a way to expand them.

**Found:** each answer was hidden or shown afresh every time it was drawn, by whether a checklist was open at that moment. The transcript draws messages again on a scroll or a resize, so an earlier answer redrawn while a new checklist was open got hidden, and stayed hidden.

**Changed:** a message is hidden or shown once, the first time it is drawn: hidden only if it was written while a turn ran with steps still open. Redrawing never changes that, so every final answer stays in the transcript. Nothing to expand: they simply show. `/checklist` still shows everything, working text included.

**Known limit:** answers already hidden in a session that ran an older version come back after a `/reload-plugins`.

## 1.13.0 (2026-10-10)

**Asked for:** final answers were still sometimes very long and unfocused, mostly after turns that did a lot of work. Every answer should be a short, focused summary, anything else worth knowing, the decisions to make, and the actions to take (how-to steps and commands go there too).

**Found:** the short-answer rule only lived in the system prompt. After a long turn with many tool calls it was far behind, and the answer drifted from it.

**Changed:**
- The final-answer rule is now a fixed shape: **Summary** (1-3 sentences, no recap of steps, files or commands), **Why** (1-2 sentences, only if not obvious: the cause of a problem, or the reason for the approach), **Worth knowing** (up to 3 bullets, only if any; includes whether an errored tool call mattered), then **decisions** and **actions** in the Action Items box. Without that tool they go under those two headings, commands in code blocks. Empty parts are left out; prose stays under about 80 words unless you asked for an explanation
- The call that finishes the checklist now returns that shape (`Checklist finished. Write the final answer now. …`), so it is the last thing Claude reads before answering, however long the turn was
- The mid-session reminder names the shape too
- A plain question with no task skips the checklist and answers directly: the answer first, a short why if it helps, up to 3 bullets, no labels, about 80 words
- Added after seeing examples: the **Why** part, asked for so the reason behind a result is there when it isn't obvious

## 1.12.0 (2026-10-10)

**Asked for:** the progress list was inconsistent. Sometimes it ticked off steps one by one; other times it sat on step 1 and then jumped straight to all done.

**Found:** the instructions told Claude to call the checklist again "only when the plan changes; do not send an update after every step". So Claude only ticked steps off when it ignored that rule. Each update also meant resending the whole list, which is why it was discouraged.

**Changed:**
- New short call, `{"advance": true}`: marks the active step done and starts the next one, without resending the list
- The instructions now ask Claude to advance after every step, the last one included, and never jump several steps at once at the end
- The whole list goes again only when the plan changes or a step failed. `goal` and `steps` are no longer required in the tool's schema, so the short call validates
- Advancing before there is a list returns an error asking for the goal and steps first

## 1.11.0 (2026-10-09)

**Asked for:** make Claude's final answer shorter, more concise and focused.

**Changed:**
- The final-answer instruction now asks for the result in 1-2 sentences, then only what you must act on or what changes how you read the result (a failure, a caveat, a surprise)
- It rules out recapping the steps, restating the request, closing offers and headings on short answers, and caps the answer at about 5 lines
- Longer answers are still allowed when you ask for an explanation, or when the content itself (code, a table, a list you asked for) is the point
- Adds about 40 tokens to the cached instructions and saves output tokens on most turns

## 1.10.0 (2026-10-09)

**Asked for:** cut the mods' token cost; picked: drop the per-message reminders only.

**Changed:**
- The one-line reminder added to every message you send is gone once the session's system prompt carries the mod's instructions. It still goes along in a session the mod joined partway through, until a system prompt has the instructions
- How to load the tool (ToolSearch) moved from the reminder into the instructions
- Saves about 25 tokens per message, and they no longer pile up in the history

## 1.9.1 (2026-10-09)

**Found in use:** Action Items' box showed below Bare View's after a plugin reload. Both mods draw their box and then whatever the other put in the band; whichever loaded outermost ended up on top.

**Changed:** Bare View now draws what other mods put in the band above its own box, so the Action Items box sits above it whatever order the mods load in.

## 1.9.0 (2026-10-09)

**Asked for:** after a push, the band said "1 failed" even though the push worked (my verification command had errored). How do you tell a genuine failure from a harmless one? Picked: split tool errors from real step failures.

**Changed:**
- Steps take a new status, `failed`, which Claude sets only when the result of the step really didn't happen and it is leaving it (a rejected push, tests still failing). Only those get the pink `✗`, read **Failed**, and fill the bar. The folded line reads `✗ 3 done · 1 step failed · …` and the finished label `1 step failed`
- A tool call that errored no longer changes the step's bullet. It is counted dim as `· 1 error` on the folded line, and in a step's peek it has an orange `!` with its error line
- New instructions: whenever a tool call errored, Claude's final answer says in one line whether it affected the result
- This replaces 1.8.2's rule, where any errored call put the pink `✗` on its step

**Found in testing:** a quote in the new tool description broke the module; caught by the type check and tests before anything shipped.

**Found in the live demo (screenshot):** the failed step was marked, but nothing said what failed: you had to open the step, and even then its call only read `Exit code 128`. Fixed before shipping:
- A failed step takes a `reason` from Claude ("Branch not found"), shown in pink under the step (`↳ Branch not found`) and, while the band is folded, on its own line under the summary (`✗ Find a branch: Branch not found`, up to 3)
- A peeked call's error line shows what went wrong instead of the bare exit code: `fatal: Needed a single revision (exit 128)`

## 1.8.2 (2026-10-09)

**Asked for:** idea 5 from the visual polish list: mark failed steps.

**Changed:** a step with any failed tool call shows a pink `✗` in place of its bullet (`✓`, `●` or `○`), so a failure shows without opening the step's peek. Its status word (Done, Working) is unchanged.

## 1.8.1 (2026-10-09)

**Asked for:** the activity row showed a hint of the line being run (`Running Bash  git status`); don't show that line.

**Changed:** the activity row names the tool only: `Running Bash`, `Waiting for you to approve Bash`. The command, file or query is no longer kept for it. A step's peek still lists each call's command when you click the step.

## 1.8.0 (2026-10-09)

**Asked for:** two additions picked from a list of ideas: (1) show when Claude is waiting on a permission prompt, and (3) fold the band down once the checklist is finished.

**Changed:**
- The activity row reads `⏸ Waiting for you to approve Bash  npm publish` in orange while a permission dialog is open, instead of `Running Bash` with the timer counting as if it were working. It picks this up from the `PermissionRequest` hook event, which fires just before the dialog shows (it only watches; the dialog still decides)
- A finished checklist folds to one line: `✓ All 4 done · 2m 13s · 14 tool calls · 1 failed ▸` and the goal. Click it to open the full band; click `▾ All 4 done` to fold it again. A new prompt starts folded again. While Claude writes its answer, the activity row still shows under the folded line

**Known limit:** Claude Code doesn't tell mods when the dialog is answered, so after you approve, the row says "Waiting for you" until that tool finishes or another starts. A long command you approve will keep saying it while it runs. Not yet checked in the real UI: whether the band stays visible while the dialog is open.

**Found in testing:** Guard Rails blocked writing a test that used a delete command as sample text, so the test uses `npm publish` instead.

## 1.7.0 (2026-10-09)

**Asked for:** Bare View sometimes didn't show that anything was happening unless there was a task list. Whenever the model is running, there should always be something on screen.

**Found:** the band only started fresh on a typed prompt. Slash-command turns and turns the session started by itself (a background task finishing, a wake-up) kept the last finished checklist or showed nothing. Even with a checklist, the only sign of life was the `▶ tool` marker on the tally line, which was blank while the model was thinking or writing.

**Changed:**
- New activity row under the progress bar, shown whenever a turn is running, with its own timer: `Waiting for the model`, `Thinking`, `Writing`, `Starting Edit` (the model is writing a tool call), or `Running Bash  git status`. When subagents are working it adds `· 2 agents working`. It reads the model's live reply (`turn.step`) and only writes when the phase changes, not on every piece
- The band shows while Claude is working even with no checklist at all (goal `Working`)
- A slash command's turn starts a fresh band with the command as its goal; a turn with no typed prompt starts one with the goal `Continuing`
- The `▶ tool` marker on the tally line is gone; the activity row replaces it
