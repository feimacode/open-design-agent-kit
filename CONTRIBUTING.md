# Contributing

Thanks for helping. You don't need to write code to make a difference here: a design you made, a bug you hit, or a question you had is just as useful.

## Ways to help

- **Show what you made.** Post it in [Show and tell](https://github.com/feimacode/open-design-agent-kit/discussions/categories/show-and-tell) with the prompt you used, or add it to the community gallery, [awesome-open-design](https://github.com/feimacode/awesome-open-design), so others can remix it.
- **Report a bug.** Open a [bug report](https://github.com/feimacode/open-design-agent-kit/issues/new?template=bug.yml). Say which agent you used (VS Code, Claude Code, Claude Desktop, Codex, Cursor) and attach the design if you can.
- **Ask for a design kind or a design system.** Use the [design request](https://github.com/feimacode/open-design-agent-kit/issues/new?template=design-request.yml) or [design system request](https://github.com/feimacode/open-design-agent-kit/issues/new?template=design-system-request.yml) forms.
- **Ask a question.** Use [Q&A](https://github.com/feimacode/open-design-agent-kit/discussions/categories/q-a). If the answer should have been in the docs, say so, and we'll fix the docs too.
- **Pick up roadmap work.** The [roadmap](docs/ROADMAP.md) lists what's next in each area. Comment on a related issue or open a discussion before starting something large.
- **Fix something.** Issues labelled [`good first issue`](https://github.com/feimacode/open-design-agent-kit/labels/good%20first%20issue) are small, self-contained, and have a pointer to where to start.

## Set up

You need Node.js 20 or newer.

```bash
git clone https://github.com/feimacode/open-design-agent-kit.git
cd open-design-agent-kit
npm install
npm run compile     # builds the VS Code extension
npm run test:unit   # unit tests
npm run lint        # lint, docs drift and design-system checks
```

To try your change in an agent, see [Architecture](docs/contributing/architecture.md) for how the packages fit together, and the getting-started guide for your agent in [docs/getting-started](docs/getting-started/README.md).

## Before you open a pull request

- **Keep it to one change.** Small pull requests get reviewed faster.
- **Name the roadmap area for new features.** A new feature's OpenSpec `proposal.md` says which [roadmap](docs/ROADMAP.md) area it serves (`Roadmap area: Design systems`), and the pull request updates the roadmap item.
- **Don't edit `packages/content/assets/`.** It is synced from upstream [Open Design](https://github.com/nexu-io/open-design). Our own skills, prompts and craft docs go in `packages/content/local/`; see [Adding a skill or prompt](docs/contributing/adding-a-skill-or-prompt.md) and [Content sync](docs/contributing/content-sync.md).
- **Update the docs** when you change a tool, setting, command or CLI option. `npm run lint` fails when the reference docs miss one.
- **For changes to checks, skills or craft content,** run the evals before and after, as described in [docs/contributing](docs/contributing/README.md#evals).
- **Add a line to [CHANGELOG.md](CHANGELOG.md)** under the next version for anything a user would notice.

## How we reply

Some first replies on issues and discussions are drafted with AI, and say so. A maintainer reads every thread. If an AI reply got it wrong, say so in the thread and a person will follow up.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE). Content synced from Open Design stays under its Apache-2.0 license.
