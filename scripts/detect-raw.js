/// detect usn of PocketDrive by USB, (on windows, need lsusb.exe)
/// usage: sudo node ./detect.js
const child = require('child_process')

let lastSN = ''
console.log('检测设备中...')
while (true) {
  let usn
  try {
    if (process.platform === 'win32') {
      usn = child.execSync('lsusb.exe | grep Dingnan').toString().split('"')[7]
    } else {
      const res = child.execSync('lsusb -d 1d6b:0104 -v | grep iSerial', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString().trim().split(/\s/)
      usn = res.pop()
    }
  } catch (error) {
    child.execSync('sleep 2')
    lastSN = ''
    process.stdout.write('.')
    continue
  }

  const time = new Date().toTimeString().substring(0, 8)

  if (lastSN !== usn) {
    lastSN = usn
    console.log('\n序列号:\t', usn, '\n时间:\t', time, '\n')
  } else {
    process.stdout.write('.')
  }
  child.execSync('sleep 2')
}
