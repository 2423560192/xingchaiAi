#!/usr/bin/env node
/**
 * Merge two conflicted i18n locale JSON files (union of keys, ours wins on conflicts).
 *
 * Usage: node merge-i18n-json.js <ours.json> <theirs.json> <output.json>
 */
const fs = require('fs')

function mergeValue(ours, theirs) {
  if (typeof ours === 'object' && ours !== null && !Array.isArray(ours) &&
      typeof theirs === 'object' && theirs !== null && !Array.isArray(theirs)) {
    const out = { ...ours }
    for (const key of Object.keys(theirs)) {
      if (!(key in out)) {
        out[key] = theirs[key]
      } else {
        out[key] = mergeValue(out[key], theirs[key])
      }
    }
    return out
  }
  return ours
}

const [oursPath, theirsPath, outPath] = process.argv.slice(2)
if (!oursPath || !theirsPath || !outPath) {
  console.error('usage: node merge-i18n-json.js <ours.json> <theirs.json> <output.json>')
  process.exit(2)
}

const ours = JSON.parse(fs.readFileSync(oursPath, 'utf8'))
const theirs = JSON.parse(fs.readFileSync(theirsPath, 'utf8'))
const merged = mergeValue(ours, theirs)
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n', 'utf8')

const count = (obj) =>
  obj && typeof obj === 'object' && obj.translation
    ? Object.keys(obj.translation).length
    : Object.keys(obj || {}).length
console.log(
  `merged ${outPath}: ours=${count(ours)} theirs=${count(theirs)} result=${count(merged)}`
)
