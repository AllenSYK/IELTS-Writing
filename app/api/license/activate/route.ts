import { json } from '@/lib/http'

export async function POST() {
  return json({ success: false, code: 'ACTIVATION_RETIRED', message: '激活码功能已停用，请前往会员中心查看权益和订阅。', redirectTo: '/billing' }, { status: 410 })
}
