import { GlassPanel } from '@/components/stitch-ui'

const sections = [
  ['服务说明', 'IELTS Writing 是面向雅思写作学习的桌面软件，提供题目练习、AI批改、历史记录和学习分析等功能。'],
  ['软件授权范围', '用户获得的是在授权设备上使用本软件的非独占、不可转让许可，不代表取得软件源代码、商标或其他知识产权。'],
  ['激活码使用规则', '激活码仅限购买或获授权的用户本人使用，并受设备数量、有效期和版本支持范围限制。'],
  ['禁止共享、转售或破解激活码', '不得共享、出租、转售、公开发布、逆向破解或绕过激活码与设备绑定机制。'],
  ['AI批改仅供学习参考', 'AI生成的批改、建议、范文和评分解释用于辅助学习，不能替代教师、考试机构或专业人士判断。'],
  ['IELTS分数为模拟估分', '软件显示的 IELTS 分数是基于模型输出的模拟估分，不代表 IELTS 官方成绩，也不保证实际考试结果。'],
  ['用户应自行核实重要内容', '涉及考试报名、成绩要求、院校申请或其他重要决定时，用户应自行核实官方信息。'],
  ['服务中断', '服务可能因维护、网络、系统更新、第三方AI服务或授权服务器异常而暂时中断。'],
  ['用户内容与知识产权', '用户保留自己作文内容的权利。用户应确保提交内容不侵犯他人权益，并允许软件在提供批改功能所必需的范围内处理内容。'],
  ['禁止滥用系统', '不得攻击、干扰、绕过限制、批量滥用、抓取接口或以异常方式消耗服务资源。'],
  ['软件更新与版本支持', '软件可能发布更新以修复问题、改进体验或调整服务。旧版本可能停止维护或要求升级后继续使用。'],
  ['责任限制', '在法律允许范围内，软件及开发者不对因使用或无法使用本软件导致的间接损失、考试结果差异或第三方服务问题承担责任。'],
  ['服务终止', '若用户违反条款、共享激活码、攻击系统或绕过限制，开发者可暂停或终止相关授权与服务。'],
  ['条款更新', '条款可能随产品功能、服务方式或法律要求变化而更新。继续使用软件视为接受更新后的条款。'],
  ['联系方式', '如有问题，请通过 support@nightwish.ai 联系开发者。'],
  ['生效日期', '本条款自 2026年6月 起生效。']
]

export default function TermsPage() {
  return (
    <main className="stitch-page" data-main-content tabIndex={-1}>
      <section className="legal-main">
        <header className="page-section-header">
          <div>
            <h1 className="stitch-title-headline">服务条款</h1>
            <p className="stitch-body-lg">最后更新：2026年6月</p>
          </div>
        </header>
        <GlassPanel className="legal-card">
          {sections.map(([title, body], index) => (
            <section key={title} className="legal-section">
              <h2>{index + 1}. {title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </GlassPanel>
      </section>
    </main>
  )
}
