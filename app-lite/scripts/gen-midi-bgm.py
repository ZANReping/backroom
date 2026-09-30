#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成每层 + 每个团体的 MIDI BGM（标准 MIDI 文件 SMF1）到 public/music/。
纯标准库，无第三方依赖。运行：python scripts/gen-midi-bgm.py

时间单位：beat = 四分音符；division = 480 ticks/拍。
每首歌：多轨（低音 / 和声 pad / 旋律 / 打击乐），音色按 GM 音色号，
浏览器端 MIDI 播放器（core/midi.ts）把 GM 音色映射到 WebAudio 合成音色。
"""
import os
import struct

# ---- 音名 -> MIDI 音高（60 = C4）----
PITCH = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
import re
def M(name: str) -> int:
    m = re.match(r'^([A-G])([#b]?)(-?\d)$', name)
    if not m:
        raise ValueError(f'bad note {name}')
    base = PITCH[m.group(1)]
    acc = {'#': 1, 'b': -1}.get(m.group(2), 0)
    octave = int(m.group(3))
    return 12 * (octave + 1) + base + acc

DIV = 480  # ticks per quarter

def vlq(n: int) -> bytes:
    buf = [n & 0x7F]
    n >>= 7
    while n:
        buf.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(buf))

def _be16(n): return struct.pack('>H', n)
def _be32(n): return struct.pack('>I', n)

def make_midi(tracks, bpm, time_sig=(4, 4), name=''):
    """tracks: list of (program:int|None, channel:int, notes:[(pitch,start_beat,dur_beat,vel)])"""
    uspq = int(60000000 / bpm)
    # 指挥轨：tempo + 拍号
    conductor = bytearray()
    conductor += b'\x00\xff\x51\x03' + struct.pack('>I', uspq)[1:]  # tempo
    conductor += b'\x00\xff\x58\x04' + bytes([time_sig[0], 2 if time_sig[1] == 4 else 3, 24, 8])
    conductor += b'\x00\xff\x2f\x00'
    chunks = [b'MTrk' + _be32(len(conductor)) + conductor]
    for program, channel, notes in tracks:
        # 按 (start, on/off) 排序事件
        events = []  # (tick, msg)
        if program is not None:
            events.append((0, bytes([0xC0 | channel, program])))
        events.append((0, bytes([0xB0 | channel, 7, 100])))  # 音量 CC7=100
        for pitch, start, dur, vel in notes:
            st = int(round(start * DIV))
            et = int(round((start + dur) * DIV))
            events.append((st, bytes([0x90 | channel, pitch & 0x7F, max(1, min(127, vel))])))
            events.append((et, bytes([0x80 | channel, pitch & 0x7F, 0])))
        events.sort(key=lambda e: e[0])
        data = bytearray()
        prev = 0
        for tick, msg in events:
            data += vlq(tick - prev)
            data += msg
            prev = tick
        data += vlq(0) + b'\xff\x2f\x00'
        chunks.append(b'MTrk' + _be32(len(data)) + data)
    header = b'MThd' + _be32(6) + _be16(1) + _be16(len(chunks)) + _be16(DIV)
    return header + b''.join(chunks)

def track(program, channel, notes):
    return (program, channel, notes)

def note(p, s, d, v=80):
    return (M(p) if isinstance(p, str) else p, s, d, v)

# =====================================================================
#  乐谱
# =====================================================================
SONGS = {}

# ---- 层级 ----

# L0「教学关卡 / Threshold」A 小调，孤独空旷，走调钢琴
SONGS['l0'] = dict(bpm=72, tracks=[
    track(89, 1, [  # 温暖 pad (Am)
        note('A2', 0, 16, 60), note('E2', 0, 16, 55), note('C3', 0, 16, 45),
    ]),
    track(0, 2, [  # 稀疏钢琴旋律
        note('E4', 0, 1.5, 62), note('A4', 1.5, 2.5, 58), note('C5', 4, 2, 54),
        note('B4', 6, 1.5, 55), note('G4', 8, 1.5, 52), note('E4', 10, 1.5, 50),
        note('C5', 12, 2, 56), note('A4', 14, 2, 50),
    ]),
    track(32, 3, [  # 低音
        note('A1', 0, 4, 70), note('F1', 4, 4, 65), note('C2', 8, 4, 62), note('G1', 12, 4, 60),
    ]),
])

# L1「宜居地带 / Habitable Zone」D 小调，地下停车场工业
SONGS['l1'] = dict(bpm=80, tracks=[
    track(38, 1, [  # 合成低音脉冲
        note('D2', 0, 1.5, 85), note('D2', 2, 1.5, 78), note('D2', 4, 1.5, 85), note('D2', 6, 1.5, 72),
        note('C2', 8, 1.5, 82), note('C2', 10, 1.5, 74), note('A1', 12, 3, 78),
    ]),
    track(11, 2, [  # 金属钟琴撞击
        note('D5', 1, 2, 66), note('A4', 3, 2, 58), note('D5', 5, 2, 62), note('G4', 7, 2, 55),
        note('C5', 9, 2, 60), note('A4', 11, 2, 52), note('D5', 13, 3, 60),
    ]),
    track(89, 3, [note('D3', 0, 16, 55), note('A2', 0, 16, 45)]),
])

# L2「废弃公共带 / Abandoned Utility Halls」G 小调，管廊机械
SONGS['l2'] = dict(bpm=96, tracks=[
    track(38, 1, [  # 机械低音节奏
        note('G1', 0, 0.75, 90), note('G1', 1, 0.75, 82), note('G1', 2, 0.75, 85),
        note('Bb1', 3, 0.75, 80), note('G1', 4, 0.75, 88), note('F1', 6, 1.5, 78),
        note('Eb1', 8, 0.75, 80), note('Eb1', 9, 0.75, 74), note('F1', 10, 0.75, 78),
        note('G1', 12, 2, 84),
    ]),
    track(8, 2, [  # 管道金属共鸣
        note('D5', 2, 1, 60), note('G4', 6, 1, 55), note('Eb5', 10, 1.5, 58), note('D5', 14, 2, 56),
    ]),
    track(89, 3, [note('G2', 0, 16, 50), note('D2', 0, 16, 40)]),
])

# L3「电站 / Electrical Station」A 小调，电弧琶音
SONGS['l3'] = dict(bpm=120, tracks=[
    track(81, 1, [  # 快速琶音主音（16 分）
        *[note(p, i * 0.25, 0.28, 68) for i, p in enumerate(
            [M('A3'), M('C4'), M('E4'), M('A4'), M('G4'), M('E4'), M('C4'), M('A3'),
             M('F3'), M('A3'), M('C4'), M('F4'), M('E4'), M('C4'), M('A3'), M('F3')])],
    ]),
    track(38, 2, [note('A1', 0, 8, 82), note('F1', 8, 8, 78)]),
    track(98, 3, [  # 水晶电火花
        note('A5', 1.5, 0.25, 55), note('E5', 5.5, 0.25, 50), note('A5', 9.5, 0.25, 52), note('C6', 13.5, 0.25, 50),
    ]),
])

# L4「废弃办公室 / Abandoned Office」C 大调忧郁，走调八音盒
SONGS['l4'] = dict(bpm=66, tracks=[
    track(89, 1, [note('C3', 0, 16, 55), note('G2', 0, 16, 48), note('E3', 0, 16, 40)]),
    track(10, 2, [  # 音乐盒旋律
        note('E5', 0, 2, 62), note('G5', 2, 2, 58), note('C6', 4, 3, 60),
        note('B5', 7, 2, 55), note('G5', 9, 2, 52),
        note('A5', 12, 2, 56), note('F5', 14, 2, 50),
    ]),
    track(0, 3, [note('C4', 3, 2, 50), note('E4', 6, 2, 48), note('G4', 10, 2, 50), note('D4', 14, 2, 46)]),
])

# L5「恐怖酒店 / Terror Hotel」C 小调 3/4 爵士圆舞曲
SONGS['l5'] = dict(bpm=108, time_sig=(3, 4), tracks=[
    track(32, 1, [  # 行走低音
        note('C2', 0, 1.5, 80), note('G2', 1.5, 1.5, 72), note('C2', 3, 1.5, 76),
        note('Bb1', 4.5, 1.5, 74), note('F2', 6, 1.5, 68), note('Bb1', 7.5, 1.5, 70),
    ]),
    track(0, 2, [  # 爵士七和弦钢琴
        note('Eb4', 0, 2, 62), note('G4', 1.5, 2, 58), note('C5', 3, 2.5, 62),
        note('D5', 4.5, 2, 56), note('Bb4', 6, 2, 52), note('F4', 7.5, 2, 50),
    ]),
    track(11, 3, [note('C6', 1.5, 2, 48), note('Bb5', 4, 2, 46), note('A5', 6.5, 2, 44)]),
    track(None, 9, [  # 鼓刷：hihat + 轻踩镲
        *[note(42, i * 1.5, 0.5, 40) for i in range(6)],
        note(36, 0, 0.5, 60), note(38, 3, 0.5, 48),
    ]),
])

# L6「熄灯 / Lights Out」近乎消音室，极低频
SONGS['l6'] = dict(bpm=40, tracks=[
    track(38, 1, [note('E1', 0, 30, 85), note('D1', 20, 12, 72)]),
    track(89, 2, [note('E2', 0, 32, 40)]),
    track(98, 3, [note('E5', 8, 0.1, 20), note('D5', 24, 0.1, 18)]),  # 极远滴答
])

# L7「深海恐惧 / Thalassophobia」F 小调，深海水压
SONGS['l7'] = dict(bpm=50, tracks=[
    track(89, 1, [note('F2', 0, 16, 65), note('C2', 0, 16, 52), note('Ab1', 0, 16, 42)]),
    track(38, 2, [note('F1', 0, 8, 72), note('Eb1', 8, 8, 66)]),
    track(98, 3, [note('F5', 4, 4, 46), note('C5', 12, 4, 42), note('Ab4', 16, 4, 38)]),  # 声呐
])

# L8「洞穴系统 / Cave Systems」C# 小调，洞穴回声
SONGS['l8'] = dict(bpm=64, tracks=[
    track(89, 1, [note('C#2', 0, 16, 60), note('G#1', 0, 16, 48)]),
    track(10, 2, [  # 洞穴回声音乐盒（稀疏）
        note('C#5', 0, 3, 60), note('E5', 4, 3, 54), note('G#5', 8, 3, 50), note('B4', 12, 3, 48),
    ]),
    track(38, 3, [note('C#1', 0, 8, 66), note('B0', 8, 8, 60)]),
])

# L9「郊区 / The Suburbs」Eb 小调，午夜孤独
SONGS['l9'] = dict(bpm=60, tracks=[
    track(89, 1, [note('Eb2', 0, 16, 58), note('Bb1', 0, 16, 48)]),
    track(0, 2, [  # 孤独钢琴
        note('Eb4', 0, 2.5, 62), note('Bb4', 2.5, 2, 56), note('G4', 4.5, 2, 54),
        note('Ab4', 6.5, 2.5, 52), note('Eb4', 9, 2, 50), note('Bb3', 11, 2, 48),
    ]),
    track(10, 3, [note('Eb5', 2, 2, 46), note('G5', 6, 2, 42), note('Ab5', 10, 2, 40)]),
])

# L10「丰收 / Bumper Crop」G 大调，田园舒缓（安全层）
SONGS['l10'] = dict(bpm=76, tracks=[
    track(89, 1, [note('G2', 0, 16, 58), note('D2', 0, 16, 48), note('B1', 0, 16, 40)]),
    track(4, 2, [  # 电钢琴琶音
        *[note(p, i * 1, 1, 58) for i, p in enumerate(
            [M('G4'), M('B4'), M('D5'), M('G5'), M('A5'), M('G5'), M('D5'), M('B4'),
             M('C5'), M('E5'), M('G5'), M('C6'), M('B5'), M('G5'), M('E5'), M('C5')])],
    ]),
    track(32, 3, [note('G1', 0, 4, 66), note('D2', 4, 4, 62), note('C2', 8, 4, 62), note('G1', 12, 4, 60)]),
])

# L11「不夜城 / The City That Never Sleeps」冷峻都市
SONGS['l11'] = dict(bpm=88, tracks=[
    track(89, 1, [note('C3', 0, 16, 62), note('G2', 0, 16, 50), note('E2', 0, 16, 40)]),
    track(81, 2, [  # 主音（低沉）
        note('E4', 0, 3, 58), note('G4', 3, 3, 55), note('D4', 6, 3, 54), note('C4', 9, 3, 52),
        note('E4', 12, 3, 52), note('G4', 15, 3, 48),
    ]),
    track(38, 3, [note('C2', 0, 2, 70), note('C2', 4, 2, 66), note('G1', 8, 2, 64), note('C2', 12, 2, 66)]),
])

# L601「终末 / The End」图书馆，假象之家（温暖中透着不安）
SONGS['l601'] = dict(bpm=70, tracks=[
    track(89, 1, [note('C3', 0, 16, 60), note('Ab2', 0, 16, 48)]),
    track(0, 2, [  # 温暖但走调的钢琴
        note('C4', 0, 2.5, 62), note('E4', 2.5, 2, 58), note('Ab4', 4.5, 2.5, 56),
        note('G4', 7, 2.5, 54), note('B4', 9.5, 2.5, 52), note('C5', 12, 3, 50),
    ]),
    track(52, 3, [  # 唱诗班 pad（诡异）
        note('C4', 0, 16, 42), note('Ab3', 0, 16, 36), note('E3', 0, 16, 32),
    ]),
])

# ---- 团体（据点）----

# M.E.G. 探险者总署：C 大调，组织有序，希望
SONGS['meg'] = dict(bpm=92, tracks=[
    track(89, 1, [note('C3', 0, 8, 60), note('G2', 0, 8, 52), note('F2', 8, 8, 50), note('G2', 12, 4, 52)]),
    track(60, 2, [  # 圆号
        note('E4', 0, 2, 62), note('G4', 2, 2, 60), note('C5', 4, 3, 62),
        note('A4', 8, 2, 58), note('F4', 10, 2, 56), note('G4', 12, 3, 58),
    ]),
    track(32, 3, [note('C2', 0, 4, 70), note('G1', 4, 4, 66), note('A1', 8, 4, 66), note('F1', 12, 4, 64)]),
])

# B.N.T.G. 不结盟贸易集团：F 大调，忙碌集市，中立
SONGS['bntg'] = dict(bpm=100, tracks=[
    track(38, 1, [note('F1', 0, 1, 82), note('C2', 1, 1, 74), note('F1', 2, 1, 80), note('Bb1', 3, 1, 72),
                  note('F1', 4, 1, 80), note('C2', 5, 1, 74), note('F1', 6, 1, 78), note('Bb1', 7, 1, 70)]),
    track(4, 2, [note('F4', 0, 1.5, 60), note('A4', 1.5, 1.5, 56), note('C5', 3, 2, 58),
                 note('Bb4', 5, 1.5, 54), note('A4', 6.5, 1.5, 52), note('G4', 8, 2, 50)]),
    track(None, 9, [note(42, 0, 0.5, 44), note(42, 2, 0.5, 42), note(42, 4, 0.5, 44), note(42, 6, 0.5, 42),
                    note(36, 0, 0.5, 62), note(36, 4, 0.5, 58)]),
])

# 阿丽亚娜集团：D 大调，洁净医疗，精准
SONGS['ariane'] = dict(bpm=72, tracks=[
    track(89, 1, [note('D3', 0, 8, 55), note('A2', 0, 8, 48), note('G3', 8, 8, 50), note('A2', 12, 4, 48)]),
    track(48, 2, [  # 弦乐
        note('F#4', 0, 3, 56), note('A4', 2, 3, 54), note('D5', 4, 4, 56),
        note('G4', 8, 3, 52), note('A4', 10, 3, 50),
    ]),
    track(73, 3, [note('A4', 3, 2, 48), note('D5', 7, 2, 46), note('E5', 11, 2, 44)]),  # 长笛
])

# 后室装修公司 B.R.C.：E 小调，施工机械，不安
SONGS['brc'] = dict(bpm=110, tracks=[
    track(38, 1, [note('E1', 0, 0.5, 88), note('E1', 1, 0.5, 84), note('E1', 2, 0.5, 86),
                  note('G1', 3, 0.5, 80), note('E1', 4, 0.5, 86), note('B0', 6, 1, 78)]),
    track(81, 2, [note('E3', 0, 1, 64), note('G3', 1, 1, 60), note('B3', 2, 1, 62), note('G3', 3, 1, 58),
                  note('A3', 4, 1, 60), note('G3', 5, 1, 56), note('B3', 6, 1.5, 58)]),
    track(None, 9, [note(36, 0, 0.25, 70), note(36, 2, 0.25, 68), note(36, 4, 0.25, 70),
                    note(38, 1, 0.25, 62), note(38, 3, 0.25, 60), note(38, 5, 0.25, 62)]),
])

# 流浪者：D 小调，孤独坚韧，民谣感
SONGS['wanderer'] = dict(bpm=70, tracks=[
    track(89, 1, [note('D2', 0, 8, 58), note('Bb1', 8, 8, 50)]),
    track(0, 2, [  # 民谣钢琴
        note('D4', 0, 2, 58), note('F4', 2, 2, 54), note('A4', 4, 3, 56),
        note('G4', 7, 2, 52), note('F4', 9, 2, 50), note('E4', 11, 2, 48),
    ]),
    track(32, 3, [note('D1', 0, 4, 64), note('C2', 4, 4, 60), note('Bb1', 8, 4, 58), note('A1', 12, 4, 56)]),
])

# 杰瑞的信众：B 小调，宗教合唱，催眠
SONGS['jerry'] = dict(bpm=66, tracks=[
    track(89, 1, [note('B1', 0, 8, 60), note('F#1', 0, 8, 50), note('G1', 8, 8, 48)]),
    track(52, 2, [  # 唱诗班（不协和）
        note('B3', 0, 4, 54), note('D4', 0, 4, 50), note('F#4', 0, 4, 46),
        note('C4', 4, 4, 50), note('E4', 4, 4, 46), note('G4', 4, 4, 42),
    ]),
    track(10, 3, [note('B5', 2, 3, 46), note('A5', 6, 3, 42), note('B5', 10, 3, 44)]),
])

# 家常酒店：E 大调，现代 muzak，舒适平淡
SONGS['homely'] = dict(bpm=74, tracks=[
    track(89, 1, [note('E2', 0, 8, 56), note('B1', 0, 8, 48), note('A2', 8, 8, 48)]),
    track(4, 2, [  # 电钢琴 muzak
        note('E4', 0, 1.5, 56), note('G#4', 1.5, 1.5, 52), note('B4', 3, 2, 54),
        note('A4', 5, 1.5, 50), note('G#4', 6.5, 1.5, 48), note('F#4', 8, 2, 46),
    ]),
    track(32, 3, [note('E1', 0, 4, 62), note('B0', 4, 4, 58), note('A1', 8, 4, 56)]),
])

# 原住民：G 大调，1937 老式摇摆 / 狐步
SONGS['originals'] = dict(bpm=84, tracks=[
    track(32, 1, [note('G2', 0, 1.5, 76), note('D2', 1.5, 1.5, 70), note('G2', 3, 1.5, 72),
                  note('C3', 4.5, 1.5, 70), note('G2', 6, 1.5, 68)]),
    track(56, 2, [  # 小号
        note('B4', 0, 1.5, 60), note('D5', 1.5, 1.5, 56), note('G5', 3, 2, 58),
        note('F#5', 4.5, 1.5, 54), note('E5', 6, 1.5, 50), note('D5', 7.5, 1.5, 48),
    ]),
    track(None, 9, [note(42, 0, 0.5, 42), note(42, 1.5, 0.5, 40), note(42, 3, 0.5, 42), note(42, 4.5, 0.5, 40),
                    note(36, 0, 0.5, 58), note(38, 3, 0.5, 50)]),
])

# ---- 写文件 ----
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'music')
os.makedirs(OUT, exist_ok=True)
for key, song in SONGS.items():
    name = song.get('_name', key)
    bpm = song['bpm']
    ts = song.get('time_sig', (4, 4))
    data = make_midi(song['tracks'], bpm, ts, key)
    path = os.path.join(OUT, f'{key}.mid')
    with open(path, 'wb') as f:
        f.write(data)
    print(f'wrote {path} ({len(data)} bytes, {bpm} bpm)')
print('done', len(SONGS), 'files')
