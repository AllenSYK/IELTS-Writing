import { Resend } from 'resend'

let resendClient: Resend | null = null

export function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is missing.')
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey)
  }

  return resendClient
}
