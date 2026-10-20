# Level 11 · 00 年代完整标牌生成

采用内置 `image_gen`，不是 CLI。所有文字、背景、边框和插图均在整块标牌中生成，运行时不重画品牌文字。用户最新要求覆盖先前独立标志方案；先前标志图集不接入项目。

## 共用提示词

Use case: logo-brand
Asset type: a square game texture sheet containing FOUR COMPLETE Chinese street sign faces, not isolated logos. A realistic Chinese city around 2000–2008, mildly retro. These will be mapped directly onto full-size signboards in a Three.js city.
Layout: four wide horizontal rectangular signboards stacked in FOUR EQUAL ROWS, exactly one sign per row. Each sign face has an approximately 4:1 width-to-height ratio and occupies the central 90% width of its row. Keep clear transparent margins between rows and around the outside. Include the entire rectangular panel, its background color, printed lettering, original pictorial emblem, borders and graphic design. Front view, perfectly flat orthographic artwork, horizontal text, no perspective, no sign poles or surroundings. True transparency only OUTSIDE the four opaque sign faces.
Visual direction: early-2000s Chinese neighborhood signage; period vinyl printing, enamel street signs, acrylic lightbox graphics and institutional painted metal plaques. Practical, commercially designed and readable. Different typographic personalities and layouts for each sign. Clear Chinese lettering with period-appropriate bold sans, rounded display or dignified Song type as specified. Original fictional businesses. Small appropriate pictorial illustrations are welcome inside the full sign. Restrained real-world street colors, no cyberpunk or 1980s neon aesthetic. The sign face itself has solid printed colors and crisp borders, no simulated lighting, bevel shading, paper fibers, random grain, speckled wear or noise textures. Do not add 3D frames or photographs.
Text must be exactly as specified for each row; all text is part of the generated full sign. Add no extra slogans, phone numbers, addresses, watermarks, captions or row labels.

## 01 · shops

Row 1: “春禾面包房”, small secondary “CHUNHE BAKERY”. A warm cream storefront fascia, deep brick-red rounded Chinese lettering, a golden wheat-and-loaf illustration, fine double red border, friendly early-2000s bakery.
Row 2: “蓝岸咖啡”, small secondary “BLUE BANK COFFEE”. Deep dark teal and cream, elegant cream Chinese lettering, oval cup-and-steam vignette, understated ochre divider. An independent city cafe fascia.
Row 3: “新鲜果蔬”, small secondary “FRESH MARKET”. Cheerful cream and leafy green produce-shop fascia, bold green characters with a little orange emphasis, apple-and-leaf illustration, green bottom strip.
Row 4: “启明书店”, small secondary “QIMING BOOKS”. Blue bookstore fascia with warm white dignified Chinese lettering, open-book and rising-sun emblem, small ochre corner rules. Each of these four is an entire rectangular store sign.

## 02 · commerce

Row 1: “运河旅馆”, small secondary “CANAL HOTEL”. Burgundy hotel lightbox fascia, ivory Song-style Chinese lettering, an elegant gold key inside an arch, narrow gold border.
Row 2: “大众维修”, small secondary “REPAIR SERVICE”. White repair-shop fascia with a cobalt-blue band, bold red Chinese lettering, original wrench and gear illustration, small safety-yellow accent.
Row 3: “民生超市”, small secondary “MINSHENG MARKET”. Bright warm yellow supermarket fascia with large red rounded Chinese lettering, green lower stripe, a little original shopping-basket illustration.
Row 4: “街角百货”, small secondary “CORNER STORE”. Cream general-store fascia with blue and red block lettering, a small striped shopping bag illustration, geometric early-2000s red-and-blue edge stripes.

## 03 · addresses

