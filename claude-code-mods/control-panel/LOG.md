# Control Panel log

## 1.14.0 (2026-10-18)

**Found in use:** an effort pick only changed what the pane and status row showed. It was a hidden override on every request and saved across sessions, so `/effort` typed later looked like it switched but every request still went out with the old pick.

**What changed:** an effort pick now runs `/effort <level>` itself, the way a model pick runs `/model` (terminal: straight away; desktop app: through the prompt box). Nothing overrides requests any more, so `/effort` and the panel always agree. A pick saved by an earlier version is cleared.

## 1.13.1 (2026-10-13)

**Found in use:** in the terminal, a model pick used to switch straight away; since 1.13.0 it only filled the prompt box, like the desktop app.

**What changed:** in the terminal a model pick runs `/model <name>` itself and switches at once. The desktop app keeps 1.13.0's prompt-box way; if the terminal run is refused, it falls back to that too.

## 1.13.0 (2026-10-13)

**Found in use:** in the desktop app, a model pick never changed the app's model: it was a hidden override on every message, and anything picked in the app's own menu was replaced by it.

**What changed:** a model pick now puts `/model <name>` in the prompt box; Enter sends it, the same as typing it, so the app's menu and every mod agree. A mod can't send it for you: run in the background the app only sets a hidden session model, and a direct send is refused. The pane lights the session's own model. The effort pick still applies to each message; a model pick saved by an earlier version is dropped.

## 1.12.0 (2026-10-12)

**Asked for:** the status row (plan, model, effort, context, cache, usage) as a mod of its own.

**What changed:** the status row under the prompt moved to the new Session Lens mod. Control Panel keeps the footer chip and its panel (model and effort picks, settings, actions); Session Lens reads the pick from it, so the row still names the model and effort your requests go out with.

## 1.11.1 (2026-10-10)

**Asked for:** Tenant Lens's chip next to the Control Panel button.

**What changed:** when another mod has drawn in the footer corner (Tenant Lens), the Control Panel chip sits on the same bottom line to its right instead of under it. With only the engine's modes there, nothing changed.

