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

## Tailored versions

One library, a version per situation. Paste the job ad, the client's brief, the school's rules or your promotion criteria and say who it's for: "Make a version of my portfolio for this Acme job: <ad>". The agent saves it as a **target** and suggests an order of your projects from the words in the notes, showing which words each project matched, so you can change it.

| Kind | What it makes | Defaults |
|---|---|---|
| Job | A site (unlisted, at its own address) and a PDF with a cover note | PDF up to 10 MB, 16:9 |
| Client | A site and a PDF, with an optional "For you" section linking a [redesign concept](redesign-a-website.md) of their site and its before/after page | PDF up to 10 MB |
| School | An image set (one titled file per piece) and a PDF | each image up to 5 MB, PDF up to 10 MB, A4; the piece count you enter (SlideRoom's documented limits; enter each school's own) |
| Promotion | A PDF with a criteria map: every criterion from your framework, the projects and outcomes that show it, and the ones with no evidence yet left visible | internal, no size limit |

When a PDF is over its limit, the export lowers image quality step by step and keeps every page; if it still doesn't fit, it says which pages are heaviest.

### Privacy ceilings

Every version has a privacy ceiling: the strictest work it may hold. A public version can't show anything unlisted or internal; an unlisted one can't show anything internal. Export and publish both check every page and refuse a version that holds more than its ceiling allows, naming each picture or project and its page. An internal version (a promotion packet, work under NDA) is exported as a file only, never published. An unlisted version is published as a Claude artifact, or on a host where you add a password; the kit never says a password was set when it didn't set one.

The check finds library work by the ids the portfolio skills write on every picture and project. A picture pasted in some other way has no id, so the check warns about it; keep library pictures to the markup the brief gives.

## Your own style

A portfolio should look like you, not like a template. The library can name a design system as its style. The agent offers to build one from your current site, your Figma or Canva files, or screenshots of your work, using the same extraction as [design systems](design-systems.md).

## A portfolio site

"Make my portfolio site from my library, with the checkout, bank and design system projects" builds a small website with the `portfolio-site` skill:

- **Home**: your name, role, a contact link and the first project, all on the first screen of a phone, then one card per case study.
- **One case study per project**: a summary (role, team, dates, the main outcome), the problem, constraints, your decisions with the options you rejected and why, the outcome exactly as the library has it, and next steps. Decisions get the most room, because reviewers weigh them most.
- **About and contact**: your bio and links from the library.

The pages are one collection planned as a website, so publishing any page publishes the whole site with home as its `index.html`. Pictures come from the library at 800, 1400 and 2800 px with `srcset`, with blur boxes baked in and internal pictures left out.

**How I worked.** A case study can show your process only from what the kit recorded for the project's designs: the directions you explored and compared, the edits you checked, the review comments you addressed and before/after pages. Link designs to a project with `designs` in `save_open_design_project`. With no records, the block is left out rather than written from imagination.

The check adds a portfolio group for these pages: the first screen on a phone and a desktop, each case study's summary and length (500 to 1,800 words), alt text you haven't confirmed, pages over 3 MB, live product links that don't resolve, and anything internal. See [check_open_design_artifact](../reference/tools.md#check_open_design_artifact).

## A portfolio interview deck

"I have a 45-minute portfolio presentation on Thursday; use the checkout and bank projects" builds the deck with the `portfolio-interview-deck` skill: an intro, your current role, each project's context, problem, artifacts (with the rejected options), collaboration and impact, a close, and backup slides for the questions that usually come.

Every slide has presenter notes and a minute budget. Press P in the preview for presenter mode: the notes, the slide's minutes, the running total against your slot and a timer. The check adds up the minutes and tells you when the talk runs more than 10% over or under, so you can cut before you rehearse. Export it as editable PowerPoint (notes included) or PDF.

> **On the hosted server** (Claude and ChatGPT on the web): live pages can't be captured and Figma frames come only through the Figma connector. Attach screenshots instead.

## Sharing a project

The `portfolio-share-pack` recipe turns one **public** project into everything to post it: a cover, three to five Dribbble shots, Behance modules and cover, a LinkedIn document post, an Instagram carousel and a marketplace cover for Upwork, Contra or Fiverr. Each piece is a design in a share format, so it gets the normal checks, steering edits and exports, and they share one collection so they export together.

| Platform | Format | Size and limit | Source, checked |
|---|---|---|---|
| Dribbble | `dribbble-shot` | 1600×1200 (any ratio accepted); images 10 MB, video 20 MB | [Dribbble help](https://help.dribbble.com/en/articles/11062601-creating-dribbble-shots), 2026-11-11 |
| Behance | `behance-module`, `behance-cover` | modules 1400 wide, 10 MB recommended, 50 MB refused; cover at least 808×632 | [modules](https://help.behance.net/hc/en-us/articles/204484614), [cover](https://help.behance.net/hc/en-us/articles/204483484-Guide-Project-Cover-Image), 2026-11-11 |
| LinkedIn | `linkedin-document` | 1080×1350 cards, one PDF; 100 MB, 300 pages (unverified) | LinkedIn help blocks automated reading, 2026-11-11 |
| Upwork | `marketplace-cover` | 1000×750 (4:3), 400×300 to 4000×4000 | [Upwork help](https://support.upwork.com/hc/en-us/articles/360016144974), 2026-11-11 |
| Fiverr | `marketplace-cover` | 1280×769 recommended (crops the 4:3 cover) | [Fiverr help](https://help.fiverr.com/hc/en-us/articles/15863342952977-Gig-Images-General-Gig-image-guidelines), 2026-11-11 |
| Contra | `marketplace-cover` | no published size (unverified) | 2026-11-11 |

Export uses each limit as the byte budget and reports a file still over it; a value marked unverified only warns. The rules live in one data file with their sources, so a platform change is one edit.

Screens imported with a device (`iphone`, `android`, `ipad`, `browser`, `macbook`) get a copy inside the kit's device frame at import (with any redaction boxes baked in), and the brief offers it as `data-od-framed` markup for shots and covers. A phone screenshot that has its own status bar shows two; crop it before importing.

The recipe also writes `posts.md`: the post text per platform, from the project's facts only. An unlisted or internal project is refused with a question: make it public, or pick another.

## A community review round

The `portfolio-review-round` recipe gets feedback from strangers without telling them who you are:

1. A **review target** (`kind: "review"`, the community's rules as `notes`, `review: { community, questions, notWanted, labels }`) is unlisted and builds as a site. At most three questions: with more, the agent asks which three to keep.
2. Its brief lists every identifying fact to replace (your name, email and profile links, employers and clients, live links) with a neutral label ("Grocery company, 2025"). The check reports any left in the text, alt text, file names, `<title>`, Open Graph tags or link targets as `review-anonymity` errors, and publish refuses the version until they are gone. Pictures aren't searched: add redaction boxes for faces, logos and names in screenshots.
3. `review-post.md` holds the context, the questions, the feedback not wanted and the unlisted link, ready to paste.
4. Paste the replies back: `import_open_design_comments` with `source: "community"` records each point as an open comment on the page it is about (or the home page). Resolve them as you revise.
5. The follow-up compares the posted version with the revised one on a before/after page, and drafts `follow-up-post.md` with what changed for each resolved point.

The kit never posts or reads the community for you: you paste the post and the replies.