Row 1: “银杏公寓”, small secondary “GINKGO APARTMENTS”. Deep forest-green residential entrance plaque, ivory dignified Chinese lettering, gold ginkgo-leaf emblem and fine double border.
Row 2: “春晖里”, small secondary “CHUNHUI RESIDENCE”. Warm ivory residential name plaque, dark umber calligraphic but legible Chinese lettering, small olive-green roof-and-leaf crest, elegant deep red edge rules.
Row 3: “汇景商务中心”, small secondary “HUIJING BUSINESS CENTER”. Silver-gray and deep navy corporate entrance fascia, clean heavy dark-blue Chinese lettering, architectural vertical-line emblem and blue geometric underline.
Row 4: “天际写字楼”, small secondary “SKYLINE OFFICES”. Dark blue-gray office plaque with white condensed Chinese lettering, a small ochre twin-tower emblem, deliberately asymmetrical blue-gray and ochre composition.

## 04 · industry

Row 1: “城市仓储”, small secondary “CITY WAREHOUSE”. Off-white industrial fascia with strong navy lettering, orange corner bars, simple stacked-box emblem, utilitarian 2000s logistics design.
Row 2: “街区工坊”, small secondary “DISTRICT WORKSHOP”. Brick-red and cream workshop fascia, bold cream Chinese lettering, a simple gear and roof emblem, modest black lower stripe.
Row 3: “运河水务”, small secondary “CANAL WATERWORKS”. White enamel utility sign with cobalt-blue Chinese lettering, blue waves under an arched bridge emblem, blue double-line rectangular border.
Row 4: “城市体育馆”, small secondary “CITY SPORTS HALL”. Teal and white public sports sign, broad dark teal Chinese lettering, simple red running-track ribbon emblem, dynamic curved red-and-teal underline.

## 05 · civic

Row 1: “城市公共档案馆”, small secondary “PUBLIC ARCHIVE”. Warm ivory enamel institutional plaque, dignified dark red Song-style Chinese lettering, a small red archival-box-and-folio crest, elegant red double border. This is the main city archive and should be especially clear.
Row 2: “城市博物馆”, small secondary “CITY MUSEUM”. Deep bronze-brown museum plaque, ivory Chinese lettering, an ochre colonnade and sun emblem, understated inset gold border.
Row 3: “光华学校”, small secondary “GUANGHUA SCHOOL”. Warm cream school gate sign, clear dignified dark red Chinese characters, a green tree growing from an open book emblem, restrained red horizontal rules.
Row 4: “市民服务中心”, small secondary “CIVIC SERVICE CENTER”. White municipal enamel plaque with sober blue Chinese lettering, simple blue skyline-and-shield crest, blue bands and a thin red divider.

## 06 · destinations

Row 1: “地下步行站台”, small secondary “METRO”. A complete deep blue subway entrance sign, large white Chinese lettering, original portal-and-converging-rail emblem, thin cyan lower band. A downward arrow inside a small white square on the right.
Row 2: “郊区入口”, small secondary “LEVEL 9”. A complete dark navy and white direction sign, bold white Chinese lettering, a simple outline of low houses on the left, a small yellow square with a downward arrow on the right.
Row 3: “乡间小路”, small secondary “LEVEL 10”. A complete forest-green and cream route sign, clear cream Chinese lettering, little ochre wheat-stalk and path vignette, small cream downward arrow on the right.
Row 4: “公共档案馆”, small secondary “步行入口”. A complete cream and brick-red pedestrian wayfinding sign, dark red Chinese lettering, archival folio crest, small dark red downward arrow on the right. Keep all text exact; these signs mark entrances.

## 07 · streets

Row 1: “运河路”, small secondary “YUNHE LU”. A complete cobalt-blue enamel street-name plate, large white Chinese lettering, small bridge-and-wave crest, clean rounded white inset border. White direction arrows at both short ends.
Row 2: “银杏街”, small secondary “YINXING JIE”. A complete dark green enamel street-name plate, large cream Chinese lettering, small ochre ginkgo-leaf crest, double-line cream border. Small cream arrows at both ends.
Row 3: “档案馆路”, small secondary “DANGANGUAN LU”. A complete deep brick-red heritage street-name plate, large ivory Chinese lettering, small folio crest, thin cream border and squared corners. Ivory arrows at both ends.
Row 4: “环城路”, small secondary “HUANCHENG LU”. A complete white street-name plate, large blue Chinese lettering, a broad blue top band and blue end caps, a simple blue circular road emblem. Blue direction arrows at both ends.

