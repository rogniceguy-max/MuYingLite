import { useEffect, useMemo, useState } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { generateKeyBetween } from 'fractional-indexing'
import { v7 as uuidv7 } from 'uuid'
import { WS_URL } from '../api'

export type CollabRow = {
  id: string
  row: Y.Map<any>
  position: string
  deleted: boolean
  cells: Y.Map<any> | null
}

export type PeerState = {
  clientId: number
  color: string
  selection?: {
    rowId?: string
    columnId?: string
  } | null
}

const COLORS = [
  '#6aa7ff',
  '#f2b35c',
  '#58d68d',
  '#c792ea',
  '#ff8a80',
  '#4dd0e1',
  '#ffd54f',
  '#aed581',
]

function pickColor(): string {
  const existing = sessionStorage.getItem('film-workbench-color')
  if (existing) return existing
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  sessionStorage.setItem('film-workbench-color', color)
  return color
}

function readRows(doc: Y.Doc): CollabRow[] {
  const rowsMap = doc.getMap('rows') as Y.Map<any>
  const rows: CollabRow[] = []
  rowsMap.forEach((row, id) => {
    if (!(row instanceof Y.Map)) return
    const cells = row.get('cells')
    rows.push({
      id,
      row,
      position: String(row.get('position') ?? ''),
      deleted: row.get('deleted') === true,
      cells: cells instanceof Y.Map ? (cells as Y.Map<any>) : null,
    })
  })
  rows.sort((a, b) => {
    if (a.position < b.position) return -1
    if (a.position > b.position) return 1
    return a.id.localeCompare(b.id)
  })
  return rows
}

export function useSheetCollab(sheetId: string) {
  const doc = useMemo(() => new Y.Doc(), [sheetId])
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [rows, setRows] = useState<CollabRow[]>([])
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
    'connecting',
  )
  const [synced, setSynced] = useState(false)
  const [peers, setPeers] = useState<PeerState[]>([])

  useEffect(() => {
    setRows([])
    setSynced(false)
    setStatus('connecting')
    setPeers([])

    const rowsMap = doc.getMap('rows') as Y.Map<any>
    const refresh = () => setRows(readRows(doc))
    rowsMap.observeDeep(refresh)
    refresh()

    const p = new HocuspocusProvider({
      url: WS_URL,
      name: `sheet:${sheetId}`,
      document: doc,
      onStatus: ({ status: nextStatus }) => {
        setStatus(nextStatus as any)
      },
      onSynced: ({ state }) => {
        setSynced(state)
        refresh()
      },
      onAwarenessChange: ({ states }) => {
        const ownId = doc.clientID
        const next: PeerState[] = []
        for (const state of states) {
          if (state.clientId === ownId) continue
          const selection = state.selection
          next.push({
            clientId: state.clientId,
            color:
              typeof state.color === 'string' ? state.color : COLORS[0],
            selection:
              selection && typeof selection === 'object'
                ? {
                    rowId:
                      typeof selection.rowId === 'string'
                        ? selection.rowId
                        : undefined,
                    columnId:
                      typeof selection.columnId === 'string'
                        ? selection.columnId
                        : undefined,
                  }
                : null,
          })
        }
        setPeers(next)
      },
    })

    setProvider(p)
    const color = pickColor()
    p.awareness?.setLocalStateField('color', color)

    return () => {
      try {
        p.awareness?.setLocalState(null)
      } catch {
        // ignore
      }
      p.destroy()
      rowsMap.unobserveDeep(refresh)
      doc.destroy()
    }
  }, [doc, sheetId])

  const readOnly = !synced || status !== 'connected'

  function setSelection(rowId: string | null, columnId: string | null): void {
    provider?.awareness?.setLocalStateField(
      'selection',
      rowId && columnId ? { rowId, columnId } : null,
    )
  }

  function addRow(): string {
    const rowsMap = doc.getMap('rows') as Y.Map<any>
    const visible = readRows(doc).filter((row) => !row.deleted)
    const lastPosition = visible.at(-1)?.position ?? null
    const position = generateKeyBetween(lastPosition, null)
    const rowId = uuidv7()
    doc.transact(() => {
      const row = new Y.Map<any>()
      row.set('position', position)
      row.set('deleted', false)
      row.set('deletionBatchId', null)
      row.set('deletedAt', null)
      row.set('cells', new Y.Map<any>())
      rowsMap.set(rowId, row)
    })
    return rowId
  }

  function deleteRow(rowId: string): void {
    const rowsMap = doc.getMap('rows') as Y.Map<any>
    const row = rowsMap.get(rowId)
    if (!(row instanceof Y.Map)) return
    doc.transact(() => {
      row.set('deleted', true)
      row.set('deletionBatchId', uuidv7())
      row.set('deletedAt', new Date().toISOString())
    })
  }

  function setRowPosition(rowId: string, position: string): void {
    const rowsMap = doc.getMap('rows') as Y.Map<any>
    const row = rowsMap.get(rowId)
    if (!(row instanceof Y.Map)) return
    doc.transact(() => {
      row.set('position', position)
    })
  }

  return {
    doc,
    provider,
    rows,
    status,
    synced,
    readOnly,
    peers,
    setSelection,
    addRow,
    deleteRow,
    setRowPosition,
  }
}
