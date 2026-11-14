/**
 * Side chat Host plugin.
 *
 * Registers `/side <content>`. The side Session is a forked managed subagent
 * child: its inherited prefix is byte-identical to the main Session's completed
 * turns, so the parent's provider cache can be reused. The inherited history is
 * part of the visible transcript (the user asked for fork mode). One scoped
 * runtime-context contribution carries the side-chat control rules: the model
 * sees it, it is appended after the inherited prefix (preserving cache reuse),
 * and the Chat UI does not render it as a message. The child is switched to
 * read-only, hidden from the sidebar by its subagent origin, and titled
 * `侧边：<parent> #<n>`.
 */
import { randomUUID } from 'node:crypto'

const LABEL = '侧边会话'
const RULES_NAME = 'side-chat:rules'
const CONTROL_RULES = [
  '【侧边会话控制规则】',
  '- 父会话历史仅作为参考。',
  '- 默认只做只读或轻量探索。',
  '- 除非用户在当前侧边会话中明确要求修改，否则不得修改文件、Git 状态或配置。',
  '- 即使明确要求，也只做最小范围修改。',
].join('\n')

/** Services this plugin needs before it can activate. */
export const inject = ['commands', 'subagents', 'agents', 'sessionTitle', 'permissionPresets']

/**
 * Fit `prefix + base + suffix` into the title service's byte budget.
 * @param {string} prefix - fixed leading text.
 * @param {string} base - mutable middle text.
 * @param {string} suffix - fixed trailing text.
 * @param {number} maxBytes - the title service's byte cap.
 * @returns {string} a title within budget.
 */
function fitTitle(prefix, base, suffix, maxBytes) {
  let middle = base
  const size = value => Buffer.byteLength(prefix + value + suffix, 'utf8')
  while (middle.length > 0 && size(middle) > maxBytes) middle = middle.slice(0, -1)
  return prefix + middle + suffix
}

/**
 * Register the `/side` command and the scoped rules context.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 */
export function apply(ctx) {
  /** Reserved child Session id -> rules to inject when that Agent is created. */
  const pendingRules = new Map()
  /** Reserved child Session id -> permission preset to mirror at creation. */
  const pendingPresets = new Map()
  /** parent Session id -> number of side chats started in this process. */
  const counts = new Map()

  ctx.on('agent/created', ({ agent }) => {
    const preset = pendingPresets.get(agent.id)
    if (preset !== undefined) {
      pendingPresets.delete(agent.id)
      try {
        ctx.permissionPresets.set(agent.session, preset)
      } catch (error) {
        ctx.logger?.warn?.('side-chat: failed to mirror the session permission preset: %s', String(error))
      }
    }
    const rules = pendingRules.get(agent.id)
    if (rules === undefined) return
    pendingRules.delete(agent.id)
    try {
      const prompt = agent.ctx.systemPrompt ?? agent.ctx.get?.('systemPrompt')
      if (prompt === undefined) return
      agent.ctx.effect(() => prompt.context({
        name: RULES_NAME,
        order: 1500,
        text: rules,
        interpolate: false,
      }), 'side-chat:rules-context')
    } catch (error) {
      ctx.logger?.warn?.('side-chat: failed to inject the control rules: %s', String(error))
    }
  })

  ctx.effect(() => ctx.commands.register({
    name: 'side',
    description: '从当前会话派生侧边会话，复用主会话的上下文。用法：/side <内容>',
    input: { hint: '<内容>' },
    handler: async ({ agent, rawInput }) => {
      const content = rawInput.trim()
      if (content === '') return { kind: 'error', text: '用法：/side <内容>' }
      const parentId = agent.session.header.id
      const number = (counts.get(parentId) || 0) + 1
      counts.set(parentId, number)
      const childId = randomUUID()
      pendingRules.set(childId, CONTROL_RULES)
      // Mirror the parent's current named permission preset on the child so the
      // side chat shows the same permission state as the main session.
      try {
        const preset = ctx.permissionPresets.current(agent.session)
        if (preset !== 'custom') pendingPresets.set(childId, preset)
      } catch (_presetFailure) { /* fall back to the delegated default */ }
      // The child outlives this command call, so it must not inherit the
      // dispatching request's abort signal.
      const lifetime = new AbortController()
      try {
        const activation = await ctx.subagents.startActivation({
          provider: 'fork',
          childId,
          label: LABEL,
          prompt: [{ type: 'text', text: content }],
          parent: agent,
          signal: lifetime.signal,
          delivery: 'caller',
        })
        activation.result.catch(() => {})
        const child = ctx.agents.get(activation.childId)
        if (child !== undefined) {
          try {
            const snapshot = ctx.sessionTitle.get(agent.session)
            const parentTitle = (snapshot && typeof snapshot.title === 'string' && snapshot.title) || '未命名会话'
            ctx.sessionTitle.rename(child.session, fitTitle('侧边：', parentTitle, ` #${number}`, 80))
          } catch (_titleFailure) { /* keep the default title */ }
        }
        return { kind: 'success', text: '侧边会话已启动' }
      } catch (error) {
        pendingRules.delete(childId)
        pendingPresets.delete(childId)
        counts.set(parentId, number - 1)
        return { kind: 'error', text: `侧边会话启动失败：${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }), 'side-chat:command')
}

