# Aedifex furniture pack

Source: https://github.com/TangSY/aedifex

This folder contains the local item assets found under `apps/editor/public/items` in the Aedifex repository, plus the upstream catalog definition and license.

- `items/<id>/model.glb`: self-contained glTF binary model
- `items/<id>/thumbnail.webp`: catalog preview where supplied
- `items/<id>/floor-plan.*`: optional 2D plan symbol
- `manifest.json`: local paths, sizes, and GLB validation result
- `catalog-items.tsx`: upstream catalog metadata; some entries point to the upstream public Supabase catalog rather than the local files
- `LICENSE`: upstream MIT license; retain it and the copyright notice when redistributing substantial portions

The repository did not contain a separate asset-license or attribution file for these local models. Review upstream changes and provenance before commercial redistribution.
