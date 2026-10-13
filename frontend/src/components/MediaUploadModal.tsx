import { useState, useRef } from 'react';
import {
  X, Upload, Image as ImageIcon, Film, FileText,
  FileArchive, FileCode, Loader2, File as FileIcon
} from 'lucide-react';
import { messageApi } from '../features/chat/api';
import {
  encryptFileWithKey,
  encryptContentAndWrapFileKey,
} from '../lib/e2eCrypto';
import { userApi } from '../features/profile/api';
import { useAuthStore } from '../stores/authStore';

interface EncryptionRecipient {
  userId: string;
  publicKeyBase64: string;
}

interface Props {
  conversationId: string;
  peerUserId?: string;
  peerPublicKey?: string;
  /** All conversation members' public keys for E2EE group fan-out. */
  encryptionRecipients: EncryptionRecipient[];
  onSuccess: () => void;
  onClose: () => void;
}

// File type categories — each maps to a MIME-type allow-list and display info.
const FILE_CATEGORIES = [
  {
    id: 'image',
    label: 'Images',
    icon: ImageIcon,
    accept: 'image/*',
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  },
  {
    id: 'video',
    label: 'Videos',
    icon: Film,
    accept: 'video/*',
    mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    extensions: ['.mp4', '.webm', '.mov'],
  },
  {
    id: 'pdf',
    label: 'PDFs',
    icon: FileText,
    accept: '.pdf',
    mimeTypes: ['application/pdf'],
    extensions: ['.pdf'],
  },
  {
    id: 'office',
    label: 'Office Docs',
    icon: FileText,
    accept: '.doc,.docx,.xls,.xlsx,.ppt,.pptx',
    mimeTypes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    extensions: ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'],
  },
  {
    id: 'other',
    label: 'Other Files',
    icon: FileIcon,
    accept: '*',
    mimeTypes: [], // empty = allow any non-listed type
    extensions: [],
  },
];

/**
 * Returns a display icon + label for a given file based on its MIME type or extension.
 */
function getFileInfo(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = file.type.toLowerCase();

  if (mime.startsWith('image/')) return { icon: ImageIcon, label: 'Image', type: 'IMAGE' as const };
  if (mime.startsWith('video/')) return { icon: Film, label: 'Video', type: 'VIDEO' as const };
  if (mime === 'application/pdf') return { icon: FileText, label: 'PDF', type: 'FILE' as const };
  if (
    mime.includes('wordprocessingml') || mime === 'application/msword' ||
    mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel' ||
    mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint'
  ) {
    return { icon: FileText, label: 'Document', type: 'FILE' as const };
  }
  if (mime === 'application/zip' || mime === 'application/x-rar-compressed' ||
      mime === 'application/x-tar' || mime === 'application/gzip') {
    return { icon: FileArchive, label: 'Archive', type: 'FILE' as const };
  }
  if (mime.startsWith('text/')) return { icon: FileCode, label: 'Text', type: 'FILE' as const };

  // Fallback based on extension
  const imgExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
  const vidExts = ['mp4', 'webm', 'mov', 'avi'];
  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];

  if (imgExts.includes(ext)) return { icon: ImageIcon, label: 'Image', type: 'IMAGE' as const };
  if (vidExts.includes(ext)) return { icon: Film, label: 'Video', type: 'VIDEO' as const };
  if (docExts.includes(ext)) return { icon: FileText, label: 'Document', type: 'FILE' as const };
  if (archiveExts.includes(ext)) return { icon: FileArchive, label: 'Archive', type: 'FILE' as const };

  return { icon: FileIcon, label: 'File', type: 'FILE' as const };
}

/**
 * Checks whether a file is allowed in the given category.
 */
function isFileAllowedInCategory(file: File, categoryId: string): boolean {
  if (categoryId === 'other') {
    // Allow everything that's not explicitly an image/video/pdf/office
    // (we don't strictly filter — just let it through for "other" category)
    return true;
  }

  const category = FILE_CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return false;

  const mime = file.type.toLowerCase();
  // Check MIME-type allow-list
  if (category.mimeTypes.includes(mime)) return true;

  // Check by extension
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
  if (category.extensions.includes(ext)) return true;

  return false;
}

