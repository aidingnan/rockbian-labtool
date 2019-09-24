/// usage: node usnToSn.js '9503-EXYM-535W'
/// '9503-EXYM-535W' => '0123ff05f0ceefb6ee'

const convert = (usn) => {
  if (usn.length != 14) return '请输入正确的usn'
  const list = usn.split('-')
  const n1 = parseInt(list[0].substring(0, 2))
  const n2 = parseInt(list[0].substring(2, 4))
  const p13 = ((n1 - 10) * 96 + n2 - 3).toString(2).padStart(13, '0')
  const newStr = (list[1] + list[2]).substring(1).split('')
  const alphabet = 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z 2 3 4 5 6 7'.split(' ')
  const p35 = newStr.map(s => alphabet.indexOf(s)).map(i => i.toString(2).padStart(5, '0'))
  const full = p13 + p35.join('')
  let deviceSN = '0123'
  for (let i = 0; i < full.length; i += 8) {
    deviceSN += parseInt(full.substring(i, i + 8), 2).toString(16).padStart(2, '0')
  }
  // console.log(list, p13, newStr, p35, full.length)
  return deviceSN + 'ee'
}
console.log(convert(process.argv[2]))
