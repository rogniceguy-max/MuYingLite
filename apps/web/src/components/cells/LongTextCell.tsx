import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import {
  applyTextDiff,
  cellsOf,
  ensureCells,
  getOrCreateText,
} from '../../collab/rowUtils'

type LongTextCellProps = {
  row: Y.Map<any>
  columnId: string
  readOnly: boolean
  placeholder?: string
}

export function LongTextCell({
  row,
  columnId,
  readOnly,
  placeholder = '',
}: LongTextCellProps) {
  const [ytext, setYtext] = useState<Y.Text | null>(null)
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const existing = cellsOf(row)?.get(columnId)
    let text: Y.Text | null = existing instanceof Y.Text ? existing : null
    if (!text) {
      if (readOnly) {
        setYtext(null)
        setValue('')
        return
      }
      const cells = ensureCells(row)
      text = getOrCreateText(cells, columnId)
    }
    setYtext(text)
    setValue(text.toString())
    const observer = () => setValue(text!.toString())
    text.observe(observer)
    return () => text?.unobserve(observer)
  }, [row, columnId, readOnly])

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.max(38, element.scrollHeight)}px`
  }, [value])

  function handleChange(next: string) {
    setValue(next)
    if (ytext) applyTextDiff(ytext, next)
  }

  return (
    <textarea
      ref={textareaRef}
      className="cell-textarea"
      value={value}
      onChange={(event) => handleChange(event.target.value)}
      readOnly={readOnly}
      placeholder={placeholder}
      rows={1}
      spellCheck={false}
    />
  )
}
