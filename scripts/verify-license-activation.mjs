import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const appUrl = process.env.LICENSE_E2E_APP_URL || 'http://127.0.0.1:3000'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

assert.ok(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL is required')
assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required')

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
})

function createCookieJar() {
  const cookies = new Map()

  return {
    apply(response) {
      for (const value of response.headers.getSetCookie()) {
        const pair = value.split(';', 1)[0]
        const separator = pair.indexOf('=')
        if (separator <= 0) continue
        const name = pair.slice(0, separator)
        const cookieValue = pair.slice(separator + 1)
        if (cookieValue) cookies.set(name, cookieValue)
        else cookies.delete(name)
      }
    },
    header() {
      return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
    }
  }
}

async function requestJson(path, init, cookieJar) {
  const headers = new Headers(init?.headers)
  const cookie = cookieJar?.header()
  if (cookie) headers.set('Cookie', cookie)

  const response = await fetch(`${appUrl}${path}`, {
    ...init,
    headers
  })
  cookieJar?.apply(response)

  return {
    response,
    data: await response.json()
  }
}

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const adminEmail = `license-admin-${suffix}@example.com`
const userEmail = `license-user-${suffix}@example.com`
const password = `Verify!${suffix}Aa9`
let adminUserId
let userId
let licenseId

try {
  const { data: adminUser, error: adminCreateError } = await service.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true
  })
  if (adminCreateError) throw adminCreateError
  adminUserId = adminUser.user.id

  const { data: standardUser, error: userCreateError } = await service.auth.admin.createUser({
    email: userEmail,
    password,
    email_confirm: true
  })
  if (userCreateError) throw userCreateError
  userId = standardUser.user.id

  const { error: promoteError } = await service
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', adminUserId)
  if (promoteError) throw promoteError

  const adminCookies = createCookieJar()
  const adminLogin = await requestJson('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password })
  }, adminCookies)
  assert.equal(adminLogin.response.status, 200)
  assert.equal(adminLogin.data.success, true)

  const generated = await requestJson('/api/admin/licenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      count: 1,
      plan: 'standard',
      durationDays: 30,
      maxActivations: 1,
      note: 'License activation end-to-end verification'
    })
  }, adminCookies)
  assert.equal(generated.response.status, 200)
  assert.equal(generated.data.success, true)
  assert.equal(generated.data.codes.length, 1)

  const generatedLicense = generated.data.codes[0]
  assert.equal(generatedLicense.status, 'unused')
  licenseId = generatedLicense.id

  const userCookies = createCookieJar()
  const userLogin = await requestJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password })
  }, userCookies)
  assert.equal(userLogin.response.status, 200)
  assert.equal(userLogin.data.success, true)
  assert.equal(userLogin.data.redirectTo, '/activate')

  const activation = await requestJson('/api/license/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: generatedLicense.code })
  }, userCookies)
  assert.equal(activation.response.status, 200)
  assert.equal(activation.data.success, true)

  const [{ data: license, error: licenseError }, { data: binding, error: bindingError }, { data: profile, error: profileError }] =
    await Promise.all([
      service
        .from('license_codes')
        .select('id, code_prefix, activation_count, max_activations, status')
        .eq('id', licenseId)
        .single(),
      service
        .from('license_activations')
        .select('id, license_id, user_id, email, status, created_at, expires_at')
        .eq('license_id', licenseId)
        .eq('user_id', userId)
        .single(),
      service
        .from('profiles')
        .select('id, email, license_status, license_expires_at')
        .eq('id', userId)
        .single()
    ])

  if (licenseError) throw licenseError
  if (bindingError) throw bindingError
  if (profileError) throw profileError

  assert.equal(license.activation_count, 1)
  assert.equal(license.max_activations, 1)
  assert.equal(license.status, 'exhausted')
  assert.equal(binding.status, 'active')
  assert.ok(binding.created_at)
  assert.equal(profile.license_status, 'active')
  assert.equal(profile.license_expires_at, binding.expires_at)

  const duplicate = await requestJson('/api/license/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: generatedLicense.code })
  }, userCookies)
  assert.equal(duplicate.response.status, 409)
  assert.equal(duplicate.data.code, 'USER_ALREADY_ACTIVE')

  process.stdout.write(`${JSON.stringify({
    success: true,
    adminLogin: adminLogin.response.status,
    generatedLicenseStatus: generatedLicense.status,
    userLoginRedirect: userLogin.data.redirectTo,
    activationStatus: activation.response.status,
    activationCount: license.activation_count,
    finalLicenseStatus: license.status,
    bindingStatus: binding.status,
    profileLicenseStatus: profile.license_status,
    duplicateCode: duplicate.data.code,
    licenseCodePrefix: license.code_prefix
  }, null, 2)}\n`)
} finally {
  if (licenseId) {
    const { error } = await service.from('license_codes').delete().eq('id', licenseId)
    if (error) console.error('Failed to clean up E2E license:', error.message)
  }
  if (userId) {
    const { error } = await service.auth.admin.deleteUser(userId)
    if (error) console.error('Failed to clean up E2E user:', error.message)
  }
  if (adminUserId) {
    const { error } = await service.auth.admin.deleteUser(adminUserId)
    if (error) console.error('Failed to clean up E2E admin:', error.message)
  }
}
