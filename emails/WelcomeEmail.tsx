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

type WelcomeEmailProps = {
  loginUrl?: string
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
    margin: '12px 0 2px',
    padding: '13px 22px',
    borderRadius: '14px',
    backgroundColor: emailBrand.primaryColor,
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 700,
    textDecoration: 'none'
  },
  note: {
    margin: '20px 0 0',
    padding: '16px 18px',
    borderRadius: '16px',
    backgroundColor: '#f8fafc',
    border: '1px solid #edf2f7',
    color: '#64748b',
    fontSize: '14px',
    lineHeight: '1.7'
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

export function WelcomeEmail({ loginUrl = `${emailBrand.websiteUrl}/login` }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>欢迎加入 {emailBrand.productName}，登录后输入激活码即可开始使用。</Preview>
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
              <Heading as="h1" style={styles.heading}>账号已创建</Heading>
              <Text style={styles.text}>欢迎加入 {emailBrand.productName}。您的邮箱已经完成验证，现在可以登录账号并输入软件激活码开通使用权限。</Text>
              <Button href={loginUrl} style={styles.button}>前往登录</Button>
              <Text style={styles.note}>邮箱验证码只用于证明注册邮箱属于您；软件激活码用于开通网站功能，两者彼此独立。</Text>
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

export default WelcomeEmail
