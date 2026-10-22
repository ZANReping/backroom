# Backroom / 后室

这是一个以 Three.js 制作的第一人称生存游戏项目。

## 目录

| 目录 | 说明 |
| --- | --- |
| `app` | 原始版本 |
| `app-lite` | Bilibili Toy Lite 版本 |
| `migration` | 归档的迁移材料 |
| `info.md` | 详细项目文档 |

## 运行原始版本

```bash
cd app
npm ci
npm run dev
```

构建：

```bash
npm run build
```

## 运行 Bilibili Toy Lite

```bash
cd app-lite
npm ci
npm run dev
```

构建：

```bash
npm run build
```

更多说明请参阅 [`app-lite/README-LITE.md`](app-lite/README-LITE.md) 和 [`app-lite/MULTIPLAYER-SETUP.md`](app-lite/MULTIPLAYER-SETUP.md)。

项目会保留源代码、资源、配置文件和锁文件；依赖、缓存及构建输出可在本地重新生成。迁移归档材料也会保留在仓库中。

## Vercel 部署

原版游戏位于 `app`。Vercel 可将 Root Directory 设置为 `app`，输出目录为 `dist`；仓库根目录也提供构建入口与 `app/dist` 输出配置。仓库中的 `vercel.json` 会明确覆盖旧的 `build` 输出设置。使用 Node.js 24.x 并安装开发依赖，构建产物无需提交到 Git。详细配置与排查见 [Vercel 部署说明](app/docs/VERCEL.md)。
