# Privacy policy

Last updated: 1 November 2026

This policy covers Open Design Agent Kit (“Open Design”): the ChatGPT plugin, the Claude plugin and desktop extension, the VS Code extension, the npm packages and the CLI, and the hosted Open Design server at `open-design.feimacode.com` (used by the Open Design connector in Claude's directory and the Open Design plugin in ChatGPT's directory), published by feimacode at [github.com/feimacode/open-design-agent-kit](https://github.com/feimacode/open-design-agent-kit).

## The short version

When you install Open Design yourself (the Claude plugin or desktop extension, Claude Code, Codex, VS Code, the ChatGPT desktop zip or the npm packages), it runs on your own computer. We don't receive your designs, prompts or files, and we don't collect analytics or telemetry.

When you add Open Design from Claude's connector directory or ChatGPT's plugin directory, it runs on our hosted server instead, which keeps your designs for a limited time (see [The hosted server](#the-hosted-server)). An account is optional.

## What stays on your computer

- The designs Open Design makes, the files it reads (for example a document you turn into a deck) and the settings you choose are kept in folders on your computer, such as `Documents/Open Design` or your project folder.
- Your conversation with ChatGPT, Claude or another assistant is handled by that assistant's provider under its own privacy policy. Open Design only sees the requests the assistant sends to its tools.

## When Open Design connects to the internet

Open Design sends data to another service only when you, through your assistant, ask for something that needs it:

- **Websites you name**, for example to take a design system from a website. Open Design loads that page the way a browser does.
- **Fonts, images and libraries** that a design refers to, when the design is checked, exported or bundled into one file.
- **Publishing a link.** When you ask for a temporary or hosted link, the design's files are uploaded to the service you choose (Netlify, Cloudflare Pages, Vercel or GitHub Pages) under that service's terms and privacy policy.
- **Services you connect**, such as Figma or Canva, with a token or connector you provide. Open Design sends them only the design or frame you asked to send.
- **Open content catalogues**, such as the community design catalogue and free 3D asset libraries, when you browse or use them.
- **Updates.** Installing or updating Open Design downloads it from npm or GitHub.

Each of these services handles the data under its own policy.

## The hosted server

The connector in Claude's directory and the plugin in ChatGPT's directory use our hosted server, `open-design.feimacode.com`. It runs in Singapore, on Microsoft Azure, behind Cloudflare.

**What it stores.** The tool requests your assistant sends it, and what they create: design files, the notes and comments saved with them, exports (PDFs, images, slides), and the read-only copies behind share links. Your conversation itself stays with your assistant's provider; the server sees only the tool requests.

**Accounts.** You can use it without an account. If you sign in (through Feima's sign-in service, `auth.feimacode.com`, with GitHub, email or another listed provider), we store an account identifier so your projects are kept for you; your sign-in details are handled by that service and the provider you choose.

**How long.**
- Projects without an account are deleted 7 days after their last use.
- Projects in an account are deleted 180 days after their last use, or when you delete them.
- Download links stop working after 24 hours; share links when their project is deleted.
- Backups are kept for 7 days.

**Logs.** The server keeps technical logs (time, the tool called, errors and the network address used for rate limits) for up to 30 days to run and protect the service. They don't contain your designs.

**Sharing.** We don't sell your data or use it for advertising or to train AI models. Cloudflare and Microsoft process it as our hosting providers. A share link shows that design to anyone who has the link.

**Deleting your data.** Ask your assistant to delete a project, or email support@feimacode.com with the project or account to delete. We delete it within 30 days, including from backups as they expire.

## Data we receive

From a copy of Open Design that runs on your own computer: none. If you open an issue or a pull request on GitHub, or email us, we receive what you send, and GitHub's privacy policy applies to GitHub.

## Children

Open Design is not directed at children under 13.

## Changes

We'll update this page when how Open Design handles data changes, and change the date above.

## Contact

Email support@feimacode.com, or open an issue at [github.com/feimacode/open-design-agent-kit/issues](https://github.com/feimacode/open-design-agent-kit/issues).
