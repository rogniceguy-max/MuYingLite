import { useState } from 'react'
import * as Y from 'yjs'
import { Menu, MenuItem } from '@mui/material'
import { cellsOf, ensureCells, readString } from '../../collab/rowUtils'

type MarkValue = 'red' | 'yellow' | 'green' | null

const OPTIONS: Array<{ value: MarkValue; label: string }> = [
  { value: 'red', label: '红色' },
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
]

type MarkCellProps = {
  row: Y.Map<any>
  cells: Y.Map<any> | null
  readOnly: boolean
}

export function MarkCell({ row, cells, readOnly }: MarkCellProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const current = readString(cellsOf(row)?.get('beat.mark')) as MarkValue | ''

  function setMark(value: MarkValue) {
    const target = ensureCells(row)
    row.doc?.transact(() => target.set('beat.mark', value))
    setAnchor(null)
  }

  return (
    <>
      <button
        type="button"
        className="mark-cell"
        onClick={(event) => setAnchor(event.currentTarget)}
        disabled={readOnly}
      >
        <span className={`mark-dot ${current || 'empty'}`} />
        {current ? (
          <span className="mark-label">
            {current === 'red' ? '红' : current === 'yellow' ? '黄' : '绿'}
          </span>
        ) : null}
      </button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        {OPTIONS.map((option) => (
          <MenuItem
            key={String(option.value)}
            onClick={() => setMark(option.value)}
            selected={current === option.value}
          >
            <span className={`mark-dot ${option.value}`} />
            <span style={{ marginLeft: 10 }}>{option.label}</span>
          </MenuItem>
        ))}
        <MenuItem onClick={() => setMark(null)}>
          <span className="mark-dot empty" />
          <span style={{ marginLeft: 10 }}>清除</span>
        </MenuItem>
      </Menu>
    </>
  )
}
