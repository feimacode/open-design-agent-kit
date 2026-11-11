# Portfolios

Designers don't keep one portfolio. They keep one body of work and cut it again for each situation: a job application, the portfolio interview, a post asking peers for a review, a client pitch, a marketplace profile, a school application or a promotion packet. Open Design keeps that body of work in a **work library**, so the facts (role, team, dates, decisions, results) and the images are entered once and every portfolio output reads them.

Ask for it in plain words, for example:

- "Start my portfolio. I'm a product designer; here are screenshots of my last three projects."
- "Add my checkout redesign from Figma to my portfolio: <frame link>."
- "Capture our live app's sign-up page for the onboarding case study."

The `open-design-portfolio` skill takes it from there.

## The work library

The library lives in `portfolio/` in your designs folder (`.open-design/portfolio/`, or `Open Design/portfolio/` in Claude Desktop):

```
portfolio/
  library.json                 you, your portfolio style, the project order
  projects/<project>/
    project.json               the facts
    assets/                    your images: originals, WebP widths, redacted copies
```

Only the portfolio tools write there: [`save_open_design_project`](../reference/tools.md#save_open_design_project) saves facts and asset edits, [`import_open_design_work`](../reference/tools.md#import_open_design_work) brings images in, and [`get_open_design_library`](../reference/tools.md#get_open_design_library) reads it all back. It is plain JSON and image files, so you can back it up or keep it in git.

A project records its title, your role and its privacy level, and can record the company or client, team, dates, platforms, problem, constraints, key decisions (the choice, the options you rejected, why, and the trade-off), outcomes, links and tags.

### No invented facts

The agent never makes up an outcome, a metric, a team member, a client or a date. When something is missing, the tools say so and the agent asks you. Every outcome carries a source:

| Source | Shown as |
|---|---|
| `measured` (you have the number) | as you wrote it: "Checkout conversion: +18%" |
| `estimated` | with "about": "Support tickets: about -30%" |
| `qualitative` (no number) | the sentence only: "Sales found it easier to demo" |

## Bring your work in

| From | How |
|---|---|
| Images on your computer | Put them in the workspace (or attach them in a chat) and ask to add them. PNG, JPEG, WebP, GIF and MP4. |
| Figma | Share a frame link (Figma's "Copy link to selection"). With the Figma connector connected, the agent takes a picture of the frame through it; with a [Figma token](figma.md) set, the kit downloads it. |
| A live product | Give the address. The kit captures it at desktop and phone sizes. |
| A design made with the kit | Name the design; it is captured the same way and linked to the project. |

Every image loses its camera, location and editing metadata, keeps one original, and gets WebP copies 800, 1400 and 2800 px wide for the web and for Dribbble and Behance (this needs a browser such as Chrome). Images narrower than 1600 px are flagged, since Dribbble and Behance show them small.

Each image needs alt text. The agent looks at the image and drafts it; the draft stays marked until you confirm it.

## Privacy

Every project, and any image inside it, has a level:

| Level | For |
|---|---|
| `public` | Work you can show anywhere. |
| `unlisted` | Work you send only to the people you choose (a hiring manager, a client). |
| `internal` | Work under NDA, or only for a promotion packet inside your company. |

An image can be stricter than its project, never looser. To hide part of a screen (a customer's name, a price), ask the agent to blur it: the box is baked into every copy of the image, so no output can show what it covers.

## Your own style

A portfolio should look like you, not like a template. The library can name a design system as its style. The agent offers to build one from your current site, your Figma or Canva files, or screenshots of your work, using the same extraction as [design systems](design-systems.md).

> **On the hosted server** (Claude and ChatGPT on the web): live pages can't be captured and Figma frames come only through the Figma connector. Attach screenshots instead.
