  // ================= 三层楼板（v54c 解耦重排：上层平面独立于 1F 轮廓） =================
  // 解耦要点：楼板填充不再限于 1F 地板正上方（矩形带内 1F 间墙/虚空格上方一样铺板——
  // 1F 间墙在板下止于板底[wallBaseTopAt v54c]、不再穿过上层地板）；2F/3F 房间各自独立划分。
  for (let i = 0; i < m.w * m.h; i++) if (m.tiles[i] === 1) { m.up[i] = 1; m.up2[i] = 1 }
  for (let y = 18; y <= 44; y++) for (let x = 10; x <= 69; x++) { m.up[idx(x, y)] = 1; m.up2[idx(x, y)] = 1 } // 矩形带铺满（含 1F 间墙/虚空上方）
  // 两部坡道楼梯（stampStairRun；v54c 位址：A 东移 1 格、B 东西向——起点/落点离墙净空）
  stampStairRun(m, 58, 36, 1, 5) // A：井廊（住宅部侧）内 +x 向爬 5 格（0→3.0），落 2F (63,36)
  stampStairRun(m, 65, 11, 1, 5, FLOOR_H) // B：楼梯间B 内 +x 向爬 5 格（3.0→6.0），落 3F (70,11)
  // 跌井（v46 规则：坡道下段邻格不得有上一层楼板——否则从上层直踩下段会跌落）
  for (const [wx, wy] of [[58, 35], [59, 35], [58, 37], [59, 37]] as const) m.up[idx(wx, wy)] = 0 // A 井（2F 开口）
  for (let y = 35; y <= 37; y++) for (let x = 58; x <= 62; x++) m.up2[idx(x, y)] = 0 // A 井贯通 3F（通高楼梯井）
  for (const [wx, wy] of [[65, 10], [66, 10], [65, 12], [66, 12]] as const) m.up2[idx(wx, wy)] = 0 // B 井（3F 开口）
  // 楼梯间挑高（ceiling=1：井道通到屋面 8.6——三层时挑高顶=2×FLOOR_H+2.6）
  for (let y = 33; y <= 39; y++) for (let x = 57; x <= 64; x++) m.ceiling[idx(x, y)] = 1
  for (let y = 10; y <= 16; y++) for (let x = 63; x <= 72; x++) m.ceiling[idx(x, y)] = 1
  // v54c 挑空中庭：前厅内腔（x34..45 y9..14）上方 2F 楼板取消——1F 前厅双层挑高到 3F 板底；
  // 3F 屋面板墙（upWall2）封顶：3F 板/板墙独立于 2F 存在（解耦实证：up2/upWall2 不依赖 up）
  for (let y = 9; y <= 14; y++) for (let x = 34; x <= 45; x++) { m.up[idx(x, y)] = 0; m.upWall2[idx(x, y)] = 1 }
  for (const [ax, ay] of [[36, 16], [36, 17]] as const) { m.up[idx(ax, ay)] = 0; m.upWall2[idx(ax, ay)] = 1 } // 凹龛上方同处理（中庭延伸到窗前）

  // ---- 2F/3F 墙体（各自独立划分：同网格不同功能；门洞对齐走廊） ----
  // 共用墙线：北外墙 y18 / 分带墙 y21·y25·y30·y33 / 南外墙 y44 / 东西外墙 x10·x69
  const wallRow = (a: Uint8Array, y: number, x0: number, x1: number, gaps: number[]) => {
    for (let x = x0; x <= x1; x++) if (!gaps.includes(x)) a[idx(x, y)] = 1
  }
  const wallCol = (a: Uint8Array, x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) a[idx(x, y)] = 1
  }
  for (const W of [m.upWall, m.upWall2]) { // 2F/3F 同网格墙线（各层独立划分，同格不同用）
    wallRow(W, 18, 10, 69, []); wallRow(W, 44, 10, 69, [])
    wallCol(W, 10, 18, 44); wallCol(W, 69, 18, 44)
    wallRow(W, 21, 10, 69, [17, 40, 59]) // 北带/中带间墙（门 ×3）
    wallRow(W, 25, 10, 69, [17, 40, 59])
    wallRow(W, 30, 10, 69, [20, 45, 60]) // 中带/南走廊间墙
    wallRow(W, 33, 10, 69, [17, 37, 52, 62]) // 南走廊/南带间墙（门 ×4）
    wallCol(W, 32, 19, 20); wallCol(W, 47, 19, 20) // 北带隔断
    wallCol(W, 32, 26, 29); wallCol(W, 47, 26, 29) // 中带隔断
    wallCol(W, 25, 34, 43); wallCol(W, 41, 34, 43); wallCol(W, 55, 34, 43) // 南带隔断
  }
  // 3F 墙线与 2F 同网格（上方循环一次写两层）；中庭屋面板墙已在上面设置

  // ---- 2F 住宅部家具（SU=floor=1） ----
  // 宿舍A（x11..31 y19..20，门 (17,21)）
  SU('bunkbed', 12, 19, 1, 2); SU('bunkbed', 15, 19, 1, 2); SU('bunkbed', 19, 19, 1, 2); SU('bunkbed', 24, 19, 1, 2); SU('bunkbed', 28, 19, 1, 2)
  SU('libshelf', 30, 19)
  // 观景廊（x33..46 y19..20，门 (40,21)；北缘=中庭护墙，南望大厅）
  SU('bench', 35, 19); SU('bench', 44, 19); SU('trashbin', 34, 20)
  // 宿舍B（x48..69 y19..20，门 (59,21)）
  SU('bunkbed', 49, 19, 1, 2); SU('bunkbed', 52, 19, 1, 2); SU('bunkbed', 55, 19, 1, 2); SU('bunkbed', 61, 19, 1, 2); SU('bunkbed', 64, 19, 1, 2)
  SU('desk', 67, 19); SU('officechair', 67, 20, 1, 1, false)
  NPC('mateo', 54, 19, 1) // 住户老兵马特奥（2F 宿舍B）
  // 洗漱间（x11..31 y26..29，门 (17,25)）
  SU('sink', 12, 26); SU('sink', 14, 26); SU('sink', 16, 26)
  SU('binshelf', 28, 26, 2, 1); SU('binshelf', 30, 26, 2, 1) // 晾衣/储物架
  SU('bench', 22, 28)
  // 储物间（x33..46 y26..29，门 (40,25)）
  for (const rx of [35, 37, 39, 41, 43]) SU('binshelf', rx, 26)
  SU('pallet', 36, 28); SU('pallet', 42, 28)
  // 电视娱乐室（x48..69 y26..29，门 (59,25)；v54d 挂墙电视贴南墙[deg 180]+休闲椅面向电视）
  {
    const BOOTHS: { x: number; chair: string }[] = [
      { x: 49, chair: '#b85a62' }, { x: 54, chair: '#6aa87c' }, { x: 59, chair: '#6f8cc9' },
    ]
    for (const b of BOOTHS) {
      SU('walltv', b.x, 29, 1, 1, false, { deg: 180 }) // 挂墙电视（贴南墙、屏朝北——v54c walltv 支持显式朝向）
      SU('loungechair', b.x, 26, 1, 1, false, { deg: 0, color: b.chair })
      SU('loungechair', b.x + 1, 27, 1, 1, false, { deg: 0, color: b.chair })
    }
    for (const [px, pc] of [[51, '#8a4a52'], [52, '#8a4a52'], [56, '#5a8a6a'], [57, '#5a76b8']] as const)
      SU('cubicle', px, 27, 1, 1, true, { deg: 90, color: pc }) // 彩色隔断（deg 固定朝向）
    SU('trashbin', 66, 28)
    SU('megposter', 68, 26, 1, 1, false) // 东墙 MEG 海报
  }
  NPC('meilin', 55, 23, 1) // 后勤官：2F 走廊（娱乐室门口）
  // 休闲区（x11..24 y34..43，门 (17,33)）：沙发围合 ×2 + 茶几
  SU('sofa', 14, 36, 1, 1, true, { deg: 0, color: '#5a76b8' }); SU('sofa', 14, 39, 1, 1, true, { deg: 180, color: '#5a8a6a' })
  SU('sofa', 11, 37, 1, 1, true, { deg: 90, color: '#8a4a52' }); SU('table', 14, 37)
  SU('sofa', 20, 36, 1, 1, true, { deg: 0, color: '#7a7a80' }); SU('sofa', 20, 39, 1, 1, true, { deg: 180, color: '#5a76b8' })
  SU('sofa', 23, 37, 1, 1, true, { deg: 270, color: '#5a8a6a' }); SU('table', 20, 37)
  SU('bench', 14, 42)
  // 阅览角（x26..40 y34..43，门 (37,33)）：书架阵列 + 借阅台
  for (const ry of [35, 38]) for (let rx = 27; rx <= 39; rx += 2) SU('libshelf', rx, ry, 1, 1, true, { row: 1 })
  SU('table', 30, 41, 2, 1); SU('officechair', 30, 42, 1, 1, false)
  SU('megdoc', 32, 41, 1, 1, false, { doc: 'meg_levels' })
  // 储备角（x42..54 y34..43，门 (52,33)）
  for (let rx = 43; rx <= 53; rx += 2) SU('binshelf', rx, 35)
  SU('pallet', 44, 40); SU('pallet', 50, 40)
  // 井廊（x56..68 y34..43，门 (62,33)；A 坡道落梯厅——留空坡道行 y36）
  SU('bench', 66, 34); SU('photo', 68, 34, 1, 1, false)

  // ---- 3F 行政部家具（SU2=floor=2） ----
  // 会议A（x11..31 y19..20，门 (17,21)）
  SU2('table', 13, 19, 4, 1); SU2('officechair', 13, 20, 1, 1, false); SU2('officechair', 15, 20, 1, 1, false); SU2('officechair', 16, 20, 1, 1, false)
  SU2('screenboard', 14, 18, 1, 1, false) // 投影幕（北墙）
  // 主管办公室（x33..46 y19..20，门 (40,21)）
  SU2('desk', 38, 19); SU2('officechair', 38, 20, 1, 1, false)
  SU2('libshelf', 34, 19); SU2('libshelf', 44, 19)
  SU2('megdoc', 42, 19, 1, 1, false, { doc: 'meg_levels' }) // 层级档案
  SU2('photo', 36, 18, 1, 1, false); SU2('megposter', 39, 18, 1, 1, false) // 北墙奖牌/地图
  NPC('harper', 40, 19, 2) // 基地主管：3F 主管办公室
  // 会议B（x48..69 y19..20，门 (59,21)）
  SU2('table', 52, 19, 4, 1); SU2('officechair', 52, 20, 1, 1, false); SU2('officechair', 54, 20, 1, 1, false); SU2('officechair', 55, 20, 1, 1, false)
  SU2('noticeboard', 66, 18, 1, 1, false) // 白板（北墙）
  // 办公室（x11..31 y26..29，门 (17,25)）：开放工位 ×3
  SU2('desk', 12, 26); SU2('desk', 18, 26); SU2('desk', 24, 26)
  SU2('officechair', 12, 27, 1, 1, false); SU2('officechair', 18, 27, 1, 1, false); SU2('officechair', 24, 27, 1, 1, false)
  SU2('copier', 29, 26)
  // 资料室（x33..46 y26..29，门 (40,25)）
  for (const rx of [34, 36, 38, 40, 42, 44]) SU2('libshelf', rx, 26)
  SU2('table', 38, 28, 2, 1); SU2('officechair', 38, 29, 1, 1, false)
  // 机房（x48..69 y26..29，门 (59,25)）
  for (const rx of [49, 51, 53, 55]) SU2('serverrack', rx, 26)
  SU2('switchboard', 57, 26); SU2('switchboard', 59, 26)
  SU2('servercase', 50, 29); SU2('servercase', 53, 29); SU2('servercase', 56, 29) // 塔式机箱沿南墙成排
  NPC('isaac', 55, 28, 2) // 研究员艾萨克（3F 机房）
  // 大档案室（x11..24 y34..43，门 (17,33)）：书架阵列 + 查找台
  for (const ry of [35, 38]) for (let rx = 11; rx <= 23; rx += 2) SU2('libshelf', rx, ry, 1, 1, true, { row: 1 })
  SU2('table', 14, 41, 2, 1); SU2('officechair', 14, 42, 1, 1, false)
  SU2('megdoc', 16, 41, 1, 1, false, { doc: 'meg_levels' })
  NPC('aurora', 16, 37, 2) // 档案员奥萝拉（3F 大档案室）
  // 档案二室（x26..40 y34..43，门 (37,33)）
  for (const ry of [35, 38]) for (let rx = 27; rx <= 39; rx += 2) SU2('libshelf', rx, ry, 1, 1, true, { row: 1 })
  // 样品库（x42..54 y34..43，门 (52,33)）
  for (let rx = 43; rx <= 53; rx += 2) SU2('binshelf', rx, 35)
  SU2('pallet', 44, 40); SU2('pallet', 50, 40)
  // 井廊（x56..68 y34..43，门 (62,33)）
  SU2('bench', 66, 34)
