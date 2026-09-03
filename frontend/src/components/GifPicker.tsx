import { useState, useRef, useEffect } from 'react';
import { Search, X, Sparkles } from 'lucide-react';

interface Props {
  onSelectGif: (gifUrl: string) => void;
  onClose: () => void;
}

const PRESET_GIFS = [
  { title: 'Happy Dance', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3h5c3ZzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXgmbXA9Zw/blSTtZehjAZ8I/giphy.gif' },
  { title: 'Cat Vibe', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3h5c3ZzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXgmbXA9Zw/jpbnoe3UIa8TU8LM13/giphy.gif' },
  { title: 'Mind Blown', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3h5c3ZzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXgmbXA9Zw/26ufdipQqU2lhNA4g/giphy.gif' },
  { title: 'Clap Clap', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3h5c3ZzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXgmbXA9Zw/l3q2XhfQ8oCkm1K76/giphy.gif' },
  { title: 'Popcorn', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3h5c3ZzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXgmbXA9Zw/hVTouUU07GlYCfz2BK/giphy.gif' },
  { title: 'Thumbs Up', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3h5c3ZzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXgmbXA9Zw/111ebonMs90YLu/giphy.gif' },
  { title: 'LOL Laugh', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3h5c3ZzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXgmbXA9Zw/l0ExceU3zY1x542pG/giphy.gif' },
  { title: 'Surprised Pikachu', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3h5c3ZzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXgmbXA9Zw/3kzJvEciJaPPxNRxk7/giphy.gif' },
  { title: 'Cheering', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3h5c3ZzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXgmbXA9Zw/g9582DNuQppxC/giphy.gif' },
  { title: 'Cool Shades', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3h5c3ZzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXgmbXA9Zw/62PP2yEIAZF6g/giphy.gif' },
  { title: 'Coffee Morning', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3h5c3ZzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXgmbXA9Zw/3o7TKSjRrfIPjeiVyM/giphy.gif' },
  { title: 'Goodbye Wave', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3h5c3ZzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXhzeXgmbXA9Zw/m9eG1qVjvN56H0MXt8/giphy.gif' },
];

export function GifPicker({ onSelectGif, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [gifs, setGifs] = useState(PRESET_GIFS);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (!search.trim()) {
      setGifs(PRESET_GIFS);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(
            search
          )}&limit=12&rating=g`
        );
        const data = await res.json();
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          const fetchedGifs = data.data.map((item: any) => ({
            title: item.title || search,
            url: item.images?.fixed_height?.url || item.images?.original?.url,
          }));
          setGifs(fetchedGifs);
        } else {
          setGifs(PRESET_GIFS.filter((g) => g.title.toLowerCase().includes(search.toLowerCase())));
        }
      } catch (err) {
        setGifs(PRESET_GIFS.filter((g) => g.title.toLowerCase().includes(search.toLowerCase())));
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-14 right-20 w-88 h-96 bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      {/* Search Bar */}
      <div className="p-3 border-b border-dark-700 flex items-center justify-between gap-2 bg-dark-850">
        <div className="flex-1 relative flex items-center">
          <Search className="w-4 h-4 absolute left-3 text-dark-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search GIFs on Giphy..."
            className="w-full pl-9 pr-3 py-1.5 bg-dark-700 border border-dark-600 rounded-xl text-xs text-white placeholder-dark-400 focus:outline-none focus:ring-1 focus:ring-accent-500"
            autoFocus
          />
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Header Badge */}
      <div className="px-3 py-1.5 bg-dark-750 border-b border-dark-700 flex items-center gap-1.5 text-[11px] text-accent-400 font-medium">
        <Sparkles className="w-3.5 h-3.5" />
        <span>{search.trim() ? `Search results for "${search}"` : 'Trending GIFs'}</span>
      </div>

      {/* GIF Grid */}
      <div className="flex-1 overflow-y-auto p-2.5 custom-scrollbar">
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-dark-400">
            Searching GIFs...
          </div>
        ) : gifs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-dark-400">
            No GIFs found
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {gifs.map((gif, idx) => (
              <button
                key={`${gif.url}-${idx}`}
                onClick={() => onSelectGif(gif.url)}
                className="group relative rounded-xl overflow-hidden bg-dark-700 aspect-video border border-dark-600 hover:border-accent-500 transition-all hover:scale-[1.02] shadow-sm"
              >
                <img
                  src={gif.url}
                  alt={gif.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                  <span className="text-[10px] text-white font-medium truncate">{gif.title}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
