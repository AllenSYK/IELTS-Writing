import { generateKeyPairSync } from 'node:crypto'

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  },
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  }
})

console.log('LICENSE_TOKEN_PRIVATE_KEY_PEM=' + JSON.stringify(privateKey).slice(1, -1))
console.log('LICENSE_TOKEN_PUBLIC_KEY_PEM=' + JSON.stringify(publicKey).slice(1, -1))
