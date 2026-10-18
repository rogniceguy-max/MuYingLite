import { useState } from 'react'
import * as Y from 'yjs'
import { Menu, MenuItem, Typography } from '@mui/material'
import { Check, ChevronRight, Plus } from 'lucide-react'
import {
  ensureCells,
  getArray,
  getOrCreateArray,
} from '../../collab/rowUtils'
import type { Episode, Sheet } from '../../types'

type EpisodesCellProps = {
  row: Y.Map<any>
  cells: Y.Map<any> | null
  readOnly: boolean
  episodes: Episode[]
  sheets: Sheet[]
  onNavigate: (sheetId: string) => void
}

const MAX_VISIBLE_EPISODES = 2

function episodeLabel(episode: Episode): string {
  return `第${episode.number}集${episode.title ? ` · ${episode.title}` : ''}`
}

export function EpisodesCell({
  row,
  cells,
  readOnly,
  episodes,
  sheets,
  onNavigate,
}: EpisodesCellProps) {
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null)
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null)
  const array = cells ? getArray<string>(cells, 'asset.episodes') : null
  const selectedIds = array?.toArray() ?? []
  const selectedEntries = selectedIds
    .map((episodeId) => resolveEpisode(episodeId))
    .filter((entry) => !entry.deleted)
    .sort((a, b) => {
      const numberDiff = (a.episode?.number ?? 0) - (b.episode?.number ?? 0)
      if (numberDiff !== 0) return numberDiff
      return a.label.localeCompare(b.label, 'zh-CN')
    })
  const visibleEntries = selectedEntries.slice(0, MAX_VISIBLE_EPISODES)
  const hiddenEntries = selectedEntries.slice(MAX_VISIBLE_EPISODES)
  const addableEpisodes = episodes
    .filter((episode) => !episode.deletedAt)
    .sort((a, b) => {
      if (a.number !== b.number) return a.number - b.number
      return (a.title ?? '').localeCompare(b.title ?? '', 'zh-CN')
    })

  function resolveEpisode(episodeId: string) {
    const episode = episodes.find((candidate) => candidate.id === episodeId)
    const deleted = !episode || Boolean(episode.deletedAt)
    const beatSheet = sheets.find(
      (sheet) =>
        sheet.kind === 'beat' &&
        sheet.episodeId === episodeId &&
        !sheet.deletedAt,
    )
    return {
      episode,
      deleted,
      beatSheet,
      label: episode ? episodeLabel(episode) : '未知集',
    }
  }

  function toggle(episode: Episode) {
    const target = ensureCells(row)
    const targetArray = getOrCreateArray<string>(target, 'asset.episodes')
    const current = targetArray.toArray()
    const index = current.indexOf(episode.id)
    row.doc?.transact(() => {
      if (index >= 0) targetArray.delete(index, 1)
      else targetArray.push([episode.id])
    })
  }

  return (
    <div className="episodes-cell">
      {visibleEntries.map(({ episode, beatSheet, label }) => (
        <button
          type="button"
          key={episode?.id ?? label}
          className="episode-chip"
          disabled={!beatSheet}
          title={beatSheet ? '打开该集节拍表' : '找不到该集节拍表'}
          onClick={() => {
            if (beatSheet) onNavigate(beatSheet.id)
          }}
        >
          {label}
        </button>
      ))}
      {hiddenEntries.length > 0 ? (
        <button
          type="button"
          className="episode-chip episode-chip-more"
          onClick={(event) => setMoreAnchor(event.currentTarget)}
          title={hiddenEntries.map((entry) => entry.label).join('\n')}
        >
          +{hiddenEntries.length}
        </button>
      ) : null}
      {!readOnly ? (
        <button
          type="button"
          className="episode-add"
          onClick={(event) => setAddAnchor(event.currentTarget)}
        >
          <Plus size={13} /> 集数
        </button>
      ) : null}

      <Menu
        anchorEl={moreAnchor}
        open={Boolean(moreAnchor)}
        onClose={() => setMoreAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              maxHeight: 320,
              minWidth: 250,
            },
          },
        }}
      >
        {hiddenEntries.map(({ episode, beatSheet, label }) => (
          <MenuItem
            key={episode?.id ?? label}
            disabled={!beatSheet}
            onClick={() => {
              if (beatSheet) onNavigate(beatSheet.id)
              setMoreAnchor(null)
            }}
            sx={{ gap: 1 }}
            title={
              beatSheet ? '打开该集节拍表' : '找不到该集节拍表'
            }
          >
            <span>{label}</span>
            <ChevronRight
              size={14}
              style={{ marginLeft: 'auto', opacity: 0.55 }}
            />
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={addAnchor}
        open={Boolean(addAnchor)}
        onClose={() => setAddAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              maxHeight: 320,
              minWidth: 250,
            },
          },
        }}
      >
        {addableEpisodes.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2">还没有集</Typography>
          </MenuItem>
        ) : (
          addableEpisodes.map((episode) => {
            const checked = selectedIds.includes(episode.id)
            return (
              <MenuItem
                key={episode.id}
                onClick={() => toggle(episode)}
                sx={{ gap: 1 }}
              >
                <span className={`menu-check ${checked ? 'checked' : ''}`}>
                  {checked ? <Check size={12} /> : null}
                </span>
                <span>{episodeLabel(episode)}</span>
              </MenuItem>
            )
          })
        )}
      </Menu>
    </div>
  )
}
