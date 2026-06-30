import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text
} from '@react-email/components'
import type { CSSProperties } from 'react'
import { emailBrand } from '@/lib/email/brand'

type PasswordResetEmailProps = {
  resetUrl: string
  expiresInMinutes?: number
}

const styles: Record<string, CSSProperties> = {
  body: {
    margin: 0,
    backgroundColor: '#f3f7fb',
    color: '#111827',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif'
  },
  outer: {
    width: '100%',
    padding: '36px 12px'
  },
  container: {
    width: '100%',
    maxWidth: '560px',
    margin: '0 auto',
    border: '1px solid #e4eaf2',
    borderRadius: '24px',
    backgroundColor: '#ffffff',
    boxShadow: '0 24px 70px rgba(15, 23, 42, 0.10)',
    overflow: 'hidden'
  },
  header: {
    padding: '30px 34px 18px',
    backgroundColor: '#fbfdff'
  },
  logoWrap: {
    display: 'inline-block',
    padding: '9px 12px',
    border: '1px solid #e7edf6',
    borderRadius: '16px',
    backgroundColor: '#ffffff'
  },
  brandText: {
    display: 'inline-block',
    marginLeft: '10px',
    color: '#172033',
    fontSize: '16px',
    fontWeight: 700,
    verticalAlign: 'middle'
  },
  content: {
    padding: '10px 34px 34px'
  },
  eyebrow: {
    margin: '0 0 10px',
    color: emailBrand.primaryColor,
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.02em'
  },
  heading: {
    margin: '0 0 14px',
    color: '#0f172a',
    fontSize: '30px',
    lineHeight: '1.22',
    fontWeight: 760
  },
  text: {
    margin: '0 0 16px',
    color: '#475569',
    fontSize: '16px',
    lineHeight: '1.7'
  },
  button: {
    display: 'inline-block',
    margin: '14px 0 8px',
    padding: '13px 22px',
    borderRadius: '14px',
    backgroundColor: emailBrand.primaryColor,
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 700,
    textDecoration: 'none'
  },
  fallback: {
    margin: '18px 0 0',
    padding: '14px 16px',
    borderRadius: '14px',
    backgroundColor: '#f8fafc',
    border: '1px solid #edf2f7',
    color: '#64748b',
    fontSize: '13px',
    lineHeight: '1.7',
    wordBreak: 'break-all'
  },
  footer: {
    padding: '22px 34px 30px',
    backgroundColor: '#fbfdff'
  },
  footerText: {
    margin: '0 0 8px',
    color: '#7b8798',
    fontSize: '12px',
    lineHeight: '1.6',
    textAlign: 'center'
  },
  link: {
    color: emailBrand.primaryColor,
    textDecoration: 'none'
  }
}

export function PasswordResetEmail({ resetUrl, expiresInMinutes = 60 }: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>重设您的 {emailBrand.productName} 密码。</Preview>
      <Body style={styles.body}>
        <Section style={styles.outer}>
          <Container style={styles.container}>
            <Section style={styles.header}>
              <span style={styles.logoWrap}>
                <Img src={emailBrand.logoUrl} width="34" height="34" alt={emailBrand.productName} />
              </span>
              <span style={styles.brandText}>{emailBrand.productName}</span>
            </Section>
            <Section style={styles.content}>
              <Text style={styles.eyebrow}>密码重置</Text>
              <Heading as="h1" style={styles.heading}>重设您的密码</Heading>
              <Text style={styles.text}>
                我们收到了重设 {emailBrand.productName} 账号密码的请求。点击下方按钮即可设置新密码，链接将在 {expiresInMinutes} 分钟后失效。
              </Text>
              <Button href={resetUrl} style={styles.button}>重设密码</Button>
              <Text style={styles.text}>如果这不是您的操作，可以忽略本邮件，原密码不会被修改。</Text>
              <Text style={styles.fallback}>按钮无法打开时，请复制此链接到浏览器：{resetUrl}</Text>
            </Section>
            <Hr style={{ borderColor: '#edf2f7', margin: 0 }} />
            <Section style={styles.footer}>
              <Text style={styles.footerText}>
                <Link href={emailBrand.websiteUrl} style={styles.link}>{emailBrand.websiteUrl}</Link>
                {' · '}
                <Link href={`mailto:${emailBrand.supportEmail}`} style={styles.link}>{emailBrand.supportEmail}</Link>
              </Text>
              <Text style={styles.footerText}>{emailBrand.copyrightText}</Text>
            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  )
}

export default PasswordResetEmail
