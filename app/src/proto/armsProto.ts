// 原型页入口：「手臂」（Entité 15-FR「Les Bras」）重制。
//   ?anim=<片段|loop|attack>&t=<秒>&view=<side|player|under|close|vent2>  → 第 2 阶段动画预览（armsAnimProto.ts）
//   其余（?mode=under|side|hand|curl|grate|burn|burn-under|stretch …）       → 第 1 阶段静态建模视图（armsStaticProto.ts）
if (new URLSearchParams(location.search).has('anim')) void import('./armsAnimProto')
else void import('./armsStaticProto')
export {}
