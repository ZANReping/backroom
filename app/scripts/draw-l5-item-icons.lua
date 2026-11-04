-- Original 64 px L5 icons. Drawn and exported through Aseprite's native Lua API.
local sourceDir = assert(app.params.sources, "missing sources path")
local outputDir = assert(app.params.output, "missing output path")
local px = app.pixelColor
local colors = {}
local image

local function color(hex)
  if not colors[hex] then
    colors[hex] = px.rgba(tonumber(hex:sub(1,2),16), tonumber(hex:sub(3,4),16), tonumber(hex:sub(5,6),16), #hex == 8 and tonumber(hex:sub(7,8),16) or 255)
  end
  return colors[hex]
end
local function dot(x,y,c) if x>=0 and y>=0 and x<64 and y<64 then image:drawPixel(x,y,color(c)) end end
local function rect(x,y,w,h,c) for j=y,y+h-1 do for i=x,x+w-1 do dot(i,j,c) end end end
local function line(x,y,x2,y2,c,w)
  local dx,dy=math.abs(x2-x),-math.abs(y2-y)
  local sx,sy=x<x2 and 1 or -1,y<y2 and 1 or -1
  local err=dx+dy
  repeat
    rect(x,y,w or 1,w or 1,c)
    if x==x2 and y==y2 then break end
    local twice=2*err
    if twice>=dy then err=err+dy; x=x+sx end
    if twice<=dx then err=err+dx; y=y+sy end
  until false
end
local function path(c, xy, width)
  for i=1,#xy-2,2 do line(xy[i],xy[i+1],xy[i+2],xy[i+3],c,width) end
end
local function poly(c, p)
  local n=#p
  local x0,y0,x1,y1=63,63,0,0
  for i=1,n,2 do x0=math.min(x0,p[i]); y0=math.min(y0,p[i+1]); x1=math.max(x1,p[i]); y1=math.max(y1,p[i+1]) end
  for y=y0,y1 do for x=x0,x1 do
    local inside=false
    local j=n-1
    for i=1,n,2 do
      local a,b=p[i+1],p[j+1]
      if (a>y)~=(b>y) and x < (p[j]-p[i])*(y-a)/(b-a)+p[i] then inside=not inside end
      j=i
    end
    if inside then dot(x,y,c) end
  end end
end
local function oval(x,y,rx,ry,c)
  for j=y-ry,y+ry do for i=x-rx,x+rx do
    if ((i-x)/rx)^2+((j-y)/ry)^2<=1 then dot(i,j,c) end
  end end
end
local function arc(cx,cy,rx,ry,from,to,c)
  local prevX,prevY
  for i=from,to,5 do
    local a=math.rad(i)
    local x=math.floor(cx+rx*math.cos(a)+.5)
    local y=math.floor(cy+ry*math.sin(a)+.5)
    if prevX then line(prevX,prevY,x,y,c) end
    prevX,prevY=x,y
  end
end
local function grain(x,y,w,h,light,dark,seed)
  for j=y,y+h-1 do for i=x,x+w-1 do
    local k=(i*173+j*293+i*j*43+seed*37)%103
    if k<4 then dot(i,j,light) elseif k>99 then dot(i,j,dark) end
  end end
end
local function shadow(x,y,rx,ry)
  oval(x,y,rx,ry,'110f1840'); oval(x,y,math.floor(rx*.7),math.max(1,ry-1),'15101b60')
end

local font={
  ['0']={'111','101','101','101','111'}, ['1']={'010','110','010','010','111'},
  ['2']={'111','001','111','100','111'}, ['3']={'111','001','111','001','111'},
  ['4']={'101','101','111','001','001'}, ['5']={'111','100','111','001','111'},
  ['6']={'111','100','111','101','111'}, ['7']={'111','001','010','010','010'},
  ['8']={'111','101','111','101','111'}, ['9']={'111','101','111','001','111'},
  A={'010','101','111','101','101'}, B={'110','101','110','101','110'},
  H={'101','101','111','101','101'}, L={'100','100','100','100','111'},
  M={'101','111','111','101','101'}, E={'111','100','110','100','111'},
  G={'111','100','101','101','111'}, V={'101','101','101','101','010'},
  I={'111','010','010','010','111'}, P={'110','101','110','100','100'},
}
local function stamp(str,x,y,c,scale)
  scale=scale or 1
  for glyph in str:gmatch('.') do
    if font[glyph] then for j,row in ipairs(font[glyph]) do for i=1,3 do
      if row:sub(i,i)=='1' then rect(x+(i-1)*scale,y+(j-1)*scale,scale,scale,c) end
    end end end
    x=x+4*scale
  end
end
local function paper(x,y,w,h,theme)
  local ink,edge,shade,face,glow=table.unpack(theme)
  poly(ink,{x+2,y,x+w-5,y,x+w,y+5,x+w,y+h-2,x+w-2,y+h,x,y+h,x,y+3})
  rect(x+2,y+2,w-5,h-4,face)
  rect(x+2,y+h-5,w-4,3,shade); rect(x+w-4,y+7,2,h-11,edge)
  path(glow,{x+3,y+h-6,x+3,y+3,x+w-6,y+3})
  poly(shade,{x+w-8,y+2,x+w-3,y+7,x+w-8,y+7})
  grain(x+4,y+5,w-10,h-11,glow,shade,x+y)
end
local parchment={'372532','977759','b5966c','e4cb98','fff0c5'}
local silver={'272737','6b6878','878c96','c9c9c5','f3eedb'}

local art={}
function art.mahjongtile()
  shadow(32,55,23,4)
  poly('302c31',{11,16,39,6,54,15,54,46,42,55,12,57,8,49,8,24})
  poly('28504c',{9,29,39,22,53,17,53,45,41,53,13,55,9,49})
  poly('468278',{10,34,39,26,40,51,13,54,10,49})
  path('75a69a',{13,52,37,49,40,47})
  poly('ac9170',{9,19,39,8,53,16,43,43,13,49,8,41})
  poly('f2dfab',{11,19,39,10,50,16,41,40,14,46,10,40})
  path('fff1cb',{10,32,12,20,39,11,48,16})
  path('48664d',{17,32,23,33,30,32,37,28,43,23},2)
  path('7b9b63',{23,33,22,38}); path('7b9b63',{29,33,29,38}); path('7b9b63',{36,30,38,34})
  grain(15,21,24,17,'fff1cb','d8bc8a',7)
end
function art.key437()
  shadow(35,50,22,4)
  path('3a2530',{27,23,19,28,11,26,8,19,11,12,19,9,26,12,30,19},3)
  path('c99a54',{26,23,19,27,12,25,9,19,12,13,19,10,25,13,28,19},2)
  oval(34,26,17,12,'292634'); oval(33,24,16,11,'747681')
  oval(33,23,15,10,'c3c6c6'); arc(33,23,13,8,185,320,'fff2d2')
  oval(20,21,3,3,'47404a')
  stamp('437',27,21,'2a4b72')
  poly('462d32',{25,30,30,28,58,44,56,51,51,51,46,48,44,52,39,49,40,45,31,41,28,44,23,41})
  poly('a9773d',{26,32,29,30,55,45,54,48,50,48,46,45,42,48,40,47,41,44,30,38,27,41,25,39})
  path('e6b96c',{28,33,40,39,54,46},2); line(32,36,46,45,'7e5434')
end
function art.bagTag()
  shadow(33,54,18,3)
  path('4b2935',{27,18,19,11,19,7,25,5,34,10,41,12,45,7,41,4,35,6,28,16},4)
  path('ba5148',{27,16,20,10,21,7,26,7,35,12,42,13,46,8},2)
  poly('3f2630',{19,20,27,14,39,16,46,23,44,48,36,56,19,52,15,46,16,26})
  poly('a1723b',{20,22,28,16,39,18,44,24,42,48,35,53,20,50,17,46,18,27})
  poly('cf9d51',{20,24,28,18,37,19,42,25,40,46,34,50,20,47})
  path('f2ca80',{19,42,21,24,28,19,36,20}); path('855433',{40,26,40,45,34,50,25,48})
  oval(29,20,3,2,'51353c'); stamp('07',25,34,'6b3f31'); line(23,41,35,42,'f0c071')
  grain(20,25,19,20,'e6b66a','a9763e',14)
end
function art.roomtea()
  shadow(32,52,24,4)
  oval(29,47,23,8,'342733'); oval(29,46,22,7,'967049'); oval(29,44,20,6,'ded1b2')
  arc(29,44,18,5,5,355,'aa8751')
  oval(48,32,10,9,'473032'); oval(49,30,9,8,'d1b48b')
  oval(49,31,5,5,'00000000'); arc(49,30,7,6,220,375,'fff0cb')
  poly('382b34',{10,25,45,24,48,29,44,41,39,47,19,47,13,41,9,31})
  poly('c9b994',{11,27,45,26,45,32,42,41,37,45,20,45,15,40})
  poly('eee3c4',{14,31,34,32,31,43,21,44,16,39})
  oval(28,26,18,7,'f8edce'); oval(28,26,15,5,'925035'); oval(28,27,13,3,'ad6039')
  arc(28,26,17,6,15,355,'c39342'); path('db985a',{17,26,22,24,28,24})
  path('d4c4a98f',{26,18,23,14,24,10,29,7}); path('c4b79c75',{33,17,31,13,33,10})
end
function art.gentletter()
  shadow(32,51,23,4)
  poly('412c37',{8,18,54,12,59,17,59,44,55,48,11,54,5,50,5,23})
  poly('aa8c69',{8,19,54,14,57,17,56,43,53,47,11,52,7,48})
  poly('d6ba8a',{9,21,54,15,56,19,54,44,10,50,8,46})
  path('9c775a',{9,45,24,31,40,29,54,40},2)
  poly('efdbac',{9,20,54,15,39,34,33,39,29,39})
  path('fff0cd',{10,21,52,16})
  oval(33,37,7,6,'542a3b'); oval(32,35,6,5,'8c3542'); arc(32,35,5,4,200,320,'c35a55')
  oval(32,36,2,2,'652638'); dot(30,33,'552636'); dot(32,32,'552636'); dot(34,33,'552636')
  grain(11,23,13,7,'f9e8bd','c0a079',3)
end
function art.spokesposter()
  shadow(31,57,21,3)
  paper(12,5,40,51,parchment)
  rect(17,10,30,39,'a74a41'); rect(18,11,28,36,'bd5b4f')
  rect(21,20,22,22,'693d47'); poly('eea56f',{22,25,25,20,39,20,43,25,43,41,22,41})
  rect(25,24,15,17,'658b82'); rect(31,24,2,16,'f6ce8d'); rect(38,25,1,16,'ebbd86')
  oval(29,27,2,7,'f9e0b2'); oval(35,27,2,7,'f9e0b2'); oval(32,33,6,6,'f4daa9')
  oval(32,40,7,4,'ead4b0'); poly('72454d',{27,36,32,38,37,36,37,40,32,39,27,41})
  dot(29,32,'653b44'); dot(35,32,'653b44')
  stamp('H',27,13,'ffe1a0'); stamp('L',33,13,'ffe1a0')
  line(22,45,42,45,'f4b875'); line(24,51,38,51,'a07a5d')
  for _,p in ipairs({{18,16},{43,18},{19,28},{45,31},{19,39},{44,43}}) do dot(p[1],p[2],'ffe6a7') end
end
function art.spokesphoto()
  shadow(33,55,21,3)
  paper(13,5,38,50,silver)
  rect(18,10,27,34,'504549'); rect(19,11,25,31,'8f8178'); rect(20,12,23,9,'9d9181')
  poly('4d3d3c',{20,40,22,34,28,30,36,31,42,36,44,42,20,42})
  poly('ad8f6d',{23,41,25,35,29,34,32,39,36,33,40,36,41,42,22,42})
  oval(32,23,7,9,'654c3f'); oval(32,24,5,7,'c49b7c'); poly('654c3f',{26,22,27,17,31,14,36,16,39,20,37,25,34,19,29,20})
  line(29,24,30,24,'664e45'); line(34,24,35,24,'664e45'); line(31,28,34,28,'8f6757')
  line(22,48,29,47,'6b6975'); line(29,47,33,49,'6b6975'); line(34,48,42,47,'77737c')
end
function art.detbadge()
  shadow(32,51,25,4)
  poly('211d2b',{5,17,27,13,33,17,54,13,59,17,59,44,35,50,31,47,9,50,5,47})
  poly('4b3c46',{7,19,27,15,33,19,55,16,57,18,57,42,35,48,31,45,9,47,7,45})
  poly('2f2938',{9,20,26,17,31,20,30,42,9,45}); poly('37303d',{35,21,55,18,55,42,35,45})
  path('73616a',{8,42,8,20,24,17}); path('685660',{35,22,53,18,55,19})
  poly('d3b06c',{12,27,18,25,18,20,21,24,26,23,25,28,29,31,25,33,23,39,18,36,13,39,15,33,11,30})
  oval(20,30,4,4,'75523c'); oval(19,29,3,3,'f0ca7d')
  poly('d7c39a',{35,24,53,21,53,38,35,41}); rect(37,26,7,10,'877a70')
  oval(40,29,2,3,'c7a384'); rect(38,32,5,3,'65555d'); rect(45,25,6,1,'89745f'); rect(45,28,5,1,'89745f'); rect(46,31,4,1,'89745f')
  stamp('A',46,33,'7a4e4d')
end
function art.windupgear()
  shadow(30,53,24,4)
  oval(37,34,17,15,'382b33'); oval(37,33,16,14,'a17846')
  arc(37,33,13,11,15,350,'dbc087'); arc(37,33,10,8,15,350,'4c3e41'); arc(37,33,7,5,10,350,'e8bc70')
  oval(23,39,12,12,'5a3b34')
  for i=0,7 do
    local a=i*math.pi/4
    local x=math.floor(23+12*math.cos(a))-2
    local y=math.floor(39+12*math.sin(a))-2
    rect(x,y,5,5,'654737'); rect(x,y,3,2,'c69a57')
  end
  oval(22,38,11,11,'c58d4e'); arc(22,38,9,9,180,330,'f6cc7c'); oval(22,38,5,5,'533b3c'); oval(22,37,3,3,'ad7245')
  path('402c36',{33,33,37,23,45,15},5); path('d9ad63',{34,32,38,23,45,15},3)
  oval(45,11,7,6,'704637'); oval(52,19,6,6,'704637')
  oval(44,10,5,4,'dda85d'); oval(51,18,4,4,'d19d54')
  oval(44,10,2,2,'8e5e41'); oval(51,18,2,2,'8e5e41')
end
function art.chefpot()
  shadow(26,51,21,4)
  path('201e2c',{41,33,48,28,57,16},7); path('6c6873',{43,33,49,27,57,17},4)
  path('aaa4a1',{46,30,51,25,58,16}); rect(54,18,4,2,'b88765')
  poly('282632',{7,29,44,29,47,35,44,46,38,50,16,50,9,44})
  poly('46444e',{9,33,44,32,43,44,37,48,16,48,11,43})
  poly('6d6569',{11,36,20,38,24,46,16,45,13,42})
  oval(26,30,21,8,'292733'); oval(26,28,20,7,'a9a0a0'); oval(26,28,17,5,'4c4449')
  oval(26,29,14,3,'66514c'); arc(26,28,19,6,20,185,'80757b'); arc(26,28,19,6,200,335,'d6c3b5')
  grain(13,38,27,6,'8c7573','2e2935',10); dot(42,35,'b9a59b')
end
function art.megcamera()
  shadow(32,51,25,4)
  poly('231f2b',{6,22,20,16,24,10,40,10,45,16,55,17,59,23,59,43,54,48,10,50,5,45})
  poly('777c80',{8,22,22,17,25,12,39,12,44,18,55,19,56,23,13,29})
  poly('3d414e',{8,25,54,22,56,26,56,43,52,46,10,47,8,43})
  rect(10,29,16,14,'54515a'); grain(11,30,13,12,'6d6062','3b3544',2)
  oval(36,34,15,14,'272636'); oval(36,33,14,13,'777b84'); oval(36,33,11,10,'38364a')
  oval(35,32,8,8,'426073'); oval(36,32,5,5,'211f37')
  arc(36,33,12,11,195,315,'cdc6b9'); path('88b3ac',{29,32,30,28,34,26}); dot(32,29,'c2e1c6')
  rect(48,24,6,4,'c9b99b'); rect(49,24,4,2,'f3db99')
  poly('d8c3a2',{24,16,39,14,40,19,26,21}); stamp('800',26,15,'5b5050')
  line(12,45,21,44,'9f8c7e')
end
function art.megmic()
  shadow(32,54,16,3)
  path('3f3543',{31,35,36,45,40,50,48,50,51,46,48,42},3)
  path('7f7175',{32,35,38,46,42,49,48,48,49,45})
  poly('211f2d',{19,12,26,8,39,9,45,16,45,37,40,43,24,44,18,38})
  poly('524d58',{21,14,27,10,38,11,43,17,42,36,39,40,25,41,20,37})
  rect(24,14,15,12,'322f40')
  for y=15,24,2 do line(25,y,37,y,'89828b') end
  path('a39a96',{22,34,22,16,26,12,36,12})
  path('251f2e',{37,12,34,18,37,23,32,28,35,32},2)
  path('867478',{37,13,35,18,38,23,33,29})
  rect(24,30,11,6,'beb39b'); stamp('17',25,30,'494450'); rect(40,27,3,7,'8b5452')
end
function art.megform()
  shadow(32,57,22,3)
  paper(11,5,43,51,silver)
  rect(17,11,27,7,'5b675c'); stamp('MEG',19,12,'e8dbaf')
  rect(17,21,31,10,'aaa298'); rect(18,22,29,8,'dcd4bc')
  stamp('800',33,23,'615866'); line(20,25,28,25,'756d72'); line(20,27,26,27,'756d72')
  for y=34,47,4 do line(18,y,45,y,'a8a095') end
  path('625564',{18,36,24,34,28,37,31,35,35,39,37,37,41,44,48,47})
  path('f4e8ce',{15,49,15,9,29,8})
end
function art.habanero()
  shadow(32,55,15,4)
  poly('442738',{23,9,40,9,41,21,46,29,45,49,41,55,22,55,18,51,18,30,23,22})
  poly('b34d36',{25,13,38,12,39,23,44,30,43,48,40,52,23,52,20,48,20,30,25,22})
  poly('ef8846',{25,23,28,19,35,19,37,24,38,50,24,51,21,46,22,30})
  path('ffc080',{24,43,23,31,26,25,28,20},2)
  poly('ded0a8',{19,33,43,31,43,44,20,46})
  path('976a52',{20,36,42,34}); path('a77b55',{21,43,42,41})
  poly('ad4c3c',{27,39,32,36,37,36,35,40,30,43,26,43}); dot(36,35,'6a7450')
  rect(23,9,17,10,'e3d2ab'); rect(24,9,15,3,'af9064')
  for y=13,16,2 do line(25,y,38,y,'8b765d') end
  dot(28,15,'46404a'); dot(35,13,'46404a')
end
function art.chefphoto()
  shadow(31,56,22,4)
  paper(10,6,44,50,silver)
  rect(15,11,33,33,'5b4d49'); rect(16,12,31,31,'a38867')
  rect(17,13,29,15,'867665')
  line(18,17,46,17,'b4a083'); line(18,26,46,26,'b4a083')
  oval(23,34,7,4,'635450'); rect(17,34,13,5,'655650')
  poly('9e8b72',{28,42,28,35,34,30,42,31,47,35,47,42})
  oval(37,29,6,7,'534146'); oval(37,22,7,5,'d9c6a3'); rect(31,22,12,5,'c4af8f')
  line(34,20,34,25,'ad967c'); line(39,20,39,25,'b7a181')
  line(18,48,39,49,'a28a79'); path('6c5963',{27,49,29,47,32,50,36,48,39,50})
end
function art.roomcard()
  shadow(32,48,25,4)
  poly('3b2934',{7,18,49,11,56,15,59,36,55,41,12,51,6,46,4,25})
  poly('8f6c49',{8,20,49,13,54,16,56,35,53,39,12,48,8,44,6,25})
  poly('e0be77',{9,21,48,15,53,17,54,35,51,37,13,46,9,42})
  path('ffe2a3',{9,35,9,23,49,16,52,18})
  poly('345758',{11,25,50,19,52,27,13,34})
  path('78a69a',{13,26,48,20})
  stamp('5',15,26,'efe0a9'); stamp('437',32,32,'69483d')
  path('a98651',{14,41,21,39,28,39})
end
function art.fatedie()
  shadow(32,55,21,4)
  poly('39323b',{11,22,31,10,53,20,55,43,33,56,12,47})
  poly('f3e6c9',{13,22,31,12,51,21,33,32})
  poly('cfbdac',{13,24,32,34,32,53,14,46})
  poly('b8a3a0',{34,34,51,23,53,42,34,53})
  path('fff6dc',{15,22,30,14,47,21}); path('e3d4be',{15,25,30,33,32,34,47,25})
  line(15,29,16,43,'e0cdb7'); path('8c7f85',{34,51,51,41,50,31})
end
function art.brokendie()
  art.fatedie()
  poly('635560',{33,13,42,17,37,22,41,26,35,32,39,35,34,40,36,47,32,54,31,43,28,38,33,33,30,28,34,23,32,19})
  path('fff1db',{33,15,37,18,34,22,36,25,32,28,36,32,32,38,33,41,32,48})
  path('8b7580',{39,35,45,33,48,29})
  poly('c7b1a7',{49,49,54,47,55,51,52,55,47,55})
  path('eee2c8',{48,53,49,50,53,49})
end
function art.diereceipt()
  shadow(32,56,19,3)
  poly('5a4145',{13,7,44,6,50,10,49,52,45,54,41,52,37,56,33,54,29,57,25,55,20,57,15,53,12,54})
  poly('e6cda4',{15,9,43,8,48,11,47,51,43,50,39,53,35,51,31,54,26,52,22,54,17,51,15,52})
  rect(16,11,29,4,'d3ae7f'); stamp('VIP',20,11,'714a49')
  poly('82665c',{23,22,30,18,38,22,38,31,30,35,23,31})
  poly('f4e2bc',{24,22,30,19,37,22,30,26}); poly('bc9a75',{31,27,37,24,37,30,31,33})
  for i=0,3 do line(19,38+i*3,43-i%2*5,38+i*3,'9c7e6e') end
  line(19,50,28,50,'ca7965')
end
function art.brokenrecord()
  shadow(31,52,23,4)
  oval(30,31,24,21,'28232f')
  oval(29,29,22,19,'403846')
  for i=0,4 do
    arc(29,29,20-i*3,17-i*2,10,170,i%2==0 and '5b4d5c' or '2d293a')
    arc(29,29,20-i*3,17-i*2,190,340,i%2==0 and '726172' or '2c2837')
  end
  oval(29,29,9,8,'a6574c'); oval(29,29,7,6,'c07f62')
  path('d4a282',{24,28,29,26,33,27}); oval(29,29,2,2,'382c37')
  poly('00000000',{39,9,63,7,63,43,52,45,47,41,50,34,39,32,40,28,35,22,39,17})
  path('87727a',{39,12,39,17,35,22,40,28,39,32,50,34,47,41,50,44})
  path('bd978e',{18,39,24,42,31,43})
end
function art.silencejuice()
  shadow(32,57,15,3)
  poly('3c3245',{23,8,41,8,42,20,46,26,47,50,43,56,21,56,17,52,17,27,22,20})
  poly('6e8e89',{24,13,39,13,39,20,44,27,45,50,42,53,22,53,19,50,19,28,24,20})
  poly('aed0bc',{25,20,35,19,36,23,41,29,41,49,24,51,21,48,21,30,25,24})
  poly('c9ded1',{23,32,29,31,29,49,24,49,22,46})
  line(22,29,24,25,'ecedcf'); line(42,42,42,49,'abc1ae')
  rect(22,8,19,8,'9b7545'); rect(24,8,15,2,'f1ce87'); rect(25,12,12,2,'c69b59')
  poly('b38c50',{21,33,44,32,44,43,21,44}); path('f5d38b',{22,34,43,33}); stamp('VIP',26,36,'645344')
  dot(23,25,'fff1d1'); dot(29,30,'e5edcf')
end
function art.mysteryegg()
  shadow(32,56,19,4)
  poly('423344',{24,9,34,6,41,10,47,21,51,36,50,45,45,52,37,55,24,55,16,50,12,43,13,31,18,17})
  poly('99818c',{24,11,33,8,40,12,45,22,49,36,48,45,43,51,36,53,25,53,18,49,14,42,15,31,19,19})
  poly('c6aa9d',{24,12,33,10,40,14,44,25,46,37,43,46,35,51,25,50,19,45,16,37,19,24})
  poly('e5ceb3',{24,13,31,11,35,14,37,21,37,29,34,39,29,45,22,44,18,38,20,25})
  poly('f4dec0',{25,16,30,14,33,17,33,25,29,31,24,32,22,29,22,23})
  path('ab8d92',{36,50,43,46,46,38})
  for _,p in ipairs({{23,21},{28,18},{21,34},{25,40},{32,26},{37,24},{39,32},{43,40},{32,44},{27,48},{34,49},{18,39},{30,35},{41,26}}) do
    dot(p[1],p[2],'9d7b86'); dot(p[1]+1,p[2]+1,'f0cdb1')
  end
end

local function save(img,file,name)
  local sprite=Sprite(img.width,img.height,ColorMode.RGB)
  local layer=sprite.layers[1]
  layer.name=name
  local existing=sprite.cels[1]
  if existing then sprite:deleteCel(existing) end
  sprite:newCel(layer,1,img,Point(0,0))
  sprite:saveAs(file)
  sprite:close()
end
local names={}
for id in pairs(art) do table.insert(names,id) end
table.sort(names)
for _,id in ipairs(names) do
  image=Image(64,64,ColorMode.RGB)
  art[id]()
  local stem="item_"..id
  save(image,app.fs.joinPath(sourceDir,stem..".aseprite"),"Pixel art")
  local png=Image(128,128,ColorMode.RGB)
  for y=0,63 do for x=0,63 do
    local c=image:getPixel(x,y)
    if px.rgbaA(c)>0 then
      png:drawPixel(x*2,y*2,c); png:drawPixel(x*2+1,y*2,c)
      png:drawPixel(x*2,y*2+1,c); png:drawPixel(x*2+1,y*2+1,c)
    end
  end end
  save(png,app.fs.joinPath(outputDir,stem..".png"),"PNG 2x")
end
print("Aseprite drew and exported "..#names.." L5 icons")
