export type SheetKind = 'beat' | 'asset'

export type ColumnDef = {
  id: string
  label: string
  dataType:
    | 'text'
    | 'long_text'
    | 'enum_color'
    | 'beat_no'
    | 'episode_refs'
    | 'media_videos'
    | 'media_selected'
    | 'media_alternates'
    | 'note_mentions'
  config?: Record<string, unknown>
  position: number
}

export const COLUMNS: Record<SheetKind, ColumnDef[]> = {
  beat: [
    { id: 'beat.scene', label: '场景', dataType: 'text', position: 1 },
    { id: 'beat.beat_no', label: '节拍', dataType: 'beat_no', position: 2 },
    { id: 'beat.story', label: '故事内容', dataType: 'long_text', position: 3 },
    {
      id: 'beat.mark',
      label: '标注',
      dataType: 'enum_color',
      config: { options: ['red', 'yellow', 'green'], allowClear: true },
      position: 4,
    },
    { id: 'beat.plan', label: '规划', dataType: 'long_text', position: 5 },
    { id: 'beat.note', label: '批注', dataType: 'note_mentions', position: 6 },
    { id: 'beat.videos', label: '视频', dataType: 'media_videos', position: 7 },
  ],
  asset: [
    { id: 'asset.category', label: '类别', dataType: 'text', position: 1 },
    { id: 'asset.name', label: '名称', dataType: 'text', position: 2 },
    { id: 'asset.episodes', label: '集数', dataType: 'episode_refs', position: 3 },
    { id: 'asset.selected', label: '选定', dataType: 'media_selected', position: 4 },
    { id: 'asset.alternates', label: '备选', dataType: 'media_alternates', position: 5 },
    { id: 'asset.note', label: '批注', dataType: 'note_mentions', position: 6 },
  ],
}

export function getColumns(kind: SheetKind): ColumnDef[] {
  return COLUMNS[kind]
}
