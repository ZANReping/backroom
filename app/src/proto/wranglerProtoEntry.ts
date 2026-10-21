// proto-wrangler.html 入口：?anim=1 → 第 2 阶段动画预览；否则第 1 阶段静态视图
if (new URLSearchParams(location.search).has('anim')) void import('./wranglerAnimProto')
else void import('./wranglerProto')
export {}
