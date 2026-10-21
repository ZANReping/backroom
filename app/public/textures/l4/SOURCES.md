# Level 4 texture sources

These texture maps are downloaded at 1K from Poly Haven's public API. Poly Haven assets are CC0 under the [Poly Haven license](https://polyhaven.com/license). The game recolors and balances these maps in the shader; source image pixels are unchanged.

| Asset | Maps | Source | Author |
| --- | --- | --- | --- |
| Dirty Carpet | Color, NormalGL, Roughness | [Poly Haven asset](https://polyhaven.com/a/dirty_carpet) / [API](https://api.polyhaven.com/files/dirty_carpet) | Rohit Seervi |
| Ceiling Interior | Color, NormalGL, Roughness | [Poly Haven asset](https://polyhaven.com/a/ceiling_interior) / [API](https://api.polyhaven.com/files/ceiling_interior) | Dimitrios Savva |
| White Plaster 02 | Color, NormalGL, Roughness | [Poly Haven asset](https://polyhaven.com/a/white_plaster_02) / [API](https://api.polyhaven.com/files/white_plaster_02) | Rob Tuytel |
| Denim Fabric | Color, NormalGL, Roughness | [Poly Haven asset](https://polyhaven.com/a/denim_fabric) / [API](https://api.polyhaven.com/files/denim_fabric) | Rob Tuytel |

## L4 v2 stage E1 (2026-10-21)

| File | Source |
| --- | --- |
| ceiltile_Color/NormalGL/Roughness.jpg | AI-generated (Hark generate_image, prompt: "Seamless tileable PBR albedo texture, orthographic flat close scan of a white mineral-fiber acoustic suspended ceiling tile surface, classic fissured 'worm-hole' pattern…"), low-frequency flattened, made seamless, desaturated; normal/roughness derived from luminance |
| drywall_Color/NormalGL/Roughness.jpg | AI-generated (prompt: "Seamless tileable PBR albedo texture, orthographic flat scan of an old office painted drywall wall, beige off-white latex paint with very fine orange-peel roller texture, faint scuffs…"), same processing |
| carpet2_Color.jpg | Derived from Poly Haven Dirty Carpet (CC0): luminance only, row stripes removed, cool tint; Normal/Roughness copied from dirty_carpet |

Processing script: kept outside the repo (numpy: Gaussian flatten r=64–160, half-offset seam blend, Sobel normal).
