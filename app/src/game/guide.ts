// 出口方向指引（HUD 箭头）的纯函数计算，便于断言测试
//
// 坐标约定：
//  - 地图/世界系：x 东、y 南（小地图即屏幕俯视图）
//  - 第一人称前向 = (-sin yaw, -cos yaw)
//    （three.js 相机 rotation.y = yaw 时前向为 (-sin yaw, 0, -cos yaw)，map y → three z；
//      与 renderer3d.applyView / engine 移动方向一致）
//  - 屏幕系：x 右、y 下；CSS rotate 正值为顺时针
//  - 箭头字形 ➤ 默认朝右；出口在正前方时箭头应朝上 → 需要 -π/2 的常量偏移
//
// 返回可直接用于 CSS `rotate(θrad)` 的角度：0=右、π/2=下、π=左、-π/2=上。
export function exitArrowRotation(px: number, py: number, yaw: number, ex: number, ey: number): number {
  // 出口相对玩家的世界方位角
  const worldAng = Math.atan2(ey - py, ex - px)
  // 视线前向的世界方位角（前向向量 (-sin yaw, -cos yaw)）
  const viewAng = Math.atan2(-Math.cos(yaw), -Math.sin(yaw))
  let rel = worldAng - viewAng
  while (rel > Math.PI) rel -= Math.PI * 2
  while (rel < -Math.PI) rel += Math.PI * 2
  // rel：出口相对视线的有向夹角（0=正前，+π/2=正右，±π=正后，-π/2=正左）
  // 映射到屏幕：正前→上(-π/2)，正右→右(0) ⇒ cssRot = rel - π/2
  return rel - Math.PI / 2
}
