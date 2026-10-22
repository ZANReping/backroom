// proto-thing.html 入口：?anim=… → 阶段 2 动画格子；?mode=seabed → L7 海床材质预览；否则七层之物静态模型
const q = new URLSearchParams(location.search)
if (q.has('anim')) void import('./thingAnimProto')
else if (q.get('mode') === 'seabed') void import('./seabedProto')
else void import('./thingProto')
