# Level 11 标牌图形（已弃用的独立标志方案）

用户随后明确要求直接生成完整标牌，风格参考 00 年代。因此本文件的独立标志方案不接入游戏；最终方案与全部原图见 [FULL-SIGN-PROMPTS.md](FULL-SIGN-PROMPTS.md) 和 `sources/`。

使用内置 `image_gen`，通过 imagegen 技能生成。用途是原创城市标牌图形；建筑表面仍优先采用已有 CC0 PBR 材质。图形不冒充 CC0 素材，不含现实品牌。文字在运行时独立排版，保证汉字和道路信息准确。

## 01 · 城市标识图集

Use case: logo-brand
Asset type: a production-ready transparent emblem atlas for the signs of a realistic deserted modern city in a Three.js game.
Primary request: create distinctive original sign emblems with the visual variety of real neighborhood shops, civic institutions and public transport. They should feel professionally designed by different local businesses and city departments, not like one generic app icon set.
Composition: exactly sixteen emblems, in an exact four-column by four-row grid on a square canvas. Every cell has identical size. Center one emblem in each cell and keep its entire silhouette within the central 72% of that cell, with clear transparent gutters. No grid lines. True transparent background outside the emblems. Orthographic flat artwork, no mockup, no perspective, no lighting or cast shadows.
Subjects, row-major order:
Row 1: an artisan bakery emblem combining a wheat ear and a loaf; a coffee shop emblem with a cup and a rising arc of steam; a fresh produce market emblem combining an apple and two leaves; a bookshop emblem combining an open book and a small rising sun.
Row 2: a city hotel emblem combining an elegant key and an arched doorway; a neighborhood repair workshop emblem combining a wrench and a gear; a residential apartment emblem combining a ginkgo leaf and a stepped roofline; an office center emblem combining two architectural verticals and a horizon.
Row 3: a public archive emblem combining stacked folios and an open archival box; a museum emblem combining a classical colonnade and a sun; a school emblem combining a growing tree and an open book; a sports hall emblem combining a running track and a dynamic ribbon.
Row 4: a metro emblem combining two converging rails and a portal; a bus service emblem showing a clear front-facing bus inside a roundel; a canal district emblem combining an arched bridge and three flowing water lines; a municipal services emblem combining a simple skyline and a civic shield.
Style: polished flat sign-painting and enamel-badge artwork, strong readable silhouettes, deliberate negative space, clear contours. Mix circular badges, elegant monograms without letters, horizontal crests, and freestanding pictorial marks. Commercial marks have individual identities; public transport marks are spare and functional. Use restrained street-sign colors that remain readable on both warm cream and dark navy panels: brick red, deep teal, ochre, blue, cream and charcoal. Use solid fills, no paper grain, no speckle, no random noise texture, no gradients. Several marks may have their own solid badge backing as part of the silhouette.
Text: none. No letters, numbers, captions, signatures or watermark. Do not copy existing corporate or transport logos. Do not draw panels, poles, buildings, people or scenes around the emblems.

## Integration / iteration notes

- 图集只承载标志；中英文名称、线路、道路名、方向和警示信息使用清晰的独立文字排版。
- 按固定图集单元使用 UV，不在运行时改变图形。不同标牌采用对应的搪瓷、烤漆、金属铭牌或灯箱结构。
- 原始图集及选用版本、实际尺寸、处理方式和游戏内验收记录在生成完成后补充。
