'use client'

import { MaterialIcon } from '@/components/app-ui'
import type { PracticeRecommendation } from '@/lib/learning-analytics'

export function PracticePlan({ recommendations }: { recommendations: PracticeRecommendation[] }) {
  return (
    <section className="practice-plan" aria-label="个性化练习计划">
      <div className="practice-plan-header">
        <span className="plan-icon">
          <MaterialIcon name="auto_awesome" size={30} />
        </span>
        <div>
          <h2 className="ui-title-headline">个性化练习计划</h2>
          <p className="ui-body-md">根据真实错误分布，优先练习最影响分数的薄弱项。</p>
        </div>
      </div>

      {recommendations.length > 0 ? (
        <>
          <div className="practice-plan-summary">
            <span>本周重点</span>
            <strong>{recommendations.slice(0, 2).map((item) => item.title.replace('练习主题：', '')).join('、')}</strong>
          </div>
          <div className="practice-card-grid">
            {recommendations.map((item) => (
              <article className="practice-card" key={item.key}>
                <div className="practice-card-top">
                  <h3 className="ui-title-md">{item.title}</h3>
                  <span className="status">{item.status}</span>
                </div>
                <p className="ui-body-md">推荐原因：{item.reason}</p>
                <dl className="practice-meta-list">
                  <div>
                    <dt>预计用时</dt>
                    <dd>{item.duration}</dd>
                  </div>
                  <div>
                    <dt>难度</dt>
                    <dd>{item.difficulty}</dd>
                  </div>
                  <div>
                    <dt>完成进度</dt>
                    <dd>0%</dd>
                  </div>
                </dl>
                <a className="ui-primary-button" href={item.href}>
                  开始练习
                  <MaterialIcon name="arrow_forward" size={16} />
                </a>
              </article>
            ))}
          </div>
          <div className="next-step-box">
            <MaterialIcon name="flag" size={18} />
            <span>下一步建议：先完成错误最多的练习，再提交一篇同类型作文验证改进效果。</span>
          </div>
        </>
      ) : (
        <div className="practice-plan-empty">
          <MaterialIcon name="assignment" size={24} />
          <p>完成更多作文批改后，系统会为你生成个性化练习计划。</p>
        </div>
      )}
    </section>
  )
}
