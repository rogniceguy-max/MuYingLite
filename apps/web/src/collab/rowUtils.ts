import * as Y from 'yjs'

export type MediaItem = { linkId: string; assetId: string }

export type RowMediaLink = MediaItem & {
  role: 'video' | 'selected' | 'alternate'
  columnId: string
  index: number
}

export function cellsOf(row: Y.Map<any>): Y.Map<any> | null {
  const cells = row.get('cells')
  return cells instanceof Y.Map ? (cells as Y.Map<any>) : null
}

export function ensureCells(row: Y.Map<any>): Y.Map<any> {
  const existing = cellsOf(row)
  if (existing) return existing
  const cells = new Y.Map<any>()
  row.set('cells', cells)
  return cells
}

export function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function getOrCreateText(cells: Y.Map<any>, columnId: string): Y.Text {
  const existing = cells.get(columnId)
  if (existing instanceof Y.Text) return existing
  const text = new Y.Text()
  cells.set(columnId, text)
  return text
}

export function getOrCreateNote(
  cells: Y.Map<any>,
  columnId: string,
): { map: Y.Map<any>; text: Y.Text } {
  const existing = cells.get(columnId)
  if (existing instanceof Y.Map) {
    const text = existing.get('text')
    if (text instanceof Y.Text) return { map: existing, text }
    const next = new Y.Text()
    existing.set('text', next)
    return { map: existing, text: next }
  }
  const map = new Y.Map<any>()
  const text = new Y.Text()
  map.set('text', text)
  cells.set(columnId, map)
  return { map, text }
}

export function getArray<T = any>(
  cells: Y.Map<any>,
  columnId: string,
): Y.Array<T> | null {
  const existing = cells.get(columnId)
  return existing instanceof Y.Array ? (existing as Y.Array<T>) : null
}

export function getOrCreateArray<T = any>(
  cells: Y.Map<any>,
  columnId: string,
): Y.Array<T> {
  const existing = getArray<T>(cells, columnId)
  if (existing) return existing
  const array = new Y.Array<T>()
  cells.set(columnId, array)
  return array
}

function readMediaItem(value: unknown): MediaItem | null {
  if (value instanceof Y.Map) {
    const linkId = value.get('linkId')
    const assetId = value.get('assetId')
    if (typeof linkId === 'string' && typeof assetId === 'string') {
      return { linkId, assetId }
    }
    return null
  }
  if (value && typeof value === 'object') {
    const candidate = value as { linkId?: unknown; assetId?: unknown }
    if (typeof candidate.linkId === 'string' && typeof candidate.assetId === 'string') {
      return { linkId: candidate.linkId, assetId: candidate.assetId }
    }
  }
  return null
}

export function readSelected(cells: Y.Map<any>): MediaItem | null {
  return readMediaItem(cells.get('asset.selected'))
}

export function readRowMediaLinks(row: Y.Map<any>): RowMediaLink[] {
  const cells = cellsOf(row)
  if (!cells) return []
  const links: RowMediaLink[] = []

  const videos = getArray(cells, 'beat.videos')
  videos?.forEach((item, index) => {
    const media = readMediaItem(item)
    if (media) {
      links.push({
        ...media,
        role: 'video',
        columnId: 'beat.videos',
        index,
      })
    }
  })

  const selected = readSelected(cells)
  if (selected) {
    links.push({
      ...selected,
      role: 'selected',
      columnId: 'asset.selected',
      index: 0,
    })
  }

  const alternates = getArray(cells, 'asset.alternates')
  alternates?.forEach((item, index) => {
    const media = readMediaItem(item)
    if (media) {
      links.push({
        ...media,
        role: 'alternate',
        columnId: 'asset.alternates',
        index,
      })
    }
  })

  return links
}

export function toMediaItem(value: unknown): MediaItem | null {
  return readMediaItem(value)
}

export function moveArrayItem<T>(array: Y.Array<T>, from: number, to: number): void {
  if (from === to) return
  const length = array.length
  if (from < 0 || from >= length || to < 0 || to >= length) return
  const item = array.get(from)
  array.delete(from, 1)
  array.insert(to, [item])
}

export function applyTextDiff(ytext: Y.Text, next: string): void {
  const previous = ytext.toString()
  if (previous === next) return

  let start = 0
  while (
    start < previous.length &&
    start < next.length &&
    previous[start] === next[start]
  ) {
    start += 1
  }

  let previousEnd = previous.length
  let nextEnd = next.length
  while (
    previousEnd > start &&
    nextEnd > start &&
    previous[previousEnd - 1] === next[nextEnd - 1]
  ) {
    previousEnd -= 1
    nextEnd -= 1
  }

  const deleteCount = previousEnd - start
  const insertText = next.slice(start, nextEnd)
  const apply = () => {
    if (deleteCount > 0) ytext.delete(start, deleteCount)
    if (insertText) ytext.insert(start, insertText)
  }

  if (ytext.doc) ytext.doc.transact(apply)
  else apply()
}
