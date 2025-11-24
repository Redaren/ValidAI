/**
 * Gallery queries and mutations
 * Central export point for all gallery-related TanStack Query hooks
 */

// List and create hooks
export { useUserGalleries, useCreateGallery, type Gallery } from './use-galleries'

// Detail and update hooks
export {
  useGalleryDetail,
  useUpdateGallery,
  useDeleteGallery,
  type GalleryDetail,
  type GalleryArea,
  type GalleryProcessor,
} from './use-gallery-detail'

// Transform function (shared between server and client)
export { transformGalleryData } from './transform-gallery-data'

// Area and processor mutation hooks
export {
  useCreateGalleryArea,
  useUpdateGalleryArea,
  useDeleteGalleryArea,
  useAddProcessorsToArea,
  useRemoveProcessorFromArea,
  useReorderGalleryAreas,
  useReorderGalleryProcessors,
  useMoveProcessorToArea,
} from './use-gallery-mutations'
