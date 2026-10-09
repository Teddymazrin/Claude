# Action Items log

## 4.3.0 (2026-10-09)

**Asked for:** (screenshot) the box looks good but is messy: wrap the Why and the other extra info into an "info" button you click to expand and collapse, so the task itself stands out.

**Changed:**
- Each action shows only its number, the task, and the command with **Copy**. Its **Why:** and how-to lines sit behind a dim **▸ info** after the task; click it to open them (**▾ info**), and again to close. Each action opens on its own
- A question's context line works the same way; its options stay in view
- In a short box, closed info takes no rows, so the box folds far less often. When it does, the folded rows show title · command and Copy (the inline why is gone)
- The command stays visible on purpose: it is the task itself (asked in the box; the default was used while the answer was open)

**Found in testing:** on the Do tab, **▸ info** sat at the far right of the box, not after the task (the same thing that happened to Copy in 4.0.1). The task text stretched to fill the row; it now takes only its own width, so info follows it. The Decide tab was already right.

## 4.2.0 (2026-10-09)

**Asked for:** there was no way to get rid of an older ask you didn't care about. After you ticked off everything in the newest set, the box fell back to an old set, and ✕ only hid it until next time.

**Changed:** the header has **Clear** next to ✕: it removes the set on show for good (ticked or not), from this session and the saved copy, and the box moves on to the next set still waiting or closes. When more than one set is open, **Clear all N** empties the box in one click.

## 4.1.2 (2026-10-08)

**Found in testing:** folding an opened action didn't bring it back to one line; it kept its why and command lines (the box was on its middle "how-to only" step).

**Changed:** a box too short to show everything goes straight to one opened action with every other action on one row (title · why · command, Copy). Folding the opened one leaves every action on one row. The middle step is gone.

## 4.1.1 (2026-10-08)

**Found in testing:**
1. A ticked action folded into "✓ 1 done" with no way to untick it unless the terminal was tall enough to show it again
2. An opened action couldn't be folded back by clicking its title again

**Changed:**
- "✓ N done ▸ show" is a button: it lists the ticked actions again (struck through) so one can be unticked; "▾ hide" folds them
- In a short box the opened action's title reads "▾ Title" and folds it on click, leaving every action one row

## 4.1.0 (2026-10-08)

**Asked for:** row 4's why and its command (the long opening prompt) were cut off; the small box can't always show everything, but there should be a way to read it.

**Changed:** in a box too short to open every action, each folded action's title is a button (`▸ Title`). Clicking it opens that action in full (why, how-to, the whole command wrapped) and folds the one that was open. By default the next open action is the one opened, as before.

## 4.0.1 (2026-10-08)

**Found in testing:** folded actions had a working Copy, but their command text wasn't shown, so you couldn't see what you were copying.

**Changed:** a folded action shows its command on the same row, after the title and why, on the command strip and cut to fit, with Copy after it. Still one row each.

## 4.0.0 (2026-10-08)

**Asked for:** after trying 40+ themes, frame colors and button greys: keep `signal` with charcoal `#2c2c2e` buttons, and delete everything else that was made for picking.

**Changed:**
- The box has one look: Claude-orange `#d97757` rounded frame and header, near-white `#ececea` questions, actions and commands, charcoal `#2c2c2e` buttons and tabs that turn orange `#c4623f` on hover, commands on a `#1c1c1e` strip, finished items in grey `#8e8e93`
- Removed every other theme, the shape options (borderless, filled card, header bar, rule, underlined tabs), and the `/action-items theme`, `frame` and `button` commands. `/action-items` again only brings back what's open
- Theme choices saved by 3.6–3.11 are ignored

## 3.11.0 (2026-10-08)

**Asked for:** a list of greys to try on signal's buttons.

**Changed:** `/action-items button <#rrggbb>` fills the buttons alone, over any theme; `button reset` hands them back. Picking a theme clears it, like the frame color. Remembered across sessions.

## 3.10.2 (2026-10-08)

**Asked for:** on `signal`, a better grey for the buttons.

**Changed:** signal's greys are neutral instead of brown-tinted: buttons `#48484a` (a step lighter, so they stand out), tab chip `#2c2c2e`, command strip `#1c1c1e`, done text `#8e8e93`. Buttons still turn orange on hover.

