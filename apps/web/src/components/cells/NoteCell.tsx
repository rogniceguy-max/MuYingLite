import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { Paper, Popper } from '@mui/material'
import { Film, Image as ImageIcon } from 'lucide-react'
import {
  applyTextDiff,
  cellsOf,
  ensureCells,
  getOrCreateNote,
} from '../../collab/rowUtils'
import type { MediaAsset } from '../../types'

export type NoteMediaItem = {
  linkId: string
  assetId: string
  label: string
  asset?: MediaAsset
  kind: 'video' | 'image'
}

type NoteCellProps = {
  row: Y.Map<any>
  columnId: string
  readOnly: boolean
  mediaItems: NoteMediaItem[]
  onOpenMedia: (asset: MediaAsset) => void
}

function sanitizeLabel(label: string): string {
  return label.replace(/]/g, '〕').replace(/\)/g, '）')
}

export function NoteCell({
  row,
  columnId,
  readOnly,
  mediaItems,
  onOpenMedia,
}: NoteCellProps) {
  const [noteText, setNoteText] = useState<Y.Text | null>(null)
  const [value, setValue] = useState('')
  const [editing, setEditing] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [caret, setCaret] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    let text: Y.Text | null = null
    const existingMap = cellsOf(row)?.get(columnId)
    if (existingMap instanceof Y.Map) {
      const existingText = existingMap.get('text')
      if (existingText instanceof Y.Text) {
        text = existingText
      } else if (!readOnly) {
        text = new Y.Text()
        existingMap.set('text', text)
      }
    } else if (!readOnly) {
      const cells = ensureCells(row)
      text = getOrCreateNote(cells, columnId).text
    }

    setNoteText(text)
    setValue(text?.toString() ?? '')
    if (!text) return
    const observer = () => setValue(text!.toString())
    text.observe(observer)
    return () => text?.unobserve(observer)
  }, [row, columnId, readOnly])

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.max(38, element.scrollHeight)}px`
  }, [value, editing])

  const filteredItems = mediaItems.filter((item) =>
    item.label.toLowerCase().includes(mentionQuery.toLowerCase()),
  )

  function handleChange(next: string) {
    setValue(next)
    if (noteText) applyTextDiff(noteText, next)
    const position = textareaRef.current?.selectionStart ?? next.length
    setCaret(position)
    const before = next.slice(0, position)
    const match = before.match(/@([^\s@]*)$/)
    if (match) {
      setMentionQuery(match[1])
      setMentionOpen(true)
    } else {
      setMentionOpen(false)
    }
  }

  function insertMention(item: NoteMediaItem) {
    const before = value.slice(0, caret)
    const match = before.match(/@([^\s@]*)$/)
    if (!match) return
    const start = caret - match[0].length
    const token = `@[${sanitizeLabel(item.label)}](${item.linkId})`
    const next = value.slice(0, start) + token + value.slice(caret)
    setValue(next)
    if (noteText) applyTextDiff(noteText, next)
    setMentionOpen(false)
    requestAnimationFrame(() => {
      const element = textareaRef.current
      if (!element) return
      const position = start + token.length
      element.focus()
      element.setSelectionRange(position, position)
      setCaret(position)
    })
  }

  function renderNote(text: string) {
    const nodes: React.ReactNode[] = []
    const regex = /@\[([^\]]*)\]\(([^)]+)\)/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    let key = 0
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(text.slice(lastIndex, match.index))
      }
      const label = match[1]
      const linkId = match[2]
      const item = mediaItems.find((candidate) => candidate.linkId === linkId)
      if (item?.asset) {
        nodes.push(
          <button
            type="button"
            key={`mention-${linkId}-${key++}`}
            className="note-mention"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onOpenMedia(item.asset!)}
          >
            {item.kind === 'video' ? (
              <Film size={13} />
            ) : (
              <ImageIcon size={13} />
            )}
            {label}
          </button>,
        )
      } else {
        nodes.push(
          <span
            key={`mention-${linkId}-${key++}`}
            className="note-mention missing"
          >
            {label}（已移除）
          </span>,
        )
      }
      lastIndex = regex.lastIndex
    }
    if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
    return nodes
  }

  if (!editing || readOnly) {
    return (
      <div
        className={`note-display ${readOnly ? 'readonly' : ''}`}
        onClick={() => {
          if (readOnly) return
          setEditing(true)
          requestAnimationFrame(() => textareaRef.current?.focus())
        }}
      >
        {value ? renderNote(value) : null}
      </div>
    )
  }

  return (
    <div className="note-editor">
      <textarea
        ref={textareaRef}
        className="cell-textarea note-textarea"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onKeyUp={(event) => {
          setCaret(event.currentTarget.selectionStart ?? value.length)
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setEditing(false)
            setMentionOpen(false)
          }, 180)
        }}
        rows={1}
        spellCheck={false}
      />
      <Popper
        open={mentionOpen && Boolean(textareaRef.current)}
        anchorEl={textareaRef.current}
        placement="bottom-start"
        sx={{ zIndex: 1400 }}
      >
        <Paper className="mention-popover" elevation={8}>
          {filteredItems.length === 0 ? (
            <div className="mention-empty">当前行还没有可引用的媒体</div>
          ) : (
            filteredItems.map((item) => (
              <button
                type="button"
                key={item.linkId}
                className="mention-option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(item)}
              >
                {item.kind === 'video' ? (
                  <Film size={16} />
                ) : (
                  <ImageIcon size={16} />
                )}
                <span>{item.label}</span>
              </button>
            ))
          )}
        </Paper>
      </Popper>
    </div>
  )
}
