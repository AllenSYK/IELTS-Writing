import {
  Body,
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
import type { CSSProperties, ReactNode } from 'react'
import { emailBrand } from '@/lib/email/brand'

type AuthCodeEmailLayoutProps = {
  preview: string
  eyebrow: string
  heading: string
  description: ReactNode
  code: string
  codeHint: ReactNode
  safetyText: ReactNode
}

export const authCodeEmailStyles: Record<string, CSSProperties> = {
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
  logo: {
    width: '34px',
    height: '34px',
    verticalAlign: 'middle'
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
  codeBox: {
    margin: '28px 0',
    padding: '22px 18px',
    border: '1px solid #d8e6ff',
    borderRadius: '18px',
    backgroundColor: '#f5f9ff',
    textAlign: 'center'
  },
  code: {
    display: 'block',
    color: '#0b1220',
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: '38px',
    fontWeight: 800,
    letterSpacing: '0.24em',
    lineHeight: '1',
    textIndent: '0.24em'
  },
  codeHint: {
    margin: '14px 0 0',
    color: '#64748b',
    fontSize: '13px',
    lineHeight: '1.5'
  },
  safety: {
    margin: '22px 0 0',
    padding: '16px 18px',
    borderRadius: '16px',
    backgroundColor: '#f8fafc',
    border: '1px solid #edf2f7'
  },
  safetyTitle: {
    margin: '0 0 6px',
    color: '#172033',
    fontSize: '14px',
    fontWeight: 700
  },
  safetyText: {
    margin: 0,
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

export function AuthCodeEmailLayout({
  preview,
  eyebrow,
  heading,
  description,
  code,
  codeHint,
  safetyText
}: AuthCodeEmailLayoutProps) {
  const styles = authCodeEmailStyles

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Section style={styles.outer}>
          <Container style={styles.container}>
            <Section style={styles.header}>
              <span style={styles.logoWrap}>
                <Img src={emailBrand.logoUrl} width="34" height="34" alt={emailBrand.productName} style={styles.logo} />
              </span>
              <span style={styles.brandText}>{emailBrand.productName}</span>
            </Section>

            <Section style={styles.content}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              <Heading as="h1" style={styles.heading}>{heading}</Heading>
              <Text style={styles.text}>{description}</Text>

              <Section style={styles.codeBox}>
                <Text style={styles.code}>{code}</Text>
                <Text style={styles.codeHint}>{codeHint}</Text>
              </Section>

              <Section style={styles.safety}>
                <Text style={styles.safetyTitle}>安全提示</Text>
                <Text style={styles.safetyText}>{safetyText}</Text>
              </Section>
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
