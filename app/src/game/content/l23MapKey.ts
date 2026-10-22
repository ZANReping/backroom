export const L23_MAP_KEY={
  2:[
    {id:'tidy',name:'整洁的廊道',color:'#52645c',ink:'#b9d0c5',path:'M2 3H16M2 6H16M2 9H16'},
    {id:'dim',name:'晦暗的廊道',color:'#3b4351',ink:'#aab4c8',path:'M3 2V10M9 2V10M15 2V10'},
    {id:'dirty',name:'肮脏的廊道',color:'#6e5040',ink:'#d2ad91',path:'M2 3l3 2-2 2 4 2M11 2l2 3-2 2 4 3'},
    {id:'warped',name:'扭曲的廊道',color:'#586043',ink:'#c3ca9a',path:'M2 3C5 8 7 2 10 7S14 5 16 10'},
    {id:'narrow',name:'狭窄的廊道',color:'#5b5369',ink:'#c5b8d5',path:'M4 2V10M7 2V10M10 2V10M13 2V10'},
    {id:'office',name:'办公走廊',color:'#48606e',ink:'#a9c8d2',path:'M3 2H15V10H3ZM9 2V10M3 6H15'},
  ],
  3:[
    {id:'lit',name:'照明廊道',color:'#6b5b45',ink:'#dfc69a',path:'M3 3H15M3 6H15M3 9H15'},
    {id:'dark',name:'晦暗廊道',color:'#393e4c',ink:'#aab2c6',path:'M3 2V10M9 2V10M15 2V10'},
    {id:'narrow',name:'狭窄廊道',color:'#5d5169',ink:'#cab9da',path:'M4 2V10M7 2V10M10 2V10M13 2V10'},
    {id:'assembly',name:'装配线',color:'#50675c',ink:'#b7d1c0',path:'M2 3H16M2 6H16M2 9H16M5 2V10M13 2V10'},
    {id:'genhall',name:'发电室',color:'#466372',ink:'#abd0d8',path:'M3 2V10M9 2V10M15 2V10M2 6H16'},
    {id:'boiler',name:'锅炉房',color:'#7a563d',ink:'#e0b48d',path:'M3 9C3 5 5 3 9 3S15 5 15 9M6 9V10M12 9V10'},
    {id:'sanct',name:'圣所',color:'#868375',ink:'#e2dfc4',path:'M3 9V4H15V9M6 4V2H12V4M9 2V10'},
  ],
} as const

export const L23_MAP_MARKS=[
  {id:'wall',name:'墙/柱',color:'#bbb5a3',path:'M2 3H16V9H2Z'},
  {id:'door',name:'门',color:'#7ab9c7',path:'M2 6H5M7 6H10M12 6H16'},
  {id:'grille',name:'栅栏',color:'#71889a',path:'M3 4H7M9 4H13M3 8H7M9 8H13'},
  {id:'crawl',name:'低矮管道',color:'#b29a62',path:'M2 9C2 4 5 3 9 3S16 4 16 9'},
] as const
