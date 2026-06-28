import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const visualTypeMap = {
  line_chart: 'line',
  bar_chart: 'bar',
  pie_chart: 'pie',
  table: 'table',
  map: 'map',
  process_diagram: 'process',
  mixed_charts: 'mixed',
  multiple_charts: 'mixed'
}

const completenessMap = {
  complete: 'complete',
  mostly_complete: 'mostly_complete',
  partial: 'partial',
  summary_only: 'summary_only',
  missing: 'missing'
}

async function main() {
  const filePath = resolve(process.argv[2] || 'ielts_task1_admin_import.json')
  const raw = readFileSync(filePath, 'utf-8')
  const items = JSON.parse(raw)

  const adminId = process.argv[3]
  if (!adminId) {
    console.error('Usage: node scripts/import-task1-questions.mjs <json-file> <admin-user-id>')
    process.exit(1)
  }

  console.log(`Importing ${items.length} Task 1 questions...`)

  let success = 0
  let failed = 0

  for (const item of items) {
    const visualTypes = (item.visual_type || []).map(v => visualTypeMap[v] || v)
    const completeness = completenessMap[item.completeness] || 'partial'

    const title = item.title || `Task 1 - ${visualTypes.join('+')}`

    const row = {
      status: 'draft',
      task_type: 'task1_academic',
      title,
      question_text: item.question_text || '',
      summary: item.question_text ? item.question_text.slice(0, 200) : '',
      source_type: 'recalled',
      source_year: 2026,
      source_name: item.source_label || null,
      frequency_level: 'normal',
      frequency_source: 'admin',
      topics: [],
      keywords: [],
      task1_visual_types: visualTypes,
      task1_visual_data: item.data || null,
      completeness,
      missing_fields: [],
      uncertainties: item.uncertainties || [],
      exam_date: '2026-06-27',
      exam_session: 'unknown',
      exam_mode: 'paper',
      created_by: adminId
    }

    const { error } = await service
      .from('past_paper_questions')
      .upsert(row, { onConflict: 'id', ignoreDuplicates: false })

    if (error) {
      const { error: insertError } = await service
        .from('past_paper_questions')
        .insert(row)

      if (insertError) {
        console.error(`FAIL [${item.id}]: ${insertError.message}`)
        failed++
        continue
      }
    }

    console.log(`OK   [${item.id}] ${title}`)
    success++
  }

  console.log(`\nDone: ${success} imported, ${failed} failed`)
}

main().catch(console.error)
