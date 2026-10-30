const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// 在 signAndEditExecutable=false 时，用缓存里的 rcedit 写入 exe 图标
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const exeName = `${context.packager.appInfo.productFilename}.exe`
  const exe = path.join(context.appOutDir, exeName)
  const icon = path.join(context.packager.projectDir, 'build', 'icon.ico')
  const cacheRoot = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign')
  if (!fs.existsSync(cacheRoot)) {
    console.warn('[afterPack] winCodeSign cache missing, skip icon embed')
    return
  }

  const rcedit = fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(cacheRoot, d.name, 'rcedit-x64.exe'))
    .find((p) => fs.existsSync(p))

  if (!rcedit || !fs.existsSync(exe) || !fs.existsSync(icon)) {
    console.warn('[afterPack] rcedit/exe/icon missing, skip icon embed')
    return
  }

  execFileSync(rcedit, [exe, '--set-icon', icon])
  console.log('[afterPack] embedded icon into', exeName)
}
