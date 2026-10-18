import type { MediaAsset, MediaKind } from '../../types'
import type { UploadContext } from '../../api'

export type PickMedia = (
  kind: MediaKind,
  onSelect: (asset: MediaAsset) => void,
  context?: UploadContext,
) => void

export type OpenMedia = (
  asset: MediaAsset,
  onSetSelected?: () => void,
) => void
