# Bare View log

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
