/**
 * Side chat browser plugin.
 *
 * Registers no visible control. It watches the current Session's subagent
 * catalog and opens a right-sidebar chat tab for each new side-chat child the
 * Host creates through `/side <content>`. Closing that tab leaves the side
 * Session alive; it can be reopened from the subagent list.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-side-chat',
  factory(require) {
    const React = require('react')
    const LABEL = '侧边会话'

    return {
      inject: ['slots', 'sidebarRight'],
      apply(ctx) {
        /**
         * Build the canonical subagent-chat resource address.
         * @param {string} childId - child Session id.
         * @param {string} parentId - parent Session id.
         * @param {string} mode - catalog mode (`continuable` for fork children).
         * @returns {string} the resource address.
         */
        const addressOf = (childId, parentId, mode) => (
          'dsh-resource://subagentchat/session/' + encodeURIComponent(childId)
          + '?parent=' + encodeURIComponent(parentId)
          + '&mode=' + encodeURIComponent(mode)
        )

        function SideChatWatcher(props) {
          const { sessionId } = props
          const catalog = props.useProjection('subagentCatalog', value => value) || []
          const baseline = React.useRef(null)

          React.useEffect(() => {
            const labeled = catalog.filter(entry => entry !== null
              && entry.mode === 'continuable'
              && entry.label === LABEL)
            if (baseline.current === null) {
              baseline.current = new Set(labeled.map(entry => entry.id))
              return
            }
            for (const entry of labeled) {
              if (baseline.current.has(entry.id)) continue
              baseline.current.add(entry.id)
              try {
                ctx.sidebarRight.openResource(addressOf(entry.id, sessionId, entry.mode))
              } catch (_openFailure) { /* the subagent list still reaches it */ }
            }
          }, [catalog, sessionId])

          return null
        }

        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions',
          id: 'side-chat-watcher',
          order: 40,
        }, SideChatWatcher))
      },
    }
  },
})
