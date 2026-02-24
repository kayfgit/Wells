# ⛏️ Dig Through Earth

> What's on the exact other side of the world from where you're standing?

A goofy interactive 3D globe that shows you the **antipode** of any location — the point you'd reach if you dug a well straight through the Earth.

---

## Running locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Deploying for free

### Option A — GitHub Pages (recommended, fully free)

1. Push this repo to GitHub
2. Install the deploy helper: `npm install -D gh-pages`
3. Add to `package.json` scripts:
   ```json
   "deploy": "vite build && gh-pages -d dist"
   ```
4. Run `npm run deploy`
5. In your GitHub repo → **Settings → Pages → Source: gh-pages branch**
6. Your site is live at `https://<your-username>.github.io/<repo-name>/`

### Option B — Netlify (drag & drop, free)

1. Run `npm run build`
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Deploy manually**
3. Drag the `dist/` folder onto the page
4. Done — you get a free `*.netlify.app` URL with a custom domain option

### Option C — Cloudflare Pages (also free, very fast CDN)

1. Push to GitHub
2. Go to [pages.cloudflare.com](https://pages.cloudflare.com) → Connect repo
3. Build command: `npm run build`, output directory: `dist`
4. Deploy

---

## How it works

- **Globe:** [globe.gl](https://globe.gl) — a Three.js-based 3D globe renderer
- **World data:** [world-atlas](https://github.com/topojson/world-atlas) 110m TopoJSON, fetched from jsDelivr CDN
- **Geo math:** [d3-geo](https://github.com/d3/d3-geo) for point-in-polygon (`geoContains`) and centroids (`geoCentroid`)
- **Antipode formula:** `antipodeLat = -lat`, `antipodeLon = lon ± 180`
