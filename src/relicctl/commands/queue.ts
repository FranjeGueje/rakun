import type { DMQueueElement } from 'common/types'
import { queueText } from '../format'
import { Command, show } from '../context'

export const queue: Command = async (ctx) => {
  const info = await ctx.api.call<{
    elements: DMQueueElement[]
    finished: DMQueueElement[]
  }>('getDMQueueInformation')
  show(ctx, info, queueText)
}
