import sharp from 'sharp'
import path from 'node:path'

const outDir = path.resolve('data/samples')

const samples = [
  {
    file: 'concept-shenlan-a.png',
    title: '角色 · 沈岚',
    sub: 'CHARACTER / FIRST PASS',
    colors: ['#18304a', '#0c1622', '#e09d4b'],
    accent: '#f2b35c',
    shape: 'circle',
  },
  {
    file: 'concept-shenlan-b.png',
    title: '角色 · 沈岚 · 备选',
    sub: 'CHARACTER / ALT 02',
    colors: ['#2a1c2e', '#100b17', '#b46a8f'],
    accent: '#f0a7c8',
    shape: 'arc',
  },
  {
    file: 'concept-harbor.png',
    title: '场景 · 雾港码头',
    sub: 'LOCATION / NIGHT',
    colors: ['#0e2a33', '#071218', '#4f8c8a'],
    accent: '#6fd3cf',
    shape: 'rect',
  },
  {
    file: 'concept-compass.png',
    title: '道具 · 铜制罗盘',
    sub: 'PROP / HERO',
    colors: ['#3a2a14', '#120d07', '#d7a34b'],
    accent: '#ffd27d',
    shape: 'ring',
  },
  {
    file: 'concept-coat.png',
    title: '服装 · 海员大衣',
    sub: 'COSTUME / WEATHERED',
    colors: ['#1d2a3a', '#0a0f16', '#6b7f99'],
    accent: '#a9c1de',
    shape: 'rect',
  },
  {
    file: 'concept-warehouse.png',
    title: '场景 · 旧仓库',
    sub: 'LOCATION / INTERIOR',
    colors: ['#2b2118', '#0f0b08', '#c08346'],
    accent: '#e8b06c',
    shape: 'lines',
  },
]

for (const [index, sample] of samples.entries()) {
  const [c1, c2, c3] = sample.colors
  const shape =
    sample.shape === 'circle'
      ? `<circle cx="760" cy="400" r="250" fill="${c3}" opacity="0.28"/>
         <circle cx="760" cy="400" r="150" fill="none" stroke="${sample.accent}" stroke-width="2" opacity="0.55"/>`
      : sample.shape === 'arc'
        ? `<path d="M480 620 C 610 160, 980 120, 1160 400" fill="none" stroke="${c3}" stroke-width="120" opacity="0.3"/>`
        : sample.shape === 'ring'
          ? `<circle cx="780" cy="390" r="210" fill="none" stroke="${c3}" stroke-width="26" opacity="0.4"/>
             <circle cx="780" cy="390" r="130" fill="none" stroke="${sample.accent}" stroke-width="3" opacity="0.7"/>
             <path d="M780 260 L820 390 L780 520 L740 390 Z" fill="${sample.accent}" opacity="0.6"/>`
          : sample.shape === 'lines'
            ? `<path d="M0 620 L1200 500 M0 700 L1200 580 M0 780 L1200 660" stroke="${c3}" stroke-width="2" opacity="0.35"/>
               <rect x="700" y="180" width="300" height="300" fill="none" stroke="${sample.accent}" stroke-width="2" opacity="0.4"/>`
            : `<rect x="700" y="200" width="360" height="420" rx="26" fill="${c3}" opacity="0.25"/>
               <rect x="740" y="240" width="280" height="340" rx="18" fill="none" stroke="${sample.accent}" stroke-width="2" opacity="0.45"/>`

  const svg = `
  <svg width="1200" height="800" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="55%" stop-color="${c2}"/>
        <stop offset="100%" stop-color="${c1}"/>
      </linearGradient>
      <radialGradient id="glow" cx="70%" cy="30%" r="60%">
        <stop offset="0%" stop-color="${sample.accent}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${sample.accent}" stop-opacity="0"/>
      </radialGradient>
      <pattern id="grain" width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill="transparent"/>
        <circle cx="1" cy="1" r="0.5" fill="#ffffff" opacity="0.05"/>
      </pattern>
    </defs>
    <rect width="1200" height="800" fill="url(#bg)"/>
    <rect width="1200" height="800" fill="url(#glow)"/>
    ${shape}
    <rect width="1200" height="800" fill="url(#grain)"/>
    <rect x="54" y="52" width="50" height="3" fill="${sample.accent}"/>
    <text x="54" y="96" fill="${sample.accent}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="15" letter-spacing="4">${sample.sub}</text>
    <text x="54" y="690" fill="#f4f8ff" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="58" font-weight="700">${sample.title}</text>
    <text x="56" y="736" fill="#9fb0c5" font-family="Arial, Microsoft YaHei, sans-serif" font-size="17" letter-spacing="2">FRAME / PROJECT CONCEPT BOARD ${String(index + 1).padStart(2, '0')}</text>
    <rect x="54" y="758" width="270" height="1" fill="#ffffff" opacity="0.18"/>
  </svg>`

  await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, sample.file))
  console.log('wrote', sample.file)
}
