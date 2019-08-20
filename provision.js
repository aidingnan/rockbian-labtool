const child = require('child_process')
const readline = require('readline')

const debug = require('debug')('app')

const request = require('superagent')

const domain = process.argv.includes('test') ? 'test' : 'aws-cn'
console.log(`start provisioning for ${domain} domain...`)
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })


const Restriction = require('./lib/restriction')
const im = require('./lib/iface-monitor')

const tokenUrl = domain === 'aws-cn'
  ? 'https://aws-cn.aidingnan.com/provisioning/token'
  : 'http://ec2-52-81-82-240.cn-north-1.compute.amazonaws.com.cn:12345/test/provisioning/token'

const provisionUrl = domain === 'aws-cn'
  ? 'https://aws-cn.aidingnan.com/provisioning/provisioning/certificate/sign'
  : 'http://ec2-52-81-82-240.cn-north-1.compute.amazonaws.com.cn:12345/test/provisioning/certificate/sign'


/**
cb: (err, cert | null) => {}
*/
const fetchCert = (domain, sn, ip, callback) => request
  .get(`https://${domain}.aidingnan.com/s/v1/station/${sn}/cert`)
  .then(res => {
    // console.log(`${ip} station account at ${domain} domain found`)
    // console.log(res.body.data)
    callback(null, res.body.data)
  })
  .catch(err => err.status === 404 ? callback(null) : callback(err))

/**
  .end((req, res) => {
    if (res.status === 404 || (res.status === 200 && res.body.data === null)) {
      console.log(`${ip} station account at ${domain} domain not found`)
      callback(null, null)
    } else if (res.status !== 200) {
      console.log(`${ip} failed with ${res.status} when fetching cert`)
      callback(new Error())
    } else {
      console.log(`${ip} station account at ${domain} domain found`)
      console.log(res.body.data)
      cert = res.body.data
    }
  })
*/

const fetchToken = (code, callback) => request
  .get(tokenUrl)
  .query({ key: code })
  .then(res=> {
    console.log('fetch token', res.body.token)
    callback(null, res.body.token)
  })
  .catch(e => callback(e))

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

const signcsr = (token, sn, csr, callback) => request
  .post(`http://ec2-54-223-41-42.cn-north-1.compute.amazonaws.com.cn:12345/provisioning/certificate/sign`)
  .set('Authorization', token)
  .send({ sn, csr })
  .then(res => callback(null, res.body))
  .catch(e => callback(e))

// global
const gr = new Restriction() 

gr.once('token', () => {
  let input
  const codeLoop = () => {
    rl.question('input a code:', answer => {
      if (/^[0-9]{6}$/.test(answer)) {
        input = answer
        const fetchLoop = () => {
          fetchToken(input, (err, token) => {
            if (err) {
              console.log(err.message)
              const retryLoop = () => {
                rl.question('press return for retry or input another code:', answer => {
                  if (answer === '') {
                    fetchLoop()
                  } else if (/^[0-9]{6}$/.test(answer)) {
                    input = answer
                    fetchLoop()
                  } else {
                    console.log('invalid code')
                    retryLoop()
                  }
                })
              }
              retryLoop()
            } else {
              gr.send('token', token)
            }
          }) 
        }
        fetchLoop() 
      } else {
        console.log('invalid code')
        setImmediate(codeLoop)
      }
    })
  }

  codeLoop()
}) 

im.on('add', iface => {
  console.log(`${iface.buddyIp} added`)

  const ip = iface.buddyIp
  const ssh = `ssh -o "StrictHostKeyChecking no" root@${ip}`
  const r = new Restriction()

  r.once('sn', () => child.exec(`${ssh} cat /run/cowroot/root/data/init/sn`, (err, stdout, stderr) => {
    if (err) {
      console.log(`${ip} ${err.message}`)
      console.log(`${ip}`, stdout)
      console.log(`${ip}`, stderr)
    } else {
      const sn = stdout.toString().trim()
      r.send('sn', stdout.toString().trim())
      console.log(`${ip} serial number ${sn}`)
      console.log(`${ip} retrieving cert for ${sn} from ${domain} domain`)
    }
  }))

  r.once('csr', () => gencsr(ip, (err, csr) => {
    if (err) {
      console.log(`${ip}`, 'gencsr failed', err.message)
    } else {
      r.send('csr', csr)
    }
  }))

  r.once('cert', () => r.recv('sn', sn => fetchCert(domain, sn, ip, (err, cert) => {
    if (err) {
      console.log(err)
    } else {
      if (cert) {
        r.send('cert', cert)
      } else {
        r.send('nocert')
      }
    }
  })))

  r.once('newcert', () => r.recv('sn', sn => r.recv('csr', csr => r.recv('cert', 'nocert', name => {
    if (name === 'cert') return
    console.log(`${ip} cert not found, trying to sign a new cert`)
    gr.recv('token', token => {
      signcsr(token, sn, csr, (err, body) => {
        if (err) {
          console.log(`${ip} provisioning failed`)
        } else {
          debug('new cert id', body.certId)
          debug('new cert arn', body.certArn)
          debug('new cert pem', body.certPem)
          r.send('newcert', body.certPem)
        }
      })
    })
  }))))

  r.recv('cert', 'newcert', (name, value) => r.recv('csr', () => {
    if (name === 'cert') {
      console.log(`${ip} has already been provisioned`)
    } else {
      console.log(`${ip} is successfully provisioned`)
    }
  }))
})

im.on('remove', iface => {
  console.log(`${iface.buddyIp} removed`)
})
