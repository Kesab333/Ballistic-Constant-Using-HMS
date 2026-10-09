# Ballistic Constant Using Hibbert's Magnetic Standard

An interactive virtual laboratory for determining the ballistic constant of a moving-coil ballistic galvanometer using Hibbert's magnetic standard.

## Learning objectives

- Understand the charge impulse produced by a changing magnetic flux.
- Use the first and third throw method to determine the ballistic constant.
- Investigate the role of circuit resistance, damping, polarity, and optical displacement.
- Compare measured virtual observations with the governing equations.

## Features

- Interactive 3D laboratory with a Hibbert magnetic standard and galvanometer.
- Configurable circuit arrangement and instrument controls.
- Guided diagram, formula, calculation, observation, and results sections.
- Settling and measurement gates that prevent invalid trial sequences.
- Responsive interface for desktop, tablet, and mobile screens.
- No build process or application server required.

## Run locally

This is a standalone static website. Serve the folder with any static HTTP server (recommended because the application uses JavaScript modules and an import map), then open `index.html` in a modern browser.

For example, from this directory:

```text
python -m http.server 8000
```

Open `http://localhost:8000` in the browser. The page loads KaTeX, fonts, and Three.js from public CDNs, so an internet connection is required for those external assets.

## Project structure

- `index.html` — application shell and experiment sections.
- `css/` — laboratory, instrument, layout, reference, and responsive styles.
- `js/` — scene, apparatus, physics, navigation, observation, and UI logic.
- `images/` — diagrams, icons, and institutional branding.

## Developer and attribution

- **Developer/maintainer:** SOLVE Virtual Lab team
- **Institution:** National Institute of Technology Karnataka (NITK), Surathkal
- **Project:** SOLVE Virtual Lab
- **Contact:** No individual contact details are defined in this distribution. Please use the official NITK/SOLVE project channel when publishing or adapting this work.

The simulation is a physically consistent teaching model within the ballistic, small-angle regime. It is not a calibration certificate for a particular real instrument.

## License

This project follows the Virtual Labs licensing model:

- **Software / source code:** GNU Affero General Public License v3.0 (AGPL-3.0). See [LICENSE](LICENSE).
- **Educational and instructional content:** Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0), unless a different license is stated for a particular asset. See [CONTENT-LICENSE.md](CONTENT-LICENSE.md).

Third-party libraries, fonts, icons, images, diagrams, institutional branding, and other external materials are subject to their own licenses or permissions and are not automatically relicensed by this project.

The names, logos, seals, and trademarks of NITK, SOLVE, Virtual Labs, and other organizations remain subject to their respective trademark and institutional-use policies.

