<!-- Kit craft doc (openspec add-dashboard-recipe). The kit's own text. -->
# Dashboard layout craft rules

A dashboard answers one reader's questions about one period. Decide who
reads it and how long they look before choosing a single chart. The active
`DESIGN.md` decides how it looks; this file decides what goes where.

## Layout by reader

| Reader | KPI cards | Charts | Layout |
| --- | --- | --- | --- |
| Exec glance (seconds) | 3 to 4 | 1 to 2 | A headline sentence with the main finding on top, KPI row, one trend chart; fits one screen or one page |
| Team monitor (all day) | 4 to 6 | 2 to 4 | Compact density, status colour plus a word ("Over target"), thresholds on charts, "as of" time always in view |
| Analyst review (minutes) | 2 to 4 | 4 to 6 | Each chart with its table or top rows beside it, a short "How these numbers are made" note at the end |

Reading order: the most important number top left, then left to right, top
to bottom. Put the chart that explains the headline number directly under
it. Don't fill space with charts nobody asked about.

## KPI cards

- **Label** in plain words ("New customers", not "new_cust_cnt").
- **Value** with its unit and the same rounding everywhere ("$1.2M", "4.3%").
- **Period** on the card ("September 2026", "Week 48").
- **Change** against a named comparison ("▲ 4% vs August"): the sign and an
  arrow in text, colour only as a second cue. A change with no comparison
  period is meaningless.
- Up isn't always good (costs, churn, response time): say "better" or "worse"
  in the label or tooltip when it isn't obvious, and colour by good or bad,
  not by up or down.

## Chart choice by question

| Question | Chart |
| --- | --- |
| How did it change over time? | Line (one to four series); area for volume |
| How do items compare? | Bar, sorted by value; horizontal when names are long |
| What share of a total? | Donut with at most 5 parts, or a stacked bar; otherwise a sorted bar |
| Is it on target? | KPI card with the target in text, or a bar with a target line |
| Where are the outliers? | A sorted table with the top and bottom rows |

Rules that hold for every chart: bars start at zero; at most 6 lines on one
chart; label units on the value axis or in the title; a legend or direct
labels whenever there is more than one series; the same colour means the
same thing on every chart of the dashboard.

## Density

Match the reader: exec dashboards breathe (large numbers, few items), team
monitors are compact (`product-ui` compact density), analyst reviews are
medium with tables. Long category names, large numbers and a month with no
data must still fit: try the longest value in the data before you finish.

## States

The data can be late, missing or empty. Show the "as of" date. For an app
screen dashboard, design the empty (no data yet), loading and error states
as `state-coverage` describes; a dashboard to send needs only the "as of"
date and a visible "Sample data" label when the data is sample.
