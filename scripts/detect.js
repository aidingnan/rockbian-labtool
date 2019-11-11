/// detect usn of PocketDrive by USB, (on windows, need lsusb.exe)
/// usage: sudo node ./detect.js
const child = require('child_process')
const path = require('path')
const fs = require('fs')

let lastSN = ''

const fileName = new Date().toJSON().replace(/:/g, '-')

const fullPath = path.resolve(`./csv/${fileName}.csv`)

console.log('')
console.log('CSV文件路径', fullPath, '\n')
fs.writeFileSync(fullPath, '\ufeff')
fs.appendFileSync(fullPath, '设备名,序列号\r\n')
// child.execSync(`echo 设备名,序列号 >> ${fullPath}`)
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
    let size = ''
    try {
      const ip = `169.254.${usn.substr(0, 2)}.${usn.substr(2, 4)}`
      const res = child.execSync(`curl -s http://${ip}:3000/boot | grep size | head -n 1 | awk '{print $2}'`)
      size = `${parseInt((parseInt(res.toString()) * 512 / 1000 / 1000 / 1000))} G`
    } catch (e) {
    }

    console.log('\n序列号:\t', usn, '\n大小:\t', size, '\n时间:\t', time, '\n')
    fs.appendFileSync(fullPath, `设备名：pan-${usn.substr(0, 4)},序列号：${usn}\r\n`)
  } else {
    process.stdout.write('.')
  }
  child.execSync('sleep 2')
}
