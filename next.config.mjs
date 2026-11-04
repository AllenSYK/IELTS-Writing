/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb'
    },
    optimizePackageImports: ['lucide-react', 'recharts']
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/practice',
        permanent: false
      }
    ]
  },
  async headers() {
    return [
      {
        source: '/billing/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === 'development' ? "'unsafe-eval' " : ''}https://*.stripe.com https://*.link.com`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://*.stripe.com",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stripe.com https://*.link.com",
              "frame-src https://*.stripe.com https://*.link.com",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              "form-action 'self' https://checkout.stripe.com https://billing.stripe.com"
            ].join('; ')
          },
          { key: 'X-Frame-Options', value: 'DENY' }
        ]
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'same-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ]
      },
      {
        source: '/admin/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store'
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          }
        ]
      },
      {
        source: '/api/admin/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store'
          }
        ]
      }
    ]
  }
}

export default nextConfig
