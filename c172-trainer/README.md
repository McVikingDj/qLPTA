# C172 JT-A Trainer

Self-contained qLPTA addon concept for Cessna 172R/S JT-A technical study.

## Preview

From this folder, run:

```powershell
python -m http.server 4175 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:4175/index.html
```

The page uses `fetch()` to load `data/c172-data.json`, so it should be served over HTTP. It is suitable for GitHub Pages.

## Editing Aircraft Data

Most trainer content is in:

```text
data/c172-data.json
```

Update that file when adding accurate POH/AFM details, exact OSM phrasing, more cockpit hotspots, deeper system explanations, failure logic, oral prompts, and memory drills.

The cockpit image is:

```text
assets/cockpit-placard.jpg
```

