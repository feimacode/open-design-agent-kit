## Decisions

### Coverage over first-page-wins, but only with evidence

With one page, nothing changes. With two pages that disagree, coverage is 50/50 and the home page wins the tie, as today. Election changes the answer only when most pages agree against the home page, which is exactly the case where first-page-wins is wrong.

### Thresholds for four pages

design-extract's 80% and 40% assume up to 8 pages. With our cap of 4, 80% means 4 of 4 (or 4 of 5 if the cap rises), and 40% means 2 of 4. Those are sensible readings of "everywhere" and "in a section" at this size. The cap stays at 4 pages to keep the visit polite and within time. Raising it is a separate decision.

### Merge before counting

Sites render the same brand blue as `#0070f3` and `#0072f5` through rounding and opacity. Counting them apart splits the vote. ΔE 2000 below 3 is below a visible difference on screen. The most-used exact value is kept so the token is one the site really paints.

### Discovery from navigation only

Header and footer links are where a site points to its canonical pages. Crawling beyond them, or following in-page links, risks landing on user content, search results or infinite lists. The preference order puts pages with product UI (pricing, features) first, because they show buttons, cards and tables. Log-in and sign-up pages are skipped, because they are often a third-party identity provider's look.
