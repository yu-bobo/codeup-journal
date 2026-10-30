const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const pngToIco = require('png-to-ico').default

const root = path.join(__dirname, '..')
const buildDir = path.join(root, 'build')
const resDir = path.join(root, 'resources')

// 圆角外透明，画布不留白底；内为蓝渐变 + 提交日志符号
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#16325c"/>
      <stop offset="48%" stop-color="#3b7ddd"/>
      <stop offset="100%" stop-color="#6aa0f0"/>
    </linearGradient>
    <linearGradient id="page" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.98"/>
      <stop offset="100%" stop-color="#e8f0fc" stop-opacity="0.95"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="220" ry="220" fill="url(#bg)"/>
  <g transform="translate(272 210)">
    <rect x="0" y="20" width="72" height="520" rx="18" fill="#0f2748" opacity="0.35"/>
    <rect x="48" y="0" width="432" height="560" rx="36" fill="url(#page)"/>
    <rect x="48" y="0" width="28" height="560" fill="#2a5fb0" opacity="0.18"/>
    <circle cx="168" cy="150" r="28" fill="#3b7ddd"/>
    <rect x="160" y="178" width="16" height="90" rx="8" fill="#3b7ddd"/>
    <circle cx="168" cy="300" r="22" fill="#5b8fef"/>
    <rect x="160" y="322" width="16" height="90" rx="8" fill="#5b8fef"/>
    <circle cx="168" cy="450" r="22" fill="#2a5fb0"/>
    <rect x="230" y="132" width="200" height="28" rx="14" fill="#3b7ddd" opacity="0.85"/>
    <rect x="230" y="178" width="150" height="20" rx="10" fill="#7aa7e8" opacity="0.55"/>
    <rect x="230" y="282" width="210" height="28" rx="14" fill="#3b7ddd" opacity="0.75"/>
    <rect x="230" y="328" width="130" height="20" rx="10" fill="#7aa7e8" opacity="0.5"/>
    <rect x="230" y="432" width="180" height="28" rx="14" fill="#2a5fb0" opacity="0.8"/>
  </g>
</svg>`

async function main() {
  fs.mkdirSync(buildDir, { recursive: true })
  fs.mkdirSync(resDir, { recursive: true })

  const master = path.join(buildDir, 'icon.png')
  await sharp(Buffer.from(svg)).png().toFile(master)

  const { data, info } = await sharp(master).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const alphaAt = (x, y) => data[(y * w + x) * 4 + 3]
  console.log('corner alpha (0=transparent):', {
    tl: alphaAt(2, 2),
    tr: alphaAt(w - 3, 2),
    bl: alphaAt(2, h - 3),
    br: alphaAt(w - 3, h - 3),
    center: alphaAt((w / 2) | 0, (h / 2) | 0)
  })

  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const pngBuffers = []
  for (const size of icoSizes) {
    pngBuffers.push(await sharp(master).resize(size, size).png().toBuffer())
  }
  for (const size of [16, 32, 256, 512]) {
    await sharp(master).resize(size, size).png().toFile(path.join(buildDir, `icon-${size}.png`))
    await sharp(master).resize(size, size).png().toFile(path.join(resDir, `icon-${size}.png`))
  }

  const ico = await pngToIco(pngBuffers)
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico)
  fs.writeFileSync(path.join(resDir, 'icon.ico'), ico)
  fs.copyFileSync(master, path.join(resDir, 'icon.png'))
  fs.writeFileSync(path.join(buildDir, 'icon.svg'), svg)
  console.log('icon updated')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
