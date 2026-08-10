const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

test('declares four local-first tab pages and all page files exist', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  assert.equal(app.tabBar.list.length, 4)
  const pagePaths = app.pages.concat(app.subpackages.flatMap((sub) => sub.pages.map((page) => `${sub.root}/${page}`)))
  pagePaths.forEach((page) => ['js', 'json', 'wxml', 'wxss'].forEach((extension) => {
    assert.equal(fs.existsSync(path.join(root, `${page}.${extension}`)), true, `${page}.${extension} should exist`)
  }))
})

test('ships the complete local USDA nutrition database in a subpackage', () => {
  const data = require(path.join(root, 'nutrition/data/nutrition-foods.js'))
  assert.ok(data.count >= 7000)
  assert.equal(data.foods.length, data.count)
})

test('business backup source never includes the saved API key or logs', () => {
  const source = fs.readFileSync(path.join(root, 'utils/backup.js'), 'utf8')
  const businessExport = source.slice(source.indexOf('async function createBackup'), source.indexOf('function unzip'))
  assert.match(businessExport, /settings:\s*\{ debugMode: settings\.debugMode, nutrition: settings\.nutrition \}/)
  assert.doesNotMatch(businessExport, /settings\.ai\.apiKey/)
  assert.doesNotMatch(businessExport, /logStore\.all\(\)/)
})

test('keeps the main package and nutrition subpackage within WeChat size limits', () => {
  function sizeOf(directory, ignored) {
    return fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
      const target = path.join(directory, entry.name)
      if (ignored(target, entry)) return sum
      return sum + (entry.isDirectory() ? sizeOf(target, ignored) : fs.statSync(target).size)
    }, 0)
  }
  const nutritionRoot = path.join(root, 'nutrition')
  const mainSize = sizeOf(root, (target) => target === nutritionRoot || target.includes(`${path.sep}tests${path.sep}`) || ['README.md', 'DEVELOPMENT.md', 'package.json', 'project.private.config.json'].includes(path.basename(target)))
  const nutritionSize = sizeOf(nutritionRoot, () => false)
  assert.ok(mainSize < 2 * 1024 * 1024, `main package is ${mainSize} bytes`)
  assert.ok(nutritionSize < 2 * 1024 * 1024, `nutrition subpackage is ${nutritionSize} bytes`)
})
