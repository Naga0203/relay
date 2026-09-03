import { useState, useRef } from 'react';
import { X, Upload, Link as LinkIcon, Image as ImageIcon, Loader2 } from 'lucide-react';
import { messageApi } from '../features/chat/api';
import { encryptFile, encryptText } from '../lib/e2eCrypto';

interface Props {
  conversationId: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function ImageUploadModal({ conversationId, onSuccess, onClose }: Props) {
  const [tab, setTab] = useState<'upload' | 'url'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image or GIF file.');
        return;
      }
      setError('');
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setError('');
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let finalImageUrl = previewUrl;

      if (tab === 'upload') {
        if (!selectedFile) {
          setError('Please choose an image file to upload.');
          setLoading(false);
          return;
        }
        // Client-side E2EE file payload encryption
        const encryptedFile = await encryptFile(selectedFile, conversationId);
        const uploadRes = await messageApi.uploadFile(encryptedFile);
        finalImageUrl = uploadRes.fileUrl;
      } else {
        if (!imageUrlInput.trim()) {
          setError('Please enter a valid image URL.');
          setLoading(false);
          return;
        }
        finalImageUrl = imageUrlInput.trim();
      }

      // Combine image URL with optional caption into message content
      const content = caption.trim()
        ? `${finalImageUrl}\n${caption.trim()}`
        : finalImageUrl;

      // Encrypt final message payload with AES-GCM 256-bit
      const encryptedContent = await encryptText(content, conversationId);

      await messageApi.send(conversationId, {
        content: encryptedContent,
        messageType: 'IMAGE',
        idempotencyKey: crypto.randomUUID(),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to send image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-dark-700 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <ImageIcon className="w-4 h-4 text-primary-400" />
            <span>Send Image</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-dark-700 bg-dark-850 px-5 pt-2 gap-4">
          <button
            type="button"
            onClick={() => {
              setTab('upload');
              setError('');
            }}
            className={`pb-2.5 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
              tab === 'upload'
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload File</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('url');
              setError('');
            }}
            className={`pb-2.5 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
              tab === 'url'
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Image URL</span>
          </button>
        </div>

        <form onSubmit={handleSend} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          {tab === 'upload' ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[160px] ${
                previewUrl
                  ? 'border-primary-500/50 bg-primary-500/5'
                  : 'border-dark-600 hover:border-primary-500/50 bg-dark-750 hover:bg-dark-700'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              {previewUrl ? (
                <div className="relative group w-full max-h-44 flex justify-center overflow-hidden rounded-xl">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-44 object-contain rounded-xl"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white font-medium">
                    Click to change image
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-primary-400 mb-2 animate-bounce" />
                  <p className="text-xs font-medium text-white mb-1">
                    Drag & drop your image here, or <span className="text-primary-400">browse</span>
                  </p>
                  <p className="text-[11px] text-dark-400">Supports PNG, JPG, WEBP, GIF up to 10MB</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-dark-300 mb-1">
                  Image URL
                </label>
                <input
                  type="url"
                  value={imageUrlInput}
                  onChange={(e) => {
                    setImageUrlInput(e.target.value);
                    setPreviewUrl(e.target.value);
                  }}
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-3.5 py-2 bg-dark-700 border border-dark-600 rounded-xl text-xs text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {previewUrl && (
                <div className="max-h-40 overflow-hidden rounded-xl bg-dark-750 p-2 flex justify-center border border-dark-600">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-36 object-contain rounded-lg"
                    onError={() => setError('Unable to load image from provided URL.')}
                  />
                </div>
              )}
            </div>
          )}

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
              disabled={loading || (tab === 'upload' && !selectedFile) || (tab === 'url' && !imageUrlInput.trim())}
              className="px-5 py-2 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 text-white text-xs font-semibold hover:from-primary-600 hover:to-accent-500 disabled:opacity-40 transition-all flex items-center gap-1.5 shadow-md shadow-primary-500/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <span>Send Image</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
