export type ProjectEvent =
  | 'sheet.renamed'
  | 'episode.created'
  | 'episode.updated'
  | 'episode.deleted'
  | 'episode.restored'
  | 'media.updated'
  | 'recycle_bin.changed'
  | 'project.updated'

type Listener = (event: ProjectEvent, data: unknown) => void

const listeners = new Map<string, Set<Listener>>()

export function subscribeProject(projectId: string, listener: Listener): () => void {
  let set = listeners.get(projectId)
  if (!set) {
    set = new Set()
    listeners.set(projectId, set)
  }
  set.add(listener)
  return () => {
    set?.delete(listener)
    if (set && set.size === 0) listeners.delete(projectId)
  }
}

export function emitProject(
  projectId: string,
  event: ProjectEvent,
  data: unknown,
): void {
  const set = listeners.get(projectId)
  if (!set) return
  for (const listener of set) {
    try {
      listener(event, data)
    } catch (error) {
      console.error('[events] listener failed', error)
    }
  }
}
