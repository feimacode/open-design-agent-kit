# Explore design directions

Not sure what it should look like yet? Ask for **directions**. The agent sketches 2–4 deliberately different takes on the same brief, puts them side by side, and builds out the one you pick.

## Before you start

Open Design is set up for your host: [VS Code](../getting-started/vscode.md), [Claude Code](../getting-started/claude-code.md) or [Codex](../getting-started/codex.md). A Chrome, Edge or Chromium install is needed only for the contact-sheet image.

## Steps

1. **Ask for options.**

   > Show me three directions for a landing page for our coffee subscription app.

   Say how many (2–4; the default is 3) or what should vary ("three different hero concepts"). An ordinary request ("design a landing page") still produces one design: exploring costs several generations, so the agent only does it when you ask for options.

2. **The tool picks the directions.** [`prepare_open_design_exploration`](../reference/tools.md#prepare_open_design_exploration) assigns them before anything is generated, so they really differ instead of drifting towards one look:

   | Situation | What varies |
   |---|---|
   | No active design system | **Visual style**: palette, type and layout posture, from Open Design's direction library (modern minimal, human/approachable, tech/utility, editorial, brutalist). |
   | An active [design system](design-systems.md) | **Structure**: your brand stays fixed and the layout changes (classic hero and grid, story-led scroll, product UI first, dense utility), or for decks the narrative (problem → solution, journey, data-led, demo first). |
   | You named what should vary | Only that, one direction per idea. |

   If a design system is active and you explicitly ask for different visual styles, it is set aside for this exploration, and the agent tells you.

3. **The agent sketches each direction** and registers it. Sketches are quick on purpose: one screen, or a cover plus two slides for a deck.

4. **Compare them.** [`compare_open_design_exploration`](../reference/tools.md#compare_open_design_exploration) writes a comparison page and, with a browser installed, a contact-sheet image. Agents that can view images check the sheet and redo any direction that looks like another before showing you.

5. **Pick one**, and say what to do with it:

   - **Build it out:** "Go with B." The full page or deck, at full fidelity, starting from the sketch.
   - **Merge:** "B, but with A's hero." The same, borrowing named parts from other directions.
   - **Save it as a design system:** "Keep B's look for everything." Later designs, including [collections](generate-a-design.md#collections), follow it.

   [`choose_open_design_direction`](../reference/tools.md#choose_open_design_direction) records the choice (the comparison page marks it) and hands the agent the instructions.

From there the result is an ordinary artifact: [export it](export-images.md), [comment on it](preview-comments-edit.md), or [promote it to app code](promote-to-app-code.md).

> **In VS Code:** each exploration appears in the **Collections** view (Open Design activity-bar icon), listing its directions, which one you chose, and any built-out version. Each direction opens in the [preview](preview-comments-edit.md), whose ◀ ▶ buttons step through the directions ("Direction 2 of 3"). **Open comparison in browser** in the same view opens the side-by-side page in your own browser; VS Code's Simple Browser blocks local files.

> **In Claude Code / Codex:** `/open-design-explore` (`/open-design:open-design-explore` with the plugin) runs the flow explicitly; the `open-design` skill also picks it up from a request for options. Open the comparison page the agent names in any browser; it works straight from the file system.

## What you get

```
.open-design/coffee-subscription-landing/
├── exploration.json            ← the plan: brief, directions, your choice
├── compare.html                ← every direction side by side (no scripts, works offline)
├── modern-minimal.html         ← one sketch per direction, each a registered artifact
├── human-approachable.html
├── tech-utility.html
├── tech-utility-full.html      ← the built-out choice (or merged.html)
└── exports/contact-sheet.png   ← the comparison page as an image, ready to share
```

The comparison page and the plan are generated files, not artifacts: they don't appear in the gallery, collections or export tools. Each sketch's manifest records its `explorationId` and `directionId` ([manifest fields](../reference/artifact-manifest.md#manifest-fields)).

## Troubleshooting

- **No contact sheet:** no browser was found. The comparison page still works; see [troubleshooting](../troubleshooting.md) to point Open Design at a browser.
- **A card says "Not generated yet":** that direction wasn't written and registered. Ask the agent to finish it.
- **Previews are blank in the comparison page:** some locked-down browsers block local pages inside frames. Use each card's "Open full size" link, or the contact sheet.
