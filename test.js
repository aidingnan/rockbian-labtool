const child = require('child_process')
const readline = require('readline')

const request = require('superagent')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '[labtool]# '
})

const domain = process.argv.includes('test') ? 'test' : 'aws-cn'
console.log(`start provisioning for ${domain} domain...`)

const Restriction = require('./lib/restriction')
const im = require('./lib/iface-monitor')

const provisionTokenUrl = code =>
  `http://ec2-54-223-41-42.cn-north-1.compute.amazonaws.com.cn:12345/provisioning/token?key=${code}`

/**
cb: (err, cert | null) => {}
*/
const fetchCert = (domain, sn, ip, callback) => request
  .get(`https://${domain}.aidingnan.com/s/v1/station/${sn}/cert`)
  .end((req, res) => {
    if (res.status === 400 || (res.status === 200 && res.body.data === null)) {
      console.log(`${ip} station account at ${domain} domain not found`)
      callback(null, null)
    } else if (res.status !== 200) {
      console.log(`${ip} failed with ${res.status} when fetching cert`)
      callback(new Error())
    } else {
      console.log(`${ip} station account at ${domain} domain found`)
      cert = res.body.data
    }
  })

const fetchToken = (code, callback) => request
  .get(provisionTokenUrl(code))
  .end((req, res) => {
    if (res.status === 200) {
      callback(null, res.body.token)
    } else {
      callback(new Error())
    }
  })

/**
retry: number, optional
cb:
*/
const gencsr = (ip, retry, callback) => {
  if (typeof retry === 'function') {
    callback = retry
    retry = 2
  }

  const ssh = `ssh -o "StrictHostKeyChecking no" root@`

  child.exec(`${ssh}${ip} node /root/winasd/src/bpp.js --domain ${domain}`, (err, stdout) => {
    if (!err) {
      const ls = stdout.toString().split('\n').filter(l => l.length)
      const first = ls[0]
      const last = ls[ls.length - 1]
      if (first.includes('BEGIN CERTIFICATE REQUEST') && last.includes('END CERTIFICATE REQUEST')) {
        return callback(null, stdout.toString())
      } else {
        err = new Error('invalid csr format')
      }
    }

    console.log('error generating csr', err.message, retry && 'retry...')
    retry ? gencsr(ip, --retry, callback) : callback(err)
  })
}

const signcsr = (csr, sn, callback) => request
  .post(`http://ec2-54-223-41-42.cn-north-1.compute.amazonaws.com.cn:12345/provisioning/certificate/sign`)
  .set('Authorization', token)
  .send({ csr, sn })
  .end((req, res) => {
    if (res.status !== 200) {
      console.log(res.status)
      console.log(res.body)
    } else {
      console.log(res.status)
      console.log(res.body)
    }
  })

im.on('add', iface => {
  console.log(`${iface.buddyIp} added`)
  const ip = iface.buddyIp
  const ssh = `ssh -o "StrictHostKeyChecking no" root@${ip}`
  const r = new Restriction()

  // send sn
  child.exec(`${ssh} cat /run/cowroot/root/data/init/sn`, (err, stdout, stderr) => {
    if (err) {
      console.log(`${ip} ${err.message}`)
      console.log(`${ip}`, stdout)
      console.log(`${ip}`, stderr)
    } else {
      const sn = stdout.toString().trim()
      r.send('sn', stdout.toString().trim())
      console.log(`${ip} serial number ${sn}`)
      console.log(`${ip} retrieving cert of device ${sn} from ${domain} domain`)
    }
  })

  // send csr
  gencsr(ip, (err, csr) => {
    if (err) {
    } else {
      console.log(`${ip} csr is ready`)
      console.log(csr)
      r.send(csr)
    }
  })

  // sn => cert
  r.recv('sn', sn => fetchCert(domain, sn, ip, (err, cert) => {
    if (err) {
      console.log(err)
    } else {
      if (cert) {
        r.send(cert)
      } else {
        // ???
      }
    }
  }))

  // recv csr AND sn, curry style in pi
  r.recv('csr', csr => r.recv('sn', sn => signcsr(csr, sn, (err, cert) => {
    if (err) {
    } else {
      // r.send(cert) racing ???
    }
  })))
})

im.on('remove', iface => {
  console.log(`${iface.buddyIp} removed`)
})
