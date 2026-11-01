## 1. Viewer

- [ ] 1.1 Iven picks the user-content domain (separate registrable domain)
- [ ] 1.2 Host-based routing in the gateway; `/v/<view id>/` serves the entry and its assets, read-only, with the headers in design.md
- [ ] 1.3 `views.json` per project; mint a view id in `show_open_design_artifact`, export and publish replies; tests for traversal, unknown ids and expiry
- [ ] 1.4 Remote profile: no temporary third-party publish providers; publish returns the viewer link
- [ ] 1.5 Footer bar with "report this page" (mailto to the support address)

## 2. Verification

- [ ] 2.1 A client with views off gets a link that opens the design; the link stops working after the project expires
- [ ] 2.2 A design's script can't read cookies of feimacode.com (manual check in a browser)
