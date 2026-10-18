from pathlib import Path

p = Path('apps/web/src/pages/MediaLibraryPage.tsx')
s = p.read_text(encoding='utf-8')

s = s.replace(
    "import { useDeferredValue, useRef, useState } from 'react'",
    "import { useDeferredValue, useMemo, useRef, useState } from 'react'",
)
s = s.replace(
    "import { Download, Film, Pencil, Trash2, Upload } from 'lucide-react'",
    "import { Download, Film, Folder, Pencil, Trash2, Upload } from 'lucide-react'",
)

s = s.replace(
    "  const items = mediaQuery.data?.items ?? []\n",
    """  const items = mediaQuery.data?.items ?? []

  const groups = useMemo(() => {
    const map = new Map<string, MediaAsset[]>()
    for (const item of items) {
      const key = item.folderPath ?? '未归档'
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b, 'zh-CN'),
    )
  }, [items])
""",
)

old_block = """  return (
    <div className="library-page">"""
new_block = """  function renderMediaCard(asset: MediaAsset) {
    return (
      <div
        key={asset.id}
        className="media-card"
        role="button"
        tabIndex={0}
        onClick={() => setViewer(asset)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') setViewer(asset)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          setCardMenu({
            x: event.clientX,
            y: event.clientY,
            asset,
          })
        }}
      >
        <div className="media-card-thumb">
          {asset.kind === 'image' && asset.thumbnailUrl ? (
            <img src={asset.thumbnailUrl} alt={asset.displayName} />
          ) : (
            <div className="video-placeholder">
              <Film size={36} />
              <span>{asset.kind === 'video' ? 'VIDEO' : 'IMAGE'}</span>
            </div>
          )}
          <span className={`status-badge status-${asset.status}`}>
            {asset.status === 'ready'
              ? '就绪'
              : asset.status === 'failed'
                ? '失败'
                : '处理中'}
          </span>
        </div>
        <div className="media-card-body">
          <div className="media-card-name" title={asset.displayName}>
            {asset.displayName}
          </div>
          <div className="media-card-meta">
            {asset.kind === 'video' ? '视频' : '图片'} ·{' '}
            {formatBytes(asset.sizeBytes)}
            {asset.usageCount ? ` · ${asset.usageCount} 处使用` : ' · 未使用'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="library-page">"""
if old_block not in s:
    raise SystemExit('return block not found')
s = s.replace(old_block, new_block, 1)

old_grid = """        <div className="media-grid">
          {items.map((asset) => (
            <div
              key={asset.id}
              className="media-card"
              role="button"
              tabIndex={0}
              onClick={() => setViewer(asset)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setViewer(asset)
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                setCardMenu({
                  x: event.clientX,
                  y: event.clientY,
                  asset,
                })
              }}
            >
              <div className="media-card-thumb">
                {asset.kind === 'image' && asset.thumbnailUrl ? (
                  <img src={asset.thumbnailUrl} alt={asset.displayName} />
                ) : (
                  <div className="video-placeholder">
                    <Film size={36} />
                    <span>{asset.kind === 'video' ? 'VIDEO' : 'IMAGE'}</span>
                  </div>
                )}
                <span className={`status-badge status-${asset.status}`}>
                  {asset.status === 'ready'
                    ? '就绪'
                    : asset.status === 'failed'
                      ? '失败'
                      : '处理中'}
                </span>
              </div>
              <div className="media-card-body">
                <div className="media-card-name" title={asset.displayName}>
                  {asset.displayName}
                </div>
                <div className="media-card-meta">
                  {asset.kind === 'video' ? '视频' : '图片'} ·{' '}
                  {formatBytes(asset.sizeBytes)}
                  {asset.usageCount ? ` · ${asset.usageCount} 处使用` : ' · 未使用'}
                </div>
              </div>
            </div>
          ))}
        </div>"""
new_grid = """        <div className="media-folder-list">
          {groups.map(([folder, folderItems]) => (
            <section className="media-folder-group" key={folder}>
              <div className="media-folder-head">
                <Folder size={14} />
                <span>{folder}</span>
                <span className="media-folder-count">{folderItems.length}</span>
              </div>
              <div className="media-grid">
                {folderItems.map(renderMediaCard)}
              </div>
            </section>
          ))}
        </div>"""
if old_grid not in s:
    raise SystemExit('media grid block not found')
s = s.replace(old_grid, new_grid, 1)

p.write_text(s, encoding='utf-8')
print('grouped media library by folder')
