// daemon to detect PocketDrive and Burn it
// usage: sudo node ./daemon-burn.js
const child = require('child_process')

console.log('检测设备中...')
while (true) {
  let res
  try {
    res = child.execSync('./rkdeveloptool ld', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
    if (res.startsWith('not')) {
      throw Error('Not Found Device')
    }
  } catch (error) {
    child.execSync('sleep 2')
    process.stdout.write('.')
    continue
  }
  const t1 = new Date()
  console.log('\n', '======检测到设备，按任意键开始烧录=====')
  child.execSync('read CMD', {stdio: [process.stdin, null, null]})
  child.execSync('sleep 1')
  try {
    child.execSync('./burn.sh', { stdio: 'inherit' })
  } catch (error) {
    child.execSync('sleep 2')
    process.stdout.write('.')
    continue
  }
  const time = new Date().toTimeString().substring(0, 8)
  const cost = (new Date().getTime() - t1.getTime()) / 1000
  console.log('\n烧录成功于时间: ', time, '烧录耗时：', cost, '秒')
  child.execSync('sleep 4')
  console.log('检测设备中...')
}
