// 本地预检 DSH 插件索引：把 DSH 在读取索引时拒绝的规则先跑一遍。
// 用法: node verify-index.mjs [index.json]
// 退出码 0 = 通过；1 = 有错误（错误路径按 DSH 的 "$.a.b" 形式给出）
import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? new URL('./index.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const errors = []
const E = (path, msg) => errors.push(`${path}: ${msg}`)

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isSemver = (v) => typeof v === 'string' && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(v)
const isHttps = (v) => typeof v === 'string' && /^https:\/\//i.test(v)
const NAME_SEG = /^[A-Za-z0-9._@+-]+$/
const NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/

function checkText(v, path) {
  if (typeof v === 'string') return
  if (isObj(v)) {
    if (typeof v.en !== 'string' || v.en.length === 0) E(path, 'LocalizedText 必须含非空 en')
    for (const k of Object.keys(v)) {
      if (typeof v[k] !== 'string') E(`${path}.${k}`, 'LocalizedText 的值必须是字符串')
      if (!/^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(k) && k !== 'en') E(`${path}.${k}`, '语言 id 必须是小写，如 en / zh')
    }
    return
  }
  E(path, '必须是字符串或 LocalizedText 对象')
}

function checkDirPath(v, path) {
  if (typeof v !== 'string' || v.length === 0) return E(path, '必须是相对目录字符串')
  if (/^[\\/]/.test(v)) return E(path, '不能是绝对路径')
  for (const seg of v.split(/[\\/]/)) {
    if (seg === '.' || seg === '..') return E(path, '不能包含 . 或 .. 段（仓库根包请省略 path）')
    if (!NAME_SEG.test(seg)) return E(path, `非法段 "${seg}"，只允许字母、数字和 ._@+-`)
  }
}

let raw
try {
  raw = readFileSync(file, 'utf8')
} catch (error) {
  console.error(`读取失败: ${file} (${error.message})`)
  process.exit(1)
}

let doc
try {
  doc = JSON.parse(raw)
} catch (error) {
  console.error(`JSON 解析失败: ${error.message}`)
  process.exit(1)
}

if (!isObj(doc)) E('$', '顶层必须是对象')
if (doc.format !== 1) E('$.format', '必须等于 1')
if (doc.title === undefined) E('$.title', '必填')
else checkText(doc.title, '$.title')
if (doc.description !== undefined) checkText(doc.description, '$.description')
if (!Array.isArray(doc.plugins) || doc.plugins.length === 0) E('$.plugins', '必须是非空数组')

const seen = new Set()
;(doc.plugins ?? []).forEach((p, i) => {
  const base = `$.plugins[${i}]`
  if (!isObj(p)) return E(base, '必须是对象')
  if (typeof p.name !== 'string' || !NAME_RE.test(p.name)) E(`${base}.name`, '必填且必须是合法 npm 包名')
  else if (seen.has(p.name)) E(`${base}.name`, `包名重复: ${p.name}`)
  else seen.add(p.name)
  for (const key of ['title', 'description']) if (p[key] !== undefined) checkText(p[key], `${base}.${key}`)
  if (p.icon !== undefined) {
    const ok = typeof p.icon === 'string' && (p.icon.startsWith('data:') || isHttps(p.icon) || !/^[a-z]+:/i.test(p.icon))
    if (!ok) E(`${base}.icon`, '必须是 data: URL、https: URL 或相对路径')
  }
  if (p.homepage !== undefined && !isHttps(p.homepage)) E(`${base}.homepage`, '必须是 https: URL')
  if (p.repository !== undefined) {
    if (!isObj(p.repository) || !isHttps(p.repository.url)) E(`${base}.repository.url`, '必须是 https: URL')
  }
  if (!Array.isArray(p.versions) || p.versions.length === 0) return E(`${base}.versions`, '必须是非空数组')
  p.versions.forEach((v, j) => {
    const vb = `${base}.versions[${j}]`
    if (!isObj(v)) return E(vb, '必须是对象')
    if (!isSemver(v.version)) E(`${vb}.version`, '必须是 semver，如 1.5.0')
    if (v.publishTimestamp !== undefined && (typeof v.publishTimestamp !== 'number' || !Number.isFinite(v.publishTimestamp))) {
      E(`${vb}.publishTimestamp`, '必须是数字（Unix 秒）')
    }
    const src = v.source
    if (!isObj(src)) return E(`${vb}.source`, '必填对象')
    if (src.type !== 'npm' && src.type !== 'git') E(`${vb}.source.type`, '当前只接受 npm 或 git')
    if (src.type === 'git') {
      if (!isHttps(src.url)) E(`${vb}.source.url`, 'git source 必须给 https: 仓库 URL')
      if (!/^[0-9a-f]{40}$/.test(String(src.commit))) E(`${vb}.source.commit`, '必须是 40 位十六进制 commit')
      if (src.path !== undefined) checkDirPath(src.path, `${vb}.source.path`)
    }
    if (src.type === 'npm' && src.registry !== undefined && !isHttps(src.registry)) E(`${vb}.source.registry`, '必须是 https: URL')
    if (v.engines !== undefined) {
      if (!isObj(v.engines)) E(`${vb}.engines`, '必须是对象')
      else if (v.engines.dsh !== undefined && typeof v.engines.dsh !== 'string') E(`${vb}.engines.dsh`, '必须是字符串')
    }
  })
})

if (errors.length > 0) {
  console.error(`FAIL ${file}`)
  for (const e of errors) console.error(`  ${e}`)
  process.exit(1)
}
console.log(`PASS ${file} — ${doc.plugins.length} plugin(s), format ${doc.format}`)
for (const p of doc.plugins) console.log(`  - ${p.name} (${p.versions.map((v) => v.version).join(', ')})`)
