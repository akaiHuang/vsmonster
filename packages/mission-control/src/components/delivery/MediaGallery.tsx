'use client';

interface MediaRecord {
  _id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  mediaType: 'image' | 'video' | 'file';
  publicUrl: string;
  thumbnailUrl?: string;
}

interface MediaGalleryProps {
  media: MediaRecord[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaGallery({ media }: MediaGalleryProps) {
  if (!media || media.length === 0) return null;

  const images = media.filter((m) => m.mediaType === 'image');
  const videos = media.filter((m) => m.mediaType === 'video');
  const files = media.filter((m) => m.mediaType === 'file');

  return (
    <div className="space-y-4">
      {/* Images grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {images.map((img) => (
            <a
              key={img._id}
              href={`/api/media/${img._id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-lg border border-dark-border hover:border-monster-500/50 transition-colors"
            >
              <img
                src={`/api/media/${img._id}/view`}
                alt={img.originalFilename}
                loading="lazy"
                className="w-full h-40 object-cover"
              />
            </a>
          ))}
        </div>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <div className="space-y-3">
          {videos.map((vid) => (
            <div key={vid._id} className="rounded-lg border border-dark-border overflow-hidden">
              <video
                src={`/api/media/${vid._id}/view`}
                controls
                playsInline
                className="w-full max-h-64"
              />
              <div className="px-3 py-2 text-xs text-gray-400 truncate">
                {vid.originalFilename}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Files */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <a
              key={file._id}
              href={`/api/media/${file._id}/view`}
              download={file.originalFilename}
              className="flex items-center gap-3 p-3 rounded-lg border border-dark-border hover:border-monster-500/50 transition-colors"
            >
              <span className="text-2xl">📄</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{file.originalFilename}</p>
                <p className="text-xs text-gray-500">{formatFileSize(file.fileSize)}</p>
              </div>
              <span className="text-xs text-gray-500">Download</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
