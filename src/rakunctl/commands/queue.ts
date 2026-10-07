import type { DMQueueElement } from 'common/types'
import { queueText } from '../format'
import { Command, show } from '../context'

export const queue: Command = async (ctx, args) => {
  if (args[0] === 'clear') {
    await ctx.api.call('clearFinishedDMQueue')
    return ctx.log('Finished list cleared')
  }
  const info = await ctx.api.call<{
    elements: DMQueueElement[]
    finished: DMQueueElement[]
  }>('getDMQueueInformation')
  const stores = await ctx.stores()
  show(ctx, info, (value) => queueText(value, stores))
}

export const pause: Command = async (ctx) => {
  await ctx.api.call('pauseCurrentDownload')
  ctx.log('Download paused')
}

export const resume: Command = async (ctx) => {
  await ctx.api.call('resumeCurrentDownload')
  ctx.log('Queue resumed')
}

export const cancel: Command = async (ctx, _args, opts) => {
  await ctx.api.call('cancelDownload', opts.removeFiles)
  ctx.log('Download canceled')
}