## 08 · facilities

Row 1: “城市公交”, small secondary “11 路”. A complete dark teal and cream bus-stop header sign. Large clear cream Chinese lettering, an original front-facing bus roundel, a cream route-number box at the right. Realistic early-2000s bus system design.
Row 2: “公共停车场”, small secondary “PARKING”. A complete blue and white car-park sign. Large white Chinese lettering, a prominent white “P” in a blue-and-white square on the left, a small amber bottom stripe.
Row 3: “滨河步道”, small secondary “RIVERSIDE WALK”. A complete warm cream and teal pedestrian park sign. Dark teal Chinese lettering, an original brick-red arched bridge and blue wave illustration, fine teal inset border.
Row 4: “上层暂停开放”, small secondary “NO ACCESS”. A complete clean ivory notice plate. Black legible Chinese lettering, a small amber-and-black bar at the left edge, a restrained amber bottom rule, understated institutional early-2000s style. This notice must say exactly 上层暂停开放.

## 技术处理

已保存八张原始透明 PNG：`sources/shops.png`、`commerce.png`、`addresses.png`、`industry.png`、`civic.png`、`destinations.png`、`streets.png`、`facilities.png`（后七项同位于 `sources/`）。每张包含四块完整牌面，共 32 块。生成方式为内置 `image_gen` 文生图、`transparent_background: true`；原始工具输出路径、对应文字、32 个稳定 ID 记录于 [source-manifest.json](source-manifest.json)。早期独立标志方案已由本方案替代，不参与运行时加载。

运行 `node scripts/prepare-l11-signage.mjs` 可从原图重建图集。脚本根据 alpha 行密度找到四行牌面并裁去外围透明留白，不重绘文字或图案；缩放后为每块牌面扩展 8 像素边缘及角落，避免 mipmap 串色。四列八行输出为 `public/textures/l11_signs.png`（4096×2048）与 `l11_signs_low.png`（2048×1024）。裁切边界、原图尺寸与 UV 记录于 [atlas-manifest.json](atlas-manifest.json)，注册数据位于 `src/game/content/l11SignAtlas.json`。原始 PNG 保持不变。

同时导出匹配尺寸的 OpenGL 中性法线 `(128,128,255)` 和均匀粗糙度 `185/255` 图，供素材复用。运行时直接用平整几何法线和相同粗糙度参数，避免为常量通道额外占用 GPU 纹理；牌面不叠加噪点。牌壳使用已登记的 CC0 金属材质，牌面采用共享图集材质并进入现有合批。

## 验收记录 · 2026-10-13

八张原图和拼合图集均逐张检查：完整底板、边框、中英文字和图案齐全，文本与上面的提示词一致；蓝白搪瓷路牌、奶油色与红字店招、深青咖啡店、机关铭牌及公交系统具有不同排版。保留印刷实色，不加入颗粒、随机斑点或仿旧噪声。

在 1920×1080 的真实游戏中，以固定种子与机位检查面包房、咖啡店、超市、档案馆、路牌两面和公交站。第一轮发现路牌立杆遮挡文字、档案馆立柱遮住牌面边角，分别通过 10 厘米厚的双面牌壳覆盖立杆、将公共建筑牌安装高度提高至 3.45 米修正；修正后复查通过。普通店招仍保持雨棚入口净高。

真实光照、经典光照和低画质的最终检查均通过，报告和 `*-sign-*.jpg` 截图位于 `reports/l11-remake/`。32 个 ID、图集 UV、材质、正反面几何与资源释放通过 `npm run check:l11-meshes`。五次高低纹理切换均选中正确尺寸，反复切回原档没有累积 GPU 纹理；具体计数及完整城市的性能限制见 [L11-REMAKE.md](../../L11-REMAKE.md)。