export function MediaUploadModal({
  conversationId,
  peerUserId,
  peerPublicKey = '',
  encryptionRecipients = [],
  onSuccess,
  onClose,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<string>('image');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeCategoryDef = FILE_CATEGORIES.find((c) => c.id === activeCategory) ?? FILE_CATEGORIES[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setSelectedFile(file);

    // Generate a preview for images/videos
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl('');
    }
  };

  const handleCategoryChange = (categoryId: string) => {
    setActiveCategory(categoryId);
    setSelectedFile(null);
    setPreviewUrl('');
    setCaption('');
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please choose a file to upload.');
      return;
    }

    // Verify file type matches active category
    if (!isFileAllowedInCategory(selectedFile, activeCategory)) {
      // If file doesn't match category, still allow it in "other" — but warn
      if (activeCategory !== 'other') {
        setError('Selected file does not match the current category.');
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      // Determine messageType based on file type
      const fileInfo = getFileInfo(selectedFile);
      const messageType = fileInfo.type === 'IMAGE' ? 'IMAGE' : fileInfo.type === 'VIDEO' ? 'VIDEO' : 'FILE';

      const effectiveRecipients = [...encryptionRecipients];

      // Ensure peer's public key is available in recipients
      if (peerUserId && !effectiveRecipients.some((r) => r.userId === peerUserId)) {
        if (peerPublicKey) {
          effectiveRecipients.push({ userId: peerUserId, publicKeyBase64: peerPublicKey });
        } else {
          try {
            const res = await userApi.getPublicKey(peerUserId);
            if (res?.publicKey) {
              effectiveRecipients.push({ userId: peerUserId, publicKeyBase64: res.publicKey });
            }
          } catch { /* ignore */ }
        }
      }

      // Safety: never send if no recipients have public keys
      const recipientsWithKeys = effectiveRecipients.filter((r) => r.publicKeyBase64);
      if (recipientsWithKeys.length === 0) {
        setError('No recipient encryption keys available. Ask recipients to log in and set up keys first.');
        setLoading(false);
        return;
      }

      // Step 1: Generate per-file AES key and encrypt the file binary.
      const { encryptedFile, fileKey } = await encryptFileWithKey(selectedFile);

      // Step 2: Upload encrypted file
      const uploadRes = await messageApi.uploadFile(encryptedFile);
      const finalFileUrl = uploadRes.fileUrl;

      // Step 3: Build final message content with real URL
      const content = caption.trim()
        ? `${finalFileUrl}\n${caption.trim()}`
        : finalFileUrl;

      // Step 4: Encrypt message content with the per-file key and wrap the key
      //         for every recipient (group fan-out). This uses one set of
      //         recipientKeys for BOTH the content and the file binary.
      const { encryptedContent, recipientKeys } = await encryptContentAndWrapFileKey(
        content,
        fileKey,
        conversationId,
        effectiveRecipients,
        useAuthStore.getState().user?.id
      );

      await messageApi.send(conversationId, {
        content: encryptedContent,
        messageType: messageType as 'TEXT' | 'IMAGE' | 'GIF' | 'FILE',
        idempotencyKey: crypto.randomUUID(),
        recipientKeys,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to send file. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fileTypeInfo = selectedFile ? getFileInfo(selectedFile) : null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-dark-700 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <Upload className="w-4 h-4 text-primary-400" />
            <span>Send File</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex border-b border-dark-700 bg-dark-850 px-3 overflow-x-auto custom-scrollbar">
          {FILE_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`pb-2.5 px-3 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-primary-500 text-primary-400'
                    : 'border-transparent text-dark-400 hover:text-dark-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSend} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          {/* File Drop Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) {
                setError('');
                setSelectedFile(file);
                if (fileInputRef.current) fileInputRef.current.value = '';
                if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
                  setPreviewUrl(URL.createObjectURL(file));
                } else {
                  setPreviewUrl('');
                }
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[160px] ${
              selectedFile
                ? 'border-primary-500/50 bg-primary-500/5'
                : 'border-dark-600 hover:border-primary-500/50 bg-dark-750 hover:bg-dark-700'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={activeCategoryDef.accept}
              onChange={handleFileChange}
              className="hidden"
            />

            {selectedFile ? (
              <div className="relative w-full max-h-44 flex justify-center overflow-hidden rounded-xl">
                {fileTypeInfo?.type === 'IMAGE' && previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-44 object-contain rounded-xl"
                  />
                ) : fileTypeInfo?.type === 'VIDEO' && previewUrl ? (
                  <video
                    src={previewUrl}
                    className="max-h-44 max-w-full object-contain rounded-xl"
                    controls
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-44 text-center">
                    {fileTypeInfo ? (
                      <fileTypeInfo.icon className="w-12 h-12 text-primary-400 mb-2" />
                    ) : (
                      <FileIcon className="w-12 h-12 text-primary-400 mb-2" />
                    )}
                    <p className="text-sm font-medium text-white truncate max-w-full">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-dark-400 mt-1">
                      {Math.round(selectedFile.size / 1024)} KB
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-primary-400 mb-2 animate-bounce" />
                <p className="text-xs font-medium text-white mb-1">
                  Drag & drop your file here, or <span className="text-primary-400">browse</span>
                </p>
                <p className="text-[11px] text-dark-400 mb-2">
                  {activeCategoryDef.label === 'Images' && 'Supports PNG, JPG, WEBP, GIF up to 25MB'}
                  {activeCategoryDef.label === 'Videos' && 'Supports MP4, WebM, MOV up to 25MB'}
                  {activeCategoryDef.label === 'PDFs' && 'Supports PDF up to 25MB'}
                  {activeCategoryDef.label === 'Office Docs' && 'Supports DOC, XLS, PPT and Office Open XML up to 25MB'}
                  {activeCategoryDef.label === 'Other Files' && 'Supports any file type up to 25MB (APK, ZIP, etc.)'}
                </p>
                <p className="text-[10px] text-dark-500">
                  End-to-End Encrypted
                </p>
              </>
            )}
          </div>

          {/* Optional Caption */}
          <div>
            <label className="block text-xs font-medium text-dark-300 mb-1">
              Caption (Optional)
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a message..."
              className="w-full px-3.5 py-2 bg-dark-700 border border-dark-600 rounded-xl text-xs text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-dark-300 hover:text-white hover:bg-dark-700 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedFile}
              className="px-5 py-2 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 text-white text-xs font-semibold hover:from-primary-600 hover:to-accent-500 disabled:opacity-40 transition-all flex items-center gap-1.5 shadow-md shadow-primary-500/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <span>Send File</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}