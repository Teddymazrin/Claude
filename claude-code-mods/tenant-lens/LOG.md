# Tenant Lens log

## 1.1.0 (2026-10-10)

**Asked for:** the row under the prompt was too crowded; move it next to the Control Panel button. Tried a `☁ tenant › subscription` chip, then settled on a plain **Azure Context** button that reveals the details on click.

**What changed:**
- One button, bottom right, left of **◆ Control Panel**: `☁ Azure Context` on an Azure-blue chip (`#0078d4`), or a red chip when the subscription looks like production, so it warns while closed.
- Click it to reveal, above the button, the tenant and the subscription, each name with its id on the line under it so long names don't make a wide box. The box is black with light text, matching Control Panel's pane. The arrow turns to `▾`; click again to hide.
- When az CLI and Az PowerShell point at different subscriptions the button reads `Azure Context ≠`, and the reveal lists both with an orange line saying they differ.
- Control Panel 1.11.1 puts another mod's chip to its left, so the two line up whichever mod draws first.
- The account moved to `/tenant-lens` only.
- Labels end in a colon: `Tenant:`, `Subscription:`.
- The tenant shows its domain (`contoso.onmicrosoft.com`), id underneath. az CLI's file has no domain when you signed in with `--tenant`, so the first time you open the details for a tenant with none, it runs `az rest` against ARM's `GET /tenants` once and keeps each tenant's default domain for good. That's a network call made by az with your sign-in; no Claude tokens. While it runs the box says `looking up the domain…`; if az isn't signed in it says `domain unknown: run az login to show it` and tries again after the Azure files change.

**Found in testing:** on this machine az's sign-in had expired (90 days idle), so the lookup returned an error; the live lookup is untested. `az account tenant list` needs an extension, so the mod uses the built-in `az rest` instead.

**Not done:** the button can't take a custom text colour (a Button has no `color`), so production shows as the chip's background instead.

## 1.0.0 (2026-10-10)

**Asked for:** a status row item showing the active Azure tenant, subscription and account, so a subscription-wide script never runs against the wrong tenant. Should it cost tokens?

**What it does:**
- Reads `~/.azure/azureProfile.json` (az CLI, or `AZURE_CONFIG_DIR`) and `~/.Azure/AzureRmContext.json` (Az PowerShell). Local files only: no sign-in, no network call, no tokens, and nothing is added to Claude's context.
- One row under the prompt per signed-in tool: `☁ az Contoso Prod | tenant contoso.onmicrosoft.com | me@contoso.com`. Both on the same subscription share one row (`az · Az`); different subscriptions get two rows and an orange `differs from az`.
- A subscription named like production (`prod`, `production`, `prd`, `live`) shows in red.
- Rereads after every Bash and PowerShell call and once a minute.
- `/tenant-lens` prints full names and ids for both tools.

**Found in testing:** az CLI's file can start with a BOM, so it's stripped before parsing. On this machine Az PowerShell has no saved context file (Az.Accounts isn't installed, or context autosave is off), so only the az row shows.
