## Context

Recipes such as `open-design-poster` and `open-design-deck-from-source` are local prompts rendered as skills for Claude Code, Codex, Copilot, the plugins, VS Code and MCP prompts. The "Data report" surface already asks "Which data?" and "What shape?". App-screen checks (`screenChecks.ts`) cover states and stress; the taste checks and critic judge the whole page. `add-data-bound-charts` gives charts with known data, type and columns.

## Goals / Non-Goals

**Goals:** a dashboard that answers its reader's question, with every number's meaning clear and traceable, in the place it's going.

**Non-Goals:** another template; live data; interactive filters; a BI-style builder.

## Decisions

### A recipe, not a template

There are already enough dashboard templates. What's missing is the order of decisions (data, reader, destination) and the rules. The recipe routes to the existing `dashboard` and `data-report` templates for the build and to app screens for in-app dashboards.

### Three reader types

| Reader | KPIs | Charts | Notes |
| --- | --- | --- | --- |
| Exec glance | 3 to 4 | 1 to 2 | One headline sentence on top; fits one screen or page |
| Team monitor | 4 to 6 | 2 to 4 | Status colours and thresholds; compact density; "as of" time visible |
| Analyst review | 2 to 4 | 4 to 6 | Tables beside charts; methodology note |

### Checks start as notes

Chart rules have legitimate exceptions (a line chart of temperatures needn't start at zero, so `chart-axis-truncated` applies to bars only). Findings are notes until a calibration run over the bundled dashboard examples and the eval runs shows few false alarms, as with the site audit's taste checks.

### Checks read the chart element when they can

For `data-od-chart` charts, the checks read type, series and format from attributes and colours from resolved tokens, with no image analysis. Hand-drawn SVG charts get only the contrast check, from the rendered colours of marks with a `data-od-series` attribute or distinct fills.

## Risks / Trade-offs

- **Routing overlap.** "Dashboard" also triggers app screens. The recipe asks where it goes and uses the app-screen route for "app screen", so both stay correct.
- **Removing the live templates from routing** could surprise someone who asked for "live". The recipe says plainly what the kit does instead.
