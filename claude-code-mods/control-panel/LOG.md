# Control Panel log

## 1.13.0 (2026-10-13)

**Found in use:** in the desktop app, a model pick never changed the app's model: it was a hidden override on every message, and anything picked in the app's own menu was replaced by it.

**What changed:** a model pick now puts `/model <name>` in the prompt box; Enter sends it, the same as typing it, so the app's menu and every mod agree. A mod can't send it for you: run in the background the app only sets a hidden session model, and a direct send is refused. The pane lights the session's own model. The effort pick still applies to each message; a model pick saved by an earlier version is dropped.

## 1.12.0 (2026-10-12)

**Asked for:** the status row (plan, model, effort, context, cache, usage) as a mod of its own.

**What changed:** the status row under the prompt moved to the new Session Lens mod. Control Panel keeps the footer chip and its panel (model and effort picks, settings, actions); Session Lens reads the pick from it, so the row still names the model and effort your requests go out with.

## 1.11.1 (2026-10-10)

**Asked for:** Tenant Lens's chip next to the Control Panel button.

**What changed:** when another mod has drawn in the footer corner (Tenant Lens), the Control Panel chip sits on the same bottom line to its right instead of under it. With only the engine's modes there, nothing changed.

