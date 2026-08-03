type ScoreLaurelProps = {
  score: number | string
}

function LaurelBranch({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 52 104"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M44 98C25 84 15 65 15 43C15 24 23 11 35 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="currentColor">
        <ellipse cx="30" cy="84" rx="3.8" ry="8.5" transform="rotate(-48 30 84)" />
        <ellipse cx="19" cy="73" rx="3.7" ry="8" transform="rotate(-32 19 73)" />
        <ellipse cx="29" cy="64" rx="3.6" ry="7.8" transform="rotate(48 29 64)" />
        <ellipse cx="17" cy="53" rx="3.5" ry="7.6" transform="rotate(-22 17 53)" />
        <ellipse cx="27" cy="42" rx="3.4" ry="7.4" transform="rotate(54 27 42)" />
        <ellipse cx="20" cy="30" rx="3.2" ry="7" transform="rotate(-8 20 30)" />
        <ellipse cx="31" cy="20" rx="3.1" ry="6.8" transform="rotate(48 31 20)" />
      </g>
    </svg>
  )
}

export function ScoreLaurel({ score }: ScoreLaurelProps) {
  return (
    <div className="result-score-laurel">
      <LaurelBranch className="result-score-laurel-branch result-score-laurel-branch-left" />
      <strong className="result-score-value">{score}</strong>
      <LaurelBranch className="result-score-laurel-branch result-score-laurel-branch-right" />
    </div>
  )
}
