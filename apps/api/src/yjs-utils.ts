import * as Y from 'yjs'
import { generateNKeysBetween } from 'fractional-indexing'
import { v7 as uuidv7 } from 'uuid'
import type { SheetKind } from './columns.js'

export type LinkRole = 'video' | 'selected' | 'alternate'

export type ExtractedLink = {
  linkId: string
  assetId: string
  columnId: string
  role: LinkRole
  position: number
  rowId: string
}

export type DeletedRowInfo = {
  rowId: string
  batchId: string | null
  links: ExtractedLink[]
}

export type SheetExtract = {
  activeLinks: ExtractedLink[]
  deletedRows: DeletedRowInfo[]
}

export function parseSheetDocumentName(documentName: string): string | null {
  if (!documentName.startsWith('sheet:')) return null
  const id = documentName.slice('sheet:'.length)
  return id || null
}

export function createInitialSheetState(kind: SheetKind): Uint8Array {
  const doc = new Y.Doc()
  if (kind === 'beat') {
    const rows = doc.getMap('rows') as Y.Map<any>
    const positions = generateNKeysBetween(null, null, 8)
    for (const position of positions) {
      const row = new Y.Map<any>()
      row.set('position', position)
      row.set('deleted', false)
      row.set('deletionBatchId', null)
      row.set('deletedAt', null)
      row.set('cells', new Y.Map<any>())
      rows.set(uuidv7(), row)
    }
  }
  return Y.encodeStateAsUpdate(doc)
}

function asMap(value: unknown): Y.Map<any> | null {
  return value instanceof Y.Map ? value : null
}

function asArray(value: unknown): Y.Array<any> | null {
  return value instanceof Y.Array ? value : null
}

function readMediaItem(item: unknown): { linkId: string; assetId: string } | null {
  if (item instanceof Y.Map) {
    const linkId = item.get('linkId')
    const assetId = item.get('assetId')
    if (typeof linkId === 'string' && typeof assetId === 'string') {
      return { linkId, assetId }
    }
    return null
  }
  if (item && typeof item === 'object') {
    const candidate = item as { linkId?: unknown; assetId?: unknown }
    if (typeof candidate.linkId === 'string' && typeof candidate.assetId === 'string') {
      return { linkId: candidate.linkId, assetId: candidate.assetId }
    }
  }
  return null
}

export function readRowMediaLinks(row: Y.Map<any>, rowId: string): ExtractedLink[] {
  const cells = asMap(row.get('cells'))
  if (!cells) return []
  const links: ExtractedLink[] = []

  const videos = asArray(cells.get('beat.videos'))
  if (videos) {
    let index = 0
    videos.forEach((item) => {
      const media = readMediaItem(item)
      if (media) {
        links.push({
          ...media,
          rowId,
          columnId: 'beat.videos',
          role: 'video',
          position: index,
        })
      }
      index += 1
    })
  }

  const selected = readMediaItem(cells.get('asset.selected'))
  if (selected) {
    links.push({
      ...selected,
      rowId,
      columnId: 'asset.selected',
      role: 'selected',
      position: 0,
    })
  }

  const alternates = asArray(cells.get('asset.alternates'))
  if (alternates) {
    let index = 0
    alternates.forEach((item) => {
      const media = readMediaItem(item)
      if (media) {
        links.push({
          ...media,
          rowId,
          columnId: 'asset.alternates',
          role: 'alternate',
          position: index,
        })
      }
      index += 1
    })
  }

  return links
}

export function extractSheet(doc: Y.Doc): SheetExtract {
  const rows = doc.getMap('rows') as Y.Map<any>
  const activeLinks: ExtractedLink[] = []
  const deletedRows: DeletedRowInfo[] = []

  rows.forEach((row, rowId) => {
    if (!(row instanceof Y.Map)) return
    const links = readRowMediaLinks(row, rowId)
    if (row.get('deleted') === true) {
      const batchIdRaw = row.get('deletionBatchId')
      deletedRows.push({
        rowId,
        batchId: typeof batchIdRaw === 'string' ? batchIdRaw : null,
        links,
      })
    } else {
      activeLinks.push(...links)
    }
  })

  return { activeLinks, deletedRows }
}

function textOf(value: unknown): string {
  if (value instanceof Y.Text) return value.toString()
  if (typeof value === 'string') return value
  return ''
}

export function getRowSummary(row: Y.Map<any>): string {
  const cells = asMap(row.get('cells'))
  if (!cells) return '空行'

  const scene = textOf(cells.get('beat.scene')).trim()
  const story = textOf(cells.get('beat.story')).trim()
  if (scene || story) {
    const storyPart = story ? ` / ${story.slice(0, 48)}` : ''
    return `场景 ${scene || '未命名'}${storyPart}`
  }

  const category = textOf(cells.get('asset.category')).trim()
  const name = textOf(cells.get('asset.name')).trim()
  if (category || name) {
    return `${category || '资产'} / ${name || '未命名'}`
  }

  return '空行'
}

export function removeAssetLinksFromDoc(doc: Y.Doc, assetId: string): number {
  let removed = 0
  const rows = doc.getMap('rows') as Y.Map<any>

  rows.forEach((row) => {
    if (!(row instanceof Y.Map)) return
    const cells = asMap(row.get('cells'))
    if (!cells) return

    const videos = asArray(cells.get('beat.videos'))
    if (videos) {
      for (let i = videos.length - 1; i >= 0; i -= 1) {
        const media = readMediaItem(videos.get(i))
        if (media?.assetId === assetId) {
          videos.delete(i, 1)
          removed += 1
        }
      }
    }

    const selected = readMediaItem(cells.get('asset.selected'))
    if (selected?.assetId === assetId) {
      cells.set('asset.selected', null)
      removed += 1
    }

    const alternates = asArray(cells.get('asset.alternates'))
    if (alternates) {
      for (let i = alternates.length - 1; i >= 0; i -= 1) {
        const media = readMediaItem(alternates.get(i))
        if (media?.assetId === assetId) {
          alternates.delete(i, 1)
          removed += 1
        }
      }
    }
  })

  return removed
}
