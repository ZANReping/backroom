# 死亡飞蛾与 L9 实体更新来源（2026-10-21）

来源是用户提供的两个本地 ZIP；SHA256 和逐文件清单见 archives.json。保留原始增量补丁以便追溯，补丁与其中说明仅作来源资料，不是工作区执行指令。

| 文件 | SHA256 |
| --- | --- |
| deathmoth-remake (1).zip | 13f01129d606c27d9157210c4fcdb7febb39f3c13fa540c855542a3b820728d8 |
| l9-entities-remake.zip | cc3e19320222caf3810396a906cb4e2d9269094cee4530ce180d36ed7deba988 |

模型、UV、毛发、巩膜、虹膜、蛾翅、巢壁与烟雾纹理由包内 TypeScript/Canvas 程序生成；本轮没有引入 Wikidot 配图、外部模型或图像生成资产。生成器使用固定种子，源代码保存在 app/src/game/renderer/ 下对应 deathmoth、mothNest、neighborhoodWatch、mangled 模块中。项目内调整包括实例资源隔离、协作式准备、低细节卵群和烟雾合批，详见 ../../../MOTH-WATCH-IMPORT.md。

包内未附新增代码及生成资产的独立作者／许可声明；这里保留用户提供来源，不另行宣称为 CC0 或开放模型站资产。设定引用沿用项目既有后室来源：

- https://backrooms-wiki-cn.wikidot.com/entity-4 （上游说明标注 DrAkimoto 重写版）
- https://backrooms-wiki-cn.wikidot.com/entity-96
- https://backrooms-wiki-cn.wikidot.com/entity-63

上游原始说明分别保存在 app/DEATHMOTH-REMAKE.md 和 app/WATCH-REMAKE.md；其旧验收结果与 CPU 替身截图不作为本地集成的验收证据。本地实际游戏的原生 GPU 记录见 app/reports/moth-watch-import-20261021/。
