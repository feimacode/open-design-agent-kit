# Dashboards

Ask for a dashboard in plain words ("a weekly KPI dashboard for the leadership meeting from `data/kpis.csv`") and the agent uses the `open-design-dashboard` recipe. It builds a dashboard from your data file, shaped for the person who reads it, with charts the kit draws from the data, checked, and exported as a PDF, slides, a link or an app screen.

The kit doesn't connect to live systems such as databases, Notion or analytics tools. It builds the dashboard from a file, and the same design can be [refreshed from a new file](recurring-jobs.md#refresh-a-dashboards-data) every day, week or month.

## What the agent does

1. **Finds the data.** A CSV, Excel or JSON file in the workspace is used as it is. Pasted data is saved as a CSV first. With no data, the agent offers sample data and labels the dashboard "Sample data". It then tells you which columns become KPI cards and which become charts.
2. **Asks three questions**, each with a default:
   - **Who reads it?** An *exec glance* (the default for leadership, the board and investors), a *team monitor* (the default for ops and support), or an *analyst review*.
   - **Where does it go?** *Send it* as a PDF or slides (the default), *share a link*, or *an app screen* that becomes code.
   - **Which period, compared with what?** By default, the latest period in the data against the one before it.
3. **Builds it** from the `dashboard`, `data-report` or `finance-report` recipe, with the data in the design's [data file](data-and-charts.md#your-data-file), every chart a [kit chart](data-and-charts.md#charts) and every other number bound to the data.
4. **Registers it** with the data files as sources, so every number on the page is found in your files.
5. **Checks it**, fixes the errors and the [chart notes](data-and-charts.md#what-the-check-reports), and gets a second opinion from the design critic.
6. **Hands it over:** a PDF (and PowerPoint on request), a link, or a port to your app's code where the data file becomes the app's mocks.

## Layout by reader

| Reader | KPI cards | Charts | Layout |
|---|---|---|---|
| Exec glance | 3 to 4 | 1 to 2 | A headline sentence with the main finding, a KPI row and one trend chart, on one screen or page |
| Team monitor | 4 to 6 | 2 to 4 | Compact, with thresholds and a status word ("Over target"), and the "as of" time always in view |
| Analyst review | 2 to 4 | 4 to 6 | Each chart with its table or top rows beside it, and a short note on how the numbers are made |

Every KPI card shows a label in plain words, the value with its unit, the period, and the change against a named comparison ("▲ 4% vs August"). The "as of" date comes from the data file. These rules are in the kit's `dashboard-layout` craft doc, which the brief includes.

## Rebuild it every week

When the numbers come back every day, week or month, the agent offers once to make it a [recurring job](recurring-jobs.md#refresh-a-dashboards-data) with `refresh: data`. Each run then swaps in the new data and leaves the design exactly as it is.

## Related

- [Data and charts](data-and-charts.md)
- [Generate a design](generate-a-design.md)
- [Export decks and PDFs](export-decks.md)
- [Promote to app code](promote-to-app-code.md)
