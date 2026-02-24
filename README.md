# Dig Through Earth

> What's on the exact other side of the world from where you're standing?

A goofy interactive 3D globe that shows you the **antipode** of any location — the point you'd reach if you dug a well straight through the Earth.

---

## Running

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

or

Open `https://dig-through-earth.pages.dev/`

---

## How it works

- **Globe:** [globe.gl](https://globe.gl) — a Three.js-based 3D globe renderer
- **World data:** [world-atlas](https://github.com/topojson/world-atlas) 110m TopoJSON, fetched from jsDelivr CDN
- **Geo math:** [d3-geo](https://github.com/d3/d3-geo) for point-in-polygon (`geoContains`) and centroids (`geoCentroid`)
- **Antipode formula:** `antipodeLat = -lat`, `antipodeLon = lon ± 180`
