import fs from 'node:fs'
import { spawn } from 'node:child_process'
import dotenv from 'dotenv'
import Stripe from 'stripe'
import { BILLING_EVENTS } from '../lib/billing/config.ts'

// The CLI's saved login can point to a different sandbox. Bind it explicitly
// to the same credentials as the application, without putting keys in argv.
const config = dotenv.parse(fs.readFileSync('.env.local', 'utf8'))
if (!/^(sk|rk)_test_/.test(config.STRIPE_SECRET_KEY || '')) throw new Error('Local listener requires a sandbox API key')
const stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2026-09-30.endive', timeout: 20_000 })
const account = await stripe.accounts.retrieve()
if (account.id !== config.STRIPE_ACCOUNT_ID) throw new Error('Stripe API key belongs to a different account')

const port = process.env.STRIPE_LOCAL_PORT || '3000'
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid local port')
const child = spawn(process.env.STRIPE_CLI_PATH || 'stripe', [
  'listen', '--latest', '--events', BILLING_EVENTS.join(','), '--events-from', '@self',
  '--forward-to', `localhost:${port}/api/billing/webhook`, '--color', 'off'
], { env: { ...process.env, STRIPE_API_KEY: config.STRIPE_SECRET_KEY }, stdio: ['ignore', 'pipe', 'pipe'] })

function output(line) {
  const secret = line.match(/whsec_[A-Za-z0-9]+/)?.[0]
  if (secret) {
    const local = fs.readFileSync('.env.local', 'utf8').replace(/^STRIPE_WEBHOOK_SECRET=.*(?:\r?\n|$)/gm, '')
    fs.writeFileSync('.env.local', `${local.trimEnd()}\nSTRIPE_WEBHOOK_SECRET=${JSON.stringify(secret)}\n`, { mode: 0o600 })
    fs.chmodSync('.env.local', 0o600)
  }
  process.stdout.write(`${line.replace(/whsec_[A-Za-z0-9]+/g, '[signing-secret-saved]')}\n`)
}
for (const stream of [child.stdout, child.stderr]) {
  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() || ''
    for (const line of lines) output(line)
  })
  stream.on('end', () => { if (pending) output(pending) })
}
child.on('error', () => {
  console.error('Cannot start Stripe CLI. Install @stripe/cli, or set STRIPE_CLI_PATH to its executable.')
  process.exitCode = 1
})
child.on('exit', (code, signal) => { process.exitCode = signal ? 0 : code ?? 1 })
process.on('SIGTERM', () => child.kill('SIGTERM'))
process.on('SIGINT', () => child.kill('SIGINT'))
