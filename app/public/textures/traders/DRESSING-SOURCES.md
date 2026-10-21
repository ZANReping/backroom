# Traders dressing atlas sources

This atlas is drawn entirely by `scripts/generate-traders-dressing.py` with Pillow and fixed seed `20261021`. It does not read or reuse external bitmap inputs, does not claim AI generation, and does not distribute fonts. Windows Arial is used only when available during generation.

Generation command:

```text
python scripts/generate-traders-dressing.py
```

The atlas is a fixed 4×4 layout with 16 cells: notice, fire safety, simplified Traders Keep plan, S-014 manifest, duty chart, terminal, numeric telephone keypad, archive folder, first aid, handwashing, clock face, barcode label, bedding, perforated steel, staff passage, and checked work order. The handwashing cell uses the numbered SOAP / RINSE / DRY three-step labels. The clock face has 12 at the top. Text and diagrams keep internal margins and avoid merchant names, products, menus, and real certification numbers.

| File | Size and format | SHA-256 |
|---|---|---|
| `dressing_color.jpg` | 1024×1024 RGB color atlas; 4×4 cells of 256px | `675fa76ed1c9bb5774d4137b5bb68cfdac191dd4626eddcd6e898b9b66f6bf9a` |
| `dressing_normalgl.jpg` | 512×512 OpenGL normal atlas; 4×4 cells of 128px; printed surfaces use flat normals | `2aa5de94d001d73a6dcc486f113a312787a56e666f90a1ff8e36173bee792462` |
| `dressing_roughness.jpg` | 512×512 roughness atlas; 4×4 cells of 128px | `a523622386d2a5bdbd5c4124e62855cdfcaeba7fd481db20f274dbecf5c58ae7` |

Each cell reserves an 8px edge padding area for sampling. Mipmap generation and filtering are handled by the runtime texture loader.

The perforated steel cell is periodic. Models repeat it in small quads at physical scale: the packing board uses roughly 6 mm holes and 34 mm spacing; microwave mesh uses smaller repeats. These quads join the same material batch, with no extra light or render pass.
