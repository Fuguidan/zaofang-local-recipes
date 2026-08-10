const assert = require('node:assert/strict')
const test = require('node:test')

const storage = new Map()
let lastRequest
global.wx = {
  env: { USER_DATA_PATH: '/mock-user-data' },
  getStorageSync(key) { return storage.has(key) ? structuredClone(storage.get(key)) : '' },
  setStorageSync(key, value) { storage.set(key, structuredClone(value)) },
  getFileSystemManager() {
    return { readFile({ success }) { success({ data: 'c2FmZS1pbWFnZS1ieXRlcw==' }) } }
  },
  request(options) {
    lastRequest = options
    options.success({
      statusCode: 200,
      data: {
        choices: [{ message: { content: JSON.stringify({ name: '青椒炒牛肉', ingredients: [{ name: '牛肉', grams: 200 }], steps: ['炒熟'], meals: ['dinner'], flavors: ['鲜香'], tags: ['高蛋白'], dietType: '荤菜', duration: 20, difficulty: '简单' }) } }],
        usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200, completion_tokens_details: { reasoning_tokens: 20 } },
      },
    })
  },
}

const { initializeStorage, logStore } = require('../utils/storage')
const { generateRecipeDraft } = require('../utils/ai')

const config = { enabled: true, endpoint: 'https://example.com/v1/chat/completions', model: 'vision-model', apiKey: 'TEST_KEY_DO_NOT_USE', thinkingEnabled: false }

test('supports image-only recipe recognition and sends a model-friendly JPEG data URL', async () => {
  storage.clear()
  initializeStorage()
  const draft = await generateRecipeDraft({ mode: 'image', imagePath: '/tmp/dish.jpg', config, estimatePeople: 2 })
  assert.equal(draft.name, '青椒炒牛肉')
  const content = lastRequest.data.messages[1].content
  assert.equal(Array.isArray(content), true)
  assert.match(content[1].image_url.url, /^data:image\/jpeg;base64,/)
  assert.match(content[0].text, /请结合当前图片识别菜名/)
  const logs = JSON.stringify(logStore.all())
  assert.match(logs, /菜名=青椒炒牛肉/)
  assert.doesNotMatch(logs, /TEST_KEY_DO_NOT_USE|c2FmZS1pbWFnZS1ieXRlcw/)
})

test('text-only generation does not attach an image payload', async () => {
  storage.clear()
  initializeStorage()
  await generateRecipeDraft({ mode: 'text', name: '红烧肉', config, estimatePeople: 2 })
  assert.equal(typeof lastRequest.data.messages[1].content, 'string')
  assert.match(lastRequest.data.messages[1].content, /菜品名称：红烧肉/)
  assert.doesNotMatch(lastRequest.data.messages[1].content, /image_url/)
})
