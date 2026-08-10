const { AppError } = require('./errors')
const { randomId } = require('./id')
const { logger } = require('./logger')
const { readImageDataUrl, isAiSupportedPath } = require('./image')
const { suggestIngredientNutrition } = require('./nutrition')

const SYSTEM_PROMPT = `你是菜谱结构化助手。根据用户提供的菜品图片、菜品名称或补充文字生成菜谱草稿，仅返回JSON：
{"name":"","description":"","ingredients":[{"name":"","amount":"","unit":"","grams":100,"note":""}],"steps":[""],"meals":["breakfast|lunch|dinner"],"flavors":["清淡|辛辣|酸甜|咸鲜|麻辣|鲜香"],"tags":[],"dietType":"荤菜|素菜|主食|汤羹","duration":30,"difficulty":"简单|适中|进阶"}。grams 是可食用重量估计，无法判断时省略。不要返回Markdown。`

const FAILURE_SUGGESTIONS = {
  auth_failed: '鉴权失败，请检查 API Key 和接口是否属于同一家服务。',
  rate_limited: '请求被限流或额度不足，请稍后重试。',
  domain_or_network: '小程序无法连接模型接口。请在微信公众平台配置 request 合法域名，并检查手机网络和接口地址。',
  vision_not_supported: '接口可连接，但模型不支持图片。可改用“仅文字生成”。',
  bad_response: '模型返回格式不兼容，请确认使用 OpenAI-compatible Chat Completions 接口。',
  bad_recipe_json: '模型返回了文字，但不是可解析的菜谱 JSON。',
}

class AIError extends AppError {
  constructor(failure, detail, status) {
    super('NETWORK', detail || FAILURE_SUGGESTIONS[failure])
    this.failure = failure
    this.status = status
    this.suggestion = FAILURE_SUGGESTIONS[failure]
  }
}

function normalizeEndpoint(endpoint) {
  let value = String(endpoint || '').trim().replace(/\/+$/, '')
  if (/\/(?:compatible-mode\/)?v1$/i.test(value)) value += '/chat/completions'
  return value
}

function normalizeConfig(config) {
  const endpoint = normalizeEndpoint(config.endpoint)
  let model = String(config.model || '').trim()
  if (/dashscope(?:-[a-z]+)?\.aliyuncs\.com/i.test(endpoint) && model.toLowerCase() === 'qwen3.7-flash') model = 'qwen3.6-flash'
  return { ...config, endpoint, model, apiKey: String(config.apiKey || '').trim() }
}

function supportsThinking(endpoint) {
  return /aliyuncs\.com/i.test(String(endpoint || ''))
}

function wxRequest(config, body) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.endpoint,
      method: 'POST',
      timeout: 120000,
      header: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      data: body,
      success: resolve,
      fail: (error) => reject(new AIError('domain_or_network', error.errMsg || '网络请求失败')),
    })
  })
}

function remoteMessage(data) {
  if (!data) return ''
  if (typeof data === 'string') return data.slice(0, 180)
  return String((data.error && data.error.message) || data.message || '').slice(0, 180)
}

function extractContent(body) {
  if (!body || typeof body !== 'object') return ''
  if (typeof body.output_text === 'string') return body.output_text.trim()
  const choices = Array.isArray(body.choices) ? body.choices : []
  for (const choice of choices) {
    const message = choice && choice.message
    if (message && typeof message.content === 'string') return message.content.trim()
    if (message && Array.isArray(message.content)) {
      const text = message.content.map((part) => typeof part === 'string' ? part : part && (part.text || part.content || '')).filter(Boolean).join('\n')
      if (text) return text.trim()
    }
    if (choice && typeof choice.text === 'string') return choice.text.trim()
  }
  const output = Array.isArray(body.output) ? body.output : []
  for (const item of output) {
    const content = item && item.content
    if (Array.isArray(content)) {
      const text = content.map((part) => part && (part.text || part.content || '')).filter(Boolean).join('\n')
      if (text) return text.trim()
    }
  }
  return ''
}

function usageOf(body) {
  const usage = body && body.usage
  if (!usage) return { available: false }
  const number = (value) => Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined
  const inputTokens = number(usage.prompt_tokens) !== undefined ? number(usage.prompt_tokens) : number(usage.input_tokens)
  const outputTokens = number(usage.completion_tokens) !== undefined ? number(usage.completion_tokens) : number(usage.output_tokens)
  const details = usage.completion_tokens_details || usage.output_tokens_details || {}
  const reasoningTokens = number(details.reasoning_tokens)
  const answerTokens = outputTokens !== undefined && reasoningTokens !== undefined ? Math.max(0, outputTokens - reasoningTokens) : undefined
  const totalTokens = number(usage.total_tokens) !== undefined ? number(usage.total_tokens) : inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined
  return { inputTokens, outputTokens, reasoningTokens, answerTokens, totalTokens, available: totalTokens !== undefined || inputTokens !== undefined || outputTokens !== undefined }
}

function formatUsage(dishName, usage) {
  const safeName = String(dishName || '未识别菜名').replace(/[\r\n；;]/g, ' ').trim().slice(0, 60) || '未识别菜名'
  const value = (tokens) => tokens === undefined ? '服务未提供' : String(tokens)
  return `菜名=${safeName}；输入=${value(usage.inputTokens)} token；输出=${value(usage.outputTokens)} token；思考=${value(usage.reasoningTokens)} token；回答=${value(usage.answerTokens)} token；总计=${value(usage.totalTokens)} token`
}

