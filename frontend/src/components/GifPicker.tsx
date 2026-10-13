import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Sparkles, Flame, Smile, Heart, Meh, Laugh, HandMetal } from 'lucide-react';

interface Props {
  onSelectGif: (gifUrl: string) => void;
  onClose: () => void;
}

interface GifItem {
  id: string;
  title: string;
  category: 'trending' | 'reactions' | 'happy' | 'love' | 'moods' | 'memes' | 'greetings';
  keywords: string[];
  url: string;
}

const CATEGORIES = [
  { id: 'all', label: 'Trending', icon: Flame },
  { id: 'reactions', label: 'Reactions', icon: Sparkles },
  { id: 'happy', label: 'Joy', icon: Smile },
  { id: 'love', label: 'Love', icon: Heart },
  { id: 'memes', label: 'Memes', icon: Laugh },
  { id: 'moods', label: 'Moods', icon: Meh },
  { id: 'greetings', label: 'Greetings', icon: HandMetal },
] as const;

const EXPANDED_GIFS: GifItem[] = [
  // Trending / Popular
  { id: '1', title: 'Happy Dance', category: 'happy', keywords: ['happy', 'dance', 'excited', 'joy'], url: 'https://media.giphy.com/media/3o7aTlp6lcAdCLnJNi/giphy.gif' },
  { id: '2', title: 'Cat Vibe', category: 'memes', keywords: ['cat', 'vibe', 'jamming', 'music'], url: 'https://media.giphy.com/media/d2YVk2YQfKwPz1Ac/giphy.gif' },
  { id: '3', title: 'Mind Blown', category: 'reactions', keywords: ['mind', 'blown', 'shocked', 'explosion'], url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif' },
  { id: '4', title: 'Clap Clap', category: 'reactions', keywords: ['clap', 'applause', 'bravo', 'good job'], url: 'https://media.giphy.com/media/l3q2XhfQ8oCkm1K76/giphy.gif' },
  { id: '5', title: 'Popcorn Time', category: 'reactions', keywords: ['popcorn', 'watching', 'drama', 'entertained'], url: 'https://media.giphy.com/media/hVTouUU07GlYCfz2BK/giphy.gif' },
  { id: '6', title: 'Thumbs Up', category: 'reactions', keywords: ['thumbs', 'up', 'yes', 'ok', 'agree', 'approve'], url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif' },
  { id: '7', title: 'LOL Laugh', category: 'happy', keywords: ['laugh', 'lol', 'haha', 'funny', 'hilarious'], url: 'https://media.giphy.com/media/l0ExceU3zY1x542pG/giphy.gif' },
  { id: '8', title: 'Surprised Pikachu', category: 'reactions', keywords: ['surprised', 'shocked', 'what', 'pikachu'], url: 'https://media.giphy.com/media/3kzJvEciJaPPxNRxk7/giphy.gif' },
  { id: '9', title: 'Cheering Crowd', category: 'happy', keywords: ['cheer', 'celebrate', 'hurray', 'win'], url: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif' },
  { id: '10', title: 'Cool Shades', category: 'memes', keywords: ['cool', 'deal with it', 'shades', 'swagger'], url: 'https://media.giphy.com/media/62PP2yEIAZF6g/giphy.gif' },

  // Reactions
  { id: '11', title: 'Mic Drop', category: 'reactions', keywords: ['mic drop', 'boom', 'done', 'won'], url: 'https://media.giphy.com/media/3oEjI5VtIhHvK31WYo/giphy.gif' },
  { id: '12', title: 'High Five', category: 'reactions', keywords: ['high five', 'team', 'agree', 'slap'], url: 'https://media.giphy.com/media/d2Z9UWkZJNXy8/giphy.gif' },
  { id: '13', title: 'Facepalm', category: 'reactions', keywords: ['facepalm', 'smh', 'disappointed', 'sigh'], url: 'https://media.giphy.com/media/XsUtdIeJ0MWMo/giphy.gif' },
  { id: '14', title: 'Confused Travolta', category: 'reactions', keywords: ['confused', 'where', 'lost', 'what'], url: 'https://media.giphy.com/media/g01ZnwAUvutuK8GIQn/giphy.gif' },
  { id: '15', title: 'Nod of Approval', category: 'reactions', keywords: ['nod', 'yes', 'agree', 'indeed'], url: 'https://media.giphy.com/media/NEvPzZ8bd1V4Y/giphy.gif' },
  { id: '16', title: 'Shrug', category: 'reactions', keywords: ['shrug', 'dunno', 'idk', 'whatever'], url: 'https://media.giphy.com/media/jPAdK8Nfzzwt2/giphy.gif' },
  { id: '17', title: 'Slow Clap', category: 'reactions', keywords: ['slow clap', 'sarcasm', 'bravo'], url: 'https://media.giphy.com/media/Swx36wwSsU49HAnIhC/giphy.gif' },
  { id: '18', title: 'Eye Roll', category: 'reactions', keywords: ['eye roll', 'annoyed', 'whatever', 'bored'], url: 'https://media.giphy.com/media/Rhhr8D5mKSXL9cXoydc/giphy.gif' },
  { id: '19', title: 'Wait What', category: 'reactions', keywords: ['wait', 'what', 'hold on', 'excuse me'], url: 'https://media.giphy.com/media/lkdH8FmImcGoykgF49/giphy.gif' },
  { id: '20', title: 'Finger Guns', category: 'reactions', keywords: ['finger guns', 'nice', 'you got it', 'smooth'], url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif' },

  // Joy & Celebration
  { id: '21', title: 'Party Confetti', category: 'happy', keywords: ['party', 'celebrate', 'confetti', 'yay'], url: 'https://media.giphy.com/media/R6nmqBtZOj43S/giphy.gif' },
  { id: '22', title: 'SpongeBob Dance', category: 'happy', keywords: ['spongebob', 'dance', 'happy', 'fun'], url: 'https://media.giphy.com/media/3oEjI5W1uH6fN/giphy.gif' },
  { id: '23', title: 'Kermit Excited', category: 'happy', keywords: ['kermit', 'yay', 'excited', 'flailing'], url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif' },
  { id: '24', title: 'Baby Dancing', category: 'happy', keywords: ['baby', 'groove', 'happy', 'cute'], url: 'https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif' },
  { id: '25', title: 'Carlton Dance', category: 'happy', keywords: ['carlton', 'fresh prince', 'dance', 'moves'], url: 'https://media.giphy.com/media/pa37AAG5KXjhe/giphy.gif' },
  { id: '26', title: 'Excited Dog', category: 'happy', keywords: ['dog', 'excited', 'zoomies', 'happy'], url: 'https://media.giphy.com/media/3ndAvMC5lfPNMCzq7m/giphy.gif' },
  { id: '27', title: 'Victory Cheer', category: 'happy', keywords: ['victory', 'winner', 'yes', 'we did it'], url: 'https://media.giphy.com/media/nXxOjZrbnbRxS/giphy.gif' },

  // Love & Affection
  { id: '28', title: 'Heart Eyes', category: 'love', keywords: ['heart', 'love', 'in love', 'adoring'], url: 'https://media.giphy.com/media/26BRv0ThflsHCqDrG/giphy.gif' },
  { id: '29', title: 'Big Hug', category: 'love', keywords: ['hug', 'cuddle', 'warmth', 'friend'], url: 'https://media.giphy.com/media/l8ooT58lfuNQzSUCZO/giphy.gif' },
  { id: '30', title: 'Sending Love', category: 'love', keywords: ['kiss', 'love', 'hearts', 'affection'], url: 'https://media.giphy.com/media/M90mJvfWfd5mbUuULX/giphy.gif' },
  { id: '31', title: 'Bear Hug', category: 'love', keywords: ['bear', 'hug', 'sweet', 'comfort'], url: 'https://media.giphy.com/media/od5H3PmEG5EVq/giphy.gif' },
  { id: '32', title: 'Puppy Love', category: 'love', keywords: ['puppy', 'cute', 'dog', 'kisses'], url: 'https://media.giphy.com/media/eHpWHuEUxHIre/giphy.gif' },

  // Memes
  { id: '33', title: 'Blinking Guy', category: 'memes', keywords: ['blinking', 'guy', 'drew scanlon', 'shocked'], url: 'https://media.giphy.com/media/KzG1EhVQwhqYK/giphy.gif' },
  { id: '34', title: 'Shiba Tap', category: 'memes', keywords: ['shiba', 'doge', 'typing', 'coding'], url: 'https://media.giphy.com/media/5aXH4Bb8Af2xgY4i2/giphy.gif' },
  { id: '35', title: 'This is Fine', category: 'memes', keywords: ['this is fine', 'fire', 'dog', 'calm', 'disaster'], url: 'https://media.giphy.com/media/9Y5BbDSkSTiY8/giphy.gif' },
  { id: '36', title: 'Pop Cat', category: 'memes', keywords: ['pop cat', 'cat', 'meme', 'cute'], url: 'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif' },
  { id: '37', title: 'Homer Hedge Bush', category: 'memes', keywords: ['homer', 'simpsons', 'disappear', 'leaving', 'retreat'], url: 'https://media.giphy.com/media/a93jwI0wkWTQs/giphy.gif' },
  { id: '38', title: 'Roll Safe Smart', category: 'memes', keywords: ['smart', 'think', 'brain', 'clever'], url: 'https://media.giphy.com/media/d3mlE7uhX8KFgEmY/giphy.gif' },
  { id: '39', title: 'Evil Kermit', category: 'memes', keywords: ['kermit', 'dark side', 'hood', 'inner thoughts'], url: 'https://media.giphy.com/media/3oriO04qxVReM5rJEA/giphy.gif' },
  { id: '40', title: 'Dramatic Chipmunk', category: 'memes', keywords: ['dramatic', 'look', 'shock', 'twist'], url: 'https://media.giphy.com/media/kKdgdegbqy0ZG/giphy.gif' },

  // Moods & Work
  { id: '41', title: 'Coffee Time', category: 'moods', keywords: ['coffee', 'morning', 'wake up', 'caffeine'], url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif' },
  { id: '42', title: 'Typing Fast', category: 'moods', keywords: ['typing', 'working', 'hacker', 'busy'], url: 'https://media.giphy.com/media/unQ3IJU2RG7DO/giphy.gif' },
  { id: '43', title: 'Sleepy Cat', category: 'moods', keywords: ['sleep', 'tired', 'nap', 'bed'], url: 'https://media.giphy.com/media/mguPrVJAnEHIY/giphy.gif' },
  { id: '44', title: 'Head Desk', category: 'moods', keywords: ['head desk', 'bang', 'frustrated', 'stress'], url: 'https://media.giphy.com/media/6yRVg0HWzgS88/giphy.gif' },
  { id: '45', title: 'Monday Mood', category: 'moods', keywords: ['monday', 'exhausted', 'sigh', 'mood'], url: 'https://media.giphy.com/media/3ohzdQ1IynzclJldUQ/giphy.gif' },

  // Greetings
  { id: '46', title: 'Wave Bye', category: 'greetings', keywords: ['wave', 'bye', 'goodbye', 'see ya'], url: 'https://media.giphy.com/media/m9eG1qVjvN56H0MXt8/giphy.gif' },
  { id: '47', title: 'Hey There Hello', category: 'greetings', keywords: ['hello', 'hi', 'hey', 'greeting'], url: 'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif' },
  { id: '48', title: 'Peace Out', category: 'greetings', keywords: ['peace', 'out', 'bye', 'leaving'], url: 'https://media.giphy.com/media/BCObUe3mN0F1K/giphy.gif' },
  { id: '49', title: 'Welcome In', category: 'greetings', keywords: ['welcome', 'enter', 'come in', 'hello'], url: 'https://media.giphy.com/media/l0MYC0LajbaPoEADu/giphy.gif' },
  { id: '50', title: 'Salute', category: 'greetings', keywords: ['salute', 'respect', 'captain', 'honor'], url: 'https://media.giphy.com/media/l4pMattUYTTM7qpIk/giphy.gif' },
];

export function GifPicker({ onSelectGif, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
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

  const filteredGifs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return EXPANDED_GIFS.filter((gif) => {
      const matchesCategory = selectedCategory === 'all' || gif.category === selectedCategory;
      if (!query) return matchesCategory;

      const matchesSearch =
        gif.title.toLowerCase().includes(query) ||
        gif.keywords.some((k) => k.toLowerCase().includes(query));

      return matchesCategory && matchesSearch;
    });
  }, [search, selectedCategory]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-14 right-8 w-96 max-w-[calc(100vw-2rem)] h-[440px] bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      {/* Header with Search */}
      <div className="p-3 border-b border-dark-700 bg-dark-850 flex items-center justify-between gap-2">
        <div className="flex-1 relative flex items-center">
          <Search className="w-4 h-4 absolute left-3 text-dark-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all GIFs & reactions..."
            className="w-full pl-9 pr-3 py-1.5 bg-dark-700 border border-dark-600 rounded-xl text-xs text-white placeholder-dark-400 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-all"
            autoFocus
          />
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-dark-700 bg-dark-800 overflow-x-auto custom-scrollbar shrink-0">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-primary-500/20 text-primary-300 border border-primary-500/40'
                  : 'text-dark-300 hover:text-white hover:bg-dark-700'
              }`}
            >
              <Icon className="w-3 h-3" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* GIFs Grid */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {filteredGifs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-dark-400 text-xs gap-2 py-8">
            <Sparkles className="w-6 h-6 text-dark-500" />
            <span>No matching GIFs found</span>
            <button
              onClick={() => {
                setSearch('');
                setSelectedCategory('all');
              }}
              className="text-primary-400 hover:underline text-[11px] mt-1"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filteredGifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelectGif(gif.url)}
                title={gif.title}
                className="group relative rounded-xl overflow-hidden bg-dark-700 border border-dark-600/60 hover:border-primary-500/60 transition-all aspect-video flex items-center justify-center focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <img
                  src={gif.url}
                  alt={gif.title}
                  loading="lazy"
                  onError={(e) => {
                    // Gracefully hide broken image element so container shows background
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                  <span className="text-[11px] font-medium text-white truncate w-full text-left">
                    {gif.title}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-dark-700 bg-dark-850 flex items-center justify-between text-[10px] text-dark-400">
        <span>Showing {filteredGifs.length} GIFs</span>
        <span>End-to-End Encrypted</span>
      </div>
    </div>
  );
}
