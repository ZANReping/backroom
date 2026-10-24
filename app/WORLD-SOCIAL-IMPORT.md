# 四个更新包导入说明

本次导入目标为原项目 `E:/ZAN/backroom/app`，运行模式暂为单机。四个用户提供包的原始来源、SHA256、暂存位置和改动范围记录在 [provenance.json](reports/four-import-20261023/provenance.json)。附件没有提供代码作者或再分发许可，因此项目不将其视为 CC0；运行时使用程序生成的贴图，不导入网页照片。

## 内容摘要

- **vending-full.zip**：售货机八格 UI、待机骨臂和攻击才激活的行为。
- **faceling-full.zip**：保留普通无面灵与敌意无面灵注册；年龄仅作为外貌与行为属性使用。
- **window-full.zip**：窗口实体覆盖 L2、L4、L601 三种层级，包含生命周期及 X/移动按钮交互。
- **backroom-npc-idle.zip**：NPC 待机动作；NPC 仍保留固定岗位范围和座位约束，避免无序游走。

## 设定出处

实体设定参考中文 Wikidot 页面：

- [Entity 2](https://backrooms-wiki-cn.wikidot.com/entity-2)：作者 DrAkimoto，译者 EnderstrayKPC。
- [Entity 9](https://backrooms-wiki-cn.wikidot.com/entity-9)：原作者 Jo、Higher Being Love Cereal!；重写者 1000dumplings、Nikuchan；译者 Ambersight。
- [Entity 36](https://backrooms-wiki-cn.wikidot.com/entity-36)：作者 Gasaludo，译者 SnowStarMoon。

三项设定按页面标注采用 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。

## 当前项目适配

- 普通机与 Entity 36 复用八格界面、动画与机身，进入界面停止遗留攻击／移动输入，游戏继续运行；磁带机保留磁带额度。出货库存仍按附件的本次运行状态管理，卡货标记和机器种子随区块保存。
- Entity 36 分帧准备骨臂，普通机不创建其隐藏骨架，未拆机时不提前创建暗格内三个人物模型；活化保留已预热的同一模型。
- 三种窗体使用雾兼容的独立景观材质。占据窗可见、手臂按状态伸出；消失时局部隐藏窗框并露出原墙，L4 缺口由同材质实体墙关闭，普通外窗实例合批，L4 沿用小部件免投影并错开两盏静态灯的阴影刷新。
- 几何和材质属于模型实例；程序贴图共享，回收一件不释放另一件的资源。NPC 的缓存坐标随流式窗口平移，固定岗位朝向和移动范围保留。
- 默认按住 X 执行情境动作：窗户旁默念、哭闹幼年无面灵旁安抚；设置可改键，触屏提供对应按住按钮。

## 检查与复现

从 app 目录运行：

```powershell
npm run check:window
npm run check:faceling
npm run check:vending
npm run check:npc-idle
npm run check:four-import
npm run build
npm run verify:four-import -- --label=manual-realistic
npm run verify:four-import -- --classic --label=manual-classic
```

原型入口：proto-window.html、proto-vending.html、proto-faceling.html、proto-npc-idle.html；实际 App 的截图和结果以 [验收报告](reports/four-import-20261023/README.md) 为准。尚未在 Android 真机验收。