async function send(config, body) {
  const response = await wxRequest(config, body)
  const status = Number(response.statusCode)
  if (status < 200 || status >= 300) {
    const detail = remoteMessage(response.data) || `接口返回 ${status}`
    if (status === 401 || status === 403) throw new AIError('auth_failed', detail, status)
    if (status === 429) throw new AIError('rate_limited', detail, status)
    if ((status === 400 || status === 422) && /image|vision|visual|multimodal|图片|视觉/i.test(detail)) throw new AIError('vision_not_supported', detail, status)
    throw new AIError('bad_response', detail, status)
  }
  const content = extractContent(response.data)
  if (!content) throw new AIError('bad_response', `未找到模型文本字段（${Object.keys(response.data || {}).slice(0, 6).join(',') || '空响应'}）`, status)
  return { content, usage: usageOf(response.data), status }
}

function normalizeDraft(raw) {
  const meals = new Set(['breakfast', 'lunch', 'dinner'])
  const flavors = new Set(['清淡', '辛辣', '酸甜', '咸鲜', '麻辣', '鲜香'])
  const diets = new Set(['荤菜', '素菜', '主食', '汤羹'])
  const difficulties = new Set(['简单', '适中', '进阶'])
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients.filter((item) => item && typeof item.name === 'string').map((item) => suggestIngredientNutrition({
      id: randomId('ingredient'), name: item.name, amount: String(item.amount || ''), unit: String(item.unit || ''), grams: Number(item.grams) > 0 ? Number(item.grams) : '', note: String(item.note || ''),
    })) : [],
    steps: Array.isArray(raw.steps) ? raw.steps.filter((item) => typeof item === 'string') : [],
    meals: Array.isArray(raw.meals) ? raw.meals.filter((item) => meals.has(item)) : [],
    flavors: Array.isArray(raw.flavors) ? raw.flavors.filter((item) => flavors.has(item)) : [],
    tags: Array.isArray(raw.tags) ? raw.tags.filter((item) => typeof item === 'string') : [],
    dietType: diets.has(raw.dietType) ? raw.dietType : '荤菜',
    duration: Number.isFinite(raw.duration) ? raw.duration : 30,
    difficulty: difficulties.has(raw.difficulty) ? raw.difficulty : '简单',
  }
}

function ensureConfig(config) {
  const normalized = normalizeConfig(config || {})
  if (!normalized.enabled) throw new AppError('NETWORK', '请先在设置中打开“允许使用 AI 生成”')
  if (!normalized.endpoint || !normalized.model || !normalized.apiKey) throw new AppError('NETWORK', '请先完整填写接口地址、模型名和 API Key')
  return normalized
}

async function generateRecipeDraft(options) {
  const operationId = randomId('ai')
  const started = Date.now()
  const config = ensureConfig(options.config)
  const hasImage = options.mode !== 'text' && options.imagePath && isAiSupportedPath(options.imagePath)
  const name = String(options.name || '').trim()
  const description = String(options.description || '').trim()
  if (!hasImage && !name && !description) throw new AppError('VALIDATION', '请先上传可用于 AI 的图片，或填写菜名/原始说明')
  try {
    const people = Math.max(1, Math.min(20, Math.round(Number(options.estimatePeople) || 2)))
    const text = [
      name ? `菜品名称：${name}` : '',
      description ? `补充说明：${description}` : '',
      `请按 ${people} 人正常一餐的用量估算每项食材可食用克数 grams。`,
      hasImage ? '请结合当前图片识别菜名并生成菜谱。' : '请根据文字生成菜谱。',
    ].filter(Boolean).join('\n')
    const dataUrl = hasImage ? await readImageDataUrl(options.imagePath) : undefined
    const body = {
      model: config.model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: dataUrl ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: dataUrl } }] : text },
      ],
    }
    if (supportsThinking(config.endpoint)) body.enable_thinking = Boolean(options.thinkingEnabled)
    const completion = await send(config, body)
    let draft
    try {
      draft = normalizeDraft(JSON.parse(completion.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()))
    } catch (error) {
      logger.info('ai', 'recipe_token_usage', { persist: true, operationId, message: formatUsage(name || '未识别菜名', completion.usage) })
      throw new AIError('bad_recipe_json', '模型响应不是有效菜谱 JSON', completion.status)
    }
    logger.info('ai', 'recipe_token_usage', { persist: true, operationId, message: formatUsage(draft.name || name, completion.usage) })
    logger.info('ai', 'recipe_generate_success', { operationId, result: 'success', durationMs: Date.now() - started, message: `mode=${hasImage ? 'image' : 'text'};model=${config.model}` })
    return draft
  } catch (error) {
    logger.warn('ai', 'recipe_generate_failed', { operationId, result: 'failure', durationMs: Date.now() - started, message: error && (error.failure || error.message) })
    throw error
  }
}

async function testTextConnection(rawConfig) {
  const config = ensureConfig(rawConfig)
  const body = { model: config.model, temperature: 0, max_tokens: 16, messages: [{ role: 'user', content: '只回复 OK' }] }
  if (supportsThinking(config.endpoint)) body.enable_thinking = false
  await send(config, body)
  return '文本连接成功'
}

async function testVisionConnection(rawConfig) {
  const config = ensureConfig(rawConfig)
  const testPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAG0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAB4GxvAAAGzQ+5WAAAAAElFTkSuQmCC'
  const body = { model: config.model, temperature: 0, max_tokens: 32, messages: [{ role: 'user', content: [{ type: 'text', text: '这是图片能力测试，请简短确认收到图片。' }, { type: 'image_url', image_url: { url: testPng } }] }] }
  if (supportsThinking(config.endpoint)) body.enable_thinking = false
  await send(config, body)
  return '图片能力连接成功'
}

module.exports = { AIError, normalizeEndpoint, normalizeConfig, supportsThinking, extractContent, usageOf, generateRecipeDraft, testTextConnection, testVisionConnection, FAILURE_SUGGESTIONS }