## 3.10.1 (2026-10-08)

**Asked for:** more options (ended on `signal`).

**Changed:** eight more on the same single-accent recipe. Around signal: `signalcream` (orange buttons, cream text), `halo` (orange frame, white header), `kiln` (deeper burnt orange). Other accents: `jade` (green), `crimson` (coral red), `skyline` (light blue), `gold`, `steel` (all cool grey).

## 3.10.0 (2026-10-08)

**Asked for:** the classic-in-clay themes looked weird; wants a super modern, sleek theme that looks like it came from a company.

**Changed:** six themes on one product-UI recipe: one accent color, neutral greys for everything else, near-white text for questions, actions and commands, solid buttons.
- `studio`: graphite frame, Claude-orange header and buttons
- `signal`: Claude-orange frame, graphite buttons that turn orange on hover
- `iris`: muted indigo (Linear-style)
- `onyx`: pure monochrome (Vercel-style)
- `cobalt`: GitHub-dark blue, green for done
- `nova`: Stripe-style blurple

## 3.9.5 (2026-10-08)

**Asked for:** classic's look, but in clay orange.

**Changed:** classic's recipe (darker frame, brighter header of the same hue, a separate color per tab, cool dark chips) redone in clay: `clayclassic` (violet Decide, amber Do, like classic) and `claycontrast` (violet Decide, teal Do, so Do stands apart from the orange).

## 3.9.4 (2026-10-08)

**Asked for:** cleaner buttons; they looked faded and didn't stand out.

**Changed:** in `clay`, `claude` and `claudewarm`, the option and Copy buttons are solid orange `#c4623f` (lighter `#e08a6a` on hover) instead of a dark grey chip. Themes can set their own button colors (`btn`, `btnHover`).

## 3.9.3 (2026-10-08)

**Asked for:** grey commands read "ehh"; try white.

**Changed:** in `clay` and `claude`, command text is Claude's off-white cream `#f0eee6` on the dark strip: easiest to read, like a code block. Pure white was skipped as too harsh next to the warm colors.

## 3.9.2 (2026-10-08)

**Asked for:** commands in a greyish color that doesn't clash with the Copy button (yellow was tried and reverted).

**Changed:** in `clay` and `claude`, command text is warm grey `#a8a29e` on a darker strip `#1c1a18`, and the Copy button sits on a lighter chip `#3d3532`, so the command reads as text and Copy as a button. Themes can now set command text apart from the Do tab color (`cmd`).

## 3.9.1 (2026-10-08)

**Asked for:** a Claude-orange theme.

**Changed:** `claude` (Claude's #d97757 frame and header, cream question text, light peach commands) and `claudewarm` (the same with the questions in orange too).

## 3.9.0 (2026-10-08)

**Asked for:** the frame color is hard to judge while the text stays orange; give whole themes to test instead.

**Changed:**
- Seven complete color families on the sleek Bare View shape (rounded frame, nothing behind it), each matching from frame to text: `indigo`, `ocean`, `zinc` (neutral grey, blue accent), `forest`, `grape`, `lagoon` (teal), `sunset`
- Picking a theme clears a frame color picked with `/action-items frame`, so the theme shows as designed

## 3.8.0 (2026-10-08)

**Asked for:** after trying all the themes: likes Bare View's sleek box (rounded frame, nothing filled in behind it); wants to settle the outer frame color first, text and button colors after.

**Changed:** `/action-items frame <name>` colors the outer frame alone, over any theme: clay, coral, rose (Bare View's pink), amber, sage, teal, ocean, violet, slate, graphite, silver, or any `#rrggbb`. `frame` alone lists them; `frame reset` hands the color back to the theme. Remembered across sessions.

## 3.7.3 (2026-10-08)

**Found in testing:** the folded rows' Copy buttons lined up at the far right edge of a wide box, away from the row they belong to.

**Changed:** Copy sits right after the row's text, as it does beside a shown command.

## 3.7.2 (2026-10-08)

**Found in testing:** with 17 theme rows to try, the box went compact and only row 1 had a Copy button.

**Changed:** a folded action whose command is hidden keeps a Copy button at the end of its row; the toast names the command copied. No extra rows.

## 3.7.1 (2026-10-08)

**Asked for:** after trying the colors and shapes, make `clay` the default.

**Changed:** the box draws in `clay` unless another theme was picked with `/action-items theme <name>`. `classic` is still there.

## 3.7.0 (2026-10-08)

**Asked for:** cleaner color options for the box.

**Changed:**
- Five palettes, by role (frame, header/Why, Decide, Do, settled, command and chip backgrounds): `classic` (the original teal/violet/amber), `mono`, `nord`, `soft`, `clay`
- Six warm variations after clay came out favorite: `claymono` (clay frame, neutral text), `claysea` (clay with teal Do), `copper`, `ember`, `rust`, `dusk`
- Themes can change the box's shape too, not just its colors: border style or none, a filled card background, the header as a filled bar, a rule over a borderless box, underlined tabs. New: `claybar`, `claycard`, `clayline`, `claydouble`, `claybold`, `nightcard`
- `/action-items theme` lists them; `/action-items theme <name>` switches live and is remembered across sessions

## 3.5.4 (2026-10-08)

**Found in testing:** after 3.5.3 the box moved on to the older test set (questions answered, 3 unticked demo actions) instead of the waiting Bare View question, and opened on its finished Decide tab.

**Changed:**
- The next set shown is the newest with a question waiting; only then the newest with actions left
- A Decide tab picked earlier gives way to Do once nothing is left to decide
- `/action-items` uses the same order

## 3.5.3 (2026-10-08)

**Found in testing:** after the test set was finished, the box disappeared even though the Bare View question was still waiting; the box only ever showed the last set sent.

**Changed:** once the shown set is all done, the box moves on to the newest set still waiting. ✕ still hides the box altogether.

## 3.5.2 (2026-10-08)

**Found in testing:** an answer given in the box was passed to Claude again with every later message ("Answers the user gave...").

**Changed:** each clicked answer goes to Claude once, then is marked delivered; typed answers are already in the message, so they're never repeated.

## 3.5.1 (2026-10-08)

**Asked for:** (wrap-up answers) leave the Bare View overlap; only clear questions when a reply answers them; fix the empty "Other…" answer. Next mod: Bare View.

**Changed:**
- A typed reply no longer clears every waiting question. Claude is told which are still open (numbered as in the box) and clears the ones the reply answered by calling the tool with `title` + `answered: [numbers]`
- "Other…" answers are read from the sent reply: a written answer counts; a blank one puts the question back to waiting instead of sending an empty answer
- Answers already in the sent reply aren't repeated to Claude as extra context
- With an "Other…" in progress, the set stays open until the reply is sent, instead of being marked done as soon as the prompt box was filled

**Left as is:** this box can push Bare View's checklist rows behind "↓ N more" while Bare View is working.

## 3.4.2 (2026-10-08)

**Asked for:** `[cmd]` on folded rows was confusing too.

**Changed:** removed the command mark altogether. A folded action shows its title and why; its command appears when it becomes the next action.

## 3.4.1 (2026-10-08)

**Asked for:** "what is that gold icon on 2 and 4?" The ⌘ drew as an unreadable glyph in the Windows terminal font, and meant nothing on sight anyway.

**Changed:** the mark is now a plain amber `[cmd]`.

## 3.4.0 (2026-10-08)

**Asked for:** 3.3 looked better; make both suggested tweaks.

**Changed:**
- Copy sits right after the command instead of at the far edge of a wide box
- A folded action that has a command shows an amber ⌘ after its title, so you know one is coming

## 3.3.0 (2026-10-08)

**Asked for:** screenshot of the demo (5 actions, short box): actions 2-5 were bare titles and read vague; hovering Copy highlighted the action's title row instead.

**Changed:**
- An action folded to one row keeps its why on the same line, dim after a "·", cut off at the box edge
- Removed the hover highlight on the action's title row (it lit up while hovering Copy). Ticking still bolds the number on hover

**Seen, not changed:** the box fills the whole band above the prompt, so Bare View's checklist under it gets pushed behind "↓ N more".

## 3.2.0 (2026-10-08)

**Asked for:** in the 3.1 test the Do tab showed the Why only on action 1; actions 2 and 3 were bare titles, and 3 said "copy the command below" with no command shown.

**Cause:** the compact layout from 2.2 hid everything but the title on every action except the next one, so the new Why lines and the commands were the first things to go.

**Changed:**
- The Do tab shrinks in stages and stops at the first that fits: (1) drop blank lines and fold ticked actions, (2) keep the how-to line on the next action only, (3) last resort: keep the why and command on the next action only
- So Why lines and commands now stay on every action unless the box is very short

## 3.1.0 (2026-10-08)

**Asked for:** a Do item like "Look over the Action Steps code in VS Code / register.tsx is the main file" doesn't say what you're looking at or why.

**Changed:**
- Every action now needs a `why`: what it gets done or what you're checking for. It shows as a "Why:" line right under the action, above the how-to detail and the command
- An action sent without a `why` is refused, and Claude is told to leave it out if it has no clear reason
- Instructions forbid filler actions ("look over the code", "test the button") with nothing specific to find
- Items in the older `steps` form still load without a why

## 3.0.0 (2026-10-08)

**Asked for:** rename to "Action Items" now that it covers decisions too (answered in the 2.3 test, along with: keep the auto-catch, don't commit yet).

**Changed:**
- Plugin `action-steps` → `action-items`: folder, manifest, marketplace entry, README
- Tool `action_steps` → `action_items`, command `/action-steps` → `/action-items`, box text "Action Items"
- Breaking: the install name and tool name changed, and items saved under the old name don't carry over

**Found in testing:** answering "Other…" and sending the reply with nothing typed sends the question back with an empty answer. Left as is for now.

## 2.3.0 (2026-10-08)

**Asked for:** the full test (4 decisions, 5 actions) only looked clean in a very tall terminal. Chose tabs plus one question at a time.

**Changed:**
- Tabs under the header: `? DECIDE n` and `▶ DO n` (a ✓ once a tab is cleared). Only one section shows at a time
- The box opens on Decide while any question waits, and moves to Do by itself once they're all answered; clicking a tab switches by hand
- Decide is a stepper: the first waiting question opens with its detail and options, the rest are one line each, answered ones fold into "✓ N answered"
- Do keeps the 2.2 fit-to-height, measured on the actions alone
- The counts moved from the header into the tabs

## 2.2.0 (2026-10-08)

**Asked for:** 2.1 looked much better; what happens with lots of action items? Chose "fit to height" over overflowing to a side pane or plain scrolling.

**Changed:**
- The box measures itself against the room above the prompt. When it fits, it draws in full as in 2.1
- When it doesn't: no blank lines between entries, ticked actions fold into one "✓ N done" line, and only the next open action keeps its detail and command; the rest are one line each
- Ticking the next action hands its detail and command to the one after

## 2.1.0 (2026-10-08)

**Asked for:** the box looked clean, but the Do section was cramped and didn't explain well what to do.

**Changed:**
- Actions and decisions take an optional `detail` line, shown dim under the text: for actions, how to do it and what you should see when it worked; for decisions, what the options mean
- A blank line between entries; action text is bold until ticked
- Instructions ask for specific, self-contained actions ("Run the setup script in PowerShell", not "Check it works")

## 2.0.0 (2026-10-08)

**Asked for:** steps were used inconsistently; the side pane wasn't liked; it should cover anything Claude needs from you, questions as well as actions, and clearly show which is which.

**Changed:**
- Dropped the side pane. Everything shows in one box above the prompt, headed "⚑ CLAUDE NEEDS YOU"
- The tool takes `decisions` (question + optional options) and `actions` (text + optional command); the old `steps` is still read as actions
- Decisions are clickable: once all are answered, the answers go back to Claude as your reply. "Other…" / "Answer…" puts the question in the prompt box to type your own
- Safety net: a reply that ends asking a question, without the tool or AskUserQuestion that turn, gets its questions put in the box
- Typing a reply yourself settles the open decisions; any already-clicked answers go along as context
- Stronger instructions and reminder: use the box whenever Claude needs anything from you
- `/action-steps` now re-shows the newest open set instead of opening a pane
- Sets saved by 1.x are dropped on load (old shape)

**Not yet seen live:** the box's look in a real terminal, and the auto-catch on real replies.
