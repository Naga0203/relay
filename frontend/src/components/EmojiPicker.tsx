import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface Props {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys & Emotion',
    icon: '😀',
    emojis: [
      { char: '😀', keywords: ['grinning', 'smile', 'happy'] },
      { char: '😃', keywords: ['smiley', 'happy', 'joy'] },
      { char: '😄', keywords: ['smile', 'laugh', 'happy'] },
      { char: '😁', keywords: ['grin', 'happy'] },
      { char: '😆', keywords: ['laugh', 'lol', 'funny'] },
      { char: '😅', keywords: ['sweat_smile', 'relief'] },
      { char: '🤣', keywords: ['rofl', 'laughing', 'funny'] },
      { char: '😂', keywords: ['joy', 'tears', 'lol'] },
      { char: '🙂', keywords: ['slightly_smiling', 'smile'] },
      { char: '🙃', keywords: ['upside_down', 'silly'] },
      { char: '😉', keywords: ['wink', 'flirt'] },
      { char: '😊', keywords: ['blush', 'smile', 'loved'] },
      { char: '😇', keywords: ['halo', 'angel'] },
      { char: '🥰', keywords: ['love', 'hearts', 'adore'] },
      { char: '😍', keywords: ['heart_eyes', 'love'] },
      { char: '🤩', keywords: ['star_struck', 'excited'] },
      { char: '😘', keywords: ['kiss', 'love'] },
      { char: '😗', keywords: ['kissing'] },
      { char: '😋', keywords: ['yum', 'savory', 'delicious'] },
      { char: '😛', keywords: ['stuck_out_tongue', 'silly'] },
      { char: '😜', keywords: ['stuck_out_tongue_wink', 'silly'] },
      { char: '🤪', keywords: ['zany', 'crazy'] },
      { char: '😝', keywords: ['stuck_out_tongue_closed_eyes'] },
      { char: '🤑', keywords: ['money', 'rich'] },
      { char: '🤗', keywords: ['hug', 'hugging'] },
      { char: '🤭', keywords: ['hand_over_mouth', 'giggle'] },
      { char: '🤫', keywords: ['shushing', 'quiet', 'secret'] },
      { char: '🤔', keywords: ['thinking', 'ponder'] },
      { char: '🤐', keywords: ['zipper', 'silent'] },
      { char: '🤨', keywords: ['raised_eyebrow', 'skeptical'] },
      { char: '😐', keywords: ['neutral', 'pokerface'] },
      { char: '😑', keywords: ['expressionless'] },
      { char: '😶', keywords: ['no_speech'] },
      { char: '😏', keywords: ['smirk', 'sly'] },
      { char: '😒', keywords: ['unamused', 'bored'] },
      { char: '🙄', keywords: ['eye_roll'] },
      { char: '😬', keywords: ['grimace', 'awkward'] },
      { char: '😮‍💨', keywords: ['sigh', 'exhale'] },
      { char: '🤥', keywords: ['lying', 'pinocchio'] },
      { char: '😌', keywords: ['relieved', 'peaceful'] },
      { char: '😔', keywords: ['pensive', 'sad'] },
      { char: '😪', keywords: ['sleepy'] },
      { char: '🤤', keywords: ['drool'] },
      { char: '😴', keywords: ['sleeping', 'zzz'] },
    ],
  },
  {
    name: 'Hands & People',
    icon: '👋',
    emojis: [
      { char: '👋', keywords: ['wave', 'hello', 'bye'] },
      { char: '🤚', keywords: ['raised_back_of_hand'] },
      { char: '🖐️', keywords: ['hand_splayed'] },
      { char: '✋', keywords: ['high_five', 'stop'] },
      { char: '🖖', keywords: ['vulcan', 'spock'] },
      { char: '👌', keywords: ['ok', 'perfect'] },
      { char: '🤌', keywords: ['pinched_fingers', 'italian'] },
      { char: '🤏', keywords: ['pinching', 'small'] },
      { char: '✌️', keywords: ['victory', 'peace'] },
      { char: '🤞', keywords: ['crossed_fingers', 'luck'] },
      { char: '🤟', keywords: ['love_you'] },
      { char: '🤘', keywords: ['rock_on'] },
      { char: '🤙', keywords: ['call_me'] },
      { char: '👈', keywords: ['point_left'] },
      { char: '👉', keywords: ['point_right'] },
      { char: '👆', keywords: ['point_up'] },
      { char: '🖕', keywords: ['middle_finger'] },
      { char: '👇', keywords: ['point_down'] },
      { char: '☝️', keywords: ['index_finger'] },
      { char: '👍', keywords: ['thumbs_up', 'like', 'agree'] },
      { char: '👎', keywords: ['thumbs_down', 'dislike'] },
      { char: '✊', keywords: ['fist', 'power'] },
      { char: '👊', keywords: ['fist_bump'] },
      { char: '🤛', keywords: ['left_fist'] },
      { char: '🤜', keywords: ['right_fist'] },
      { char: '👏', keywords: ['clap', 'bravo', 'applause'] },
      { char: '🙌', keywords: ['raising_hands', 'celebrate'] },
      { char: '👐', keywords: ['open_hands'] },
      { char: '🤲', keywords: ['palms_up'] },
      { char: '🤝', keywords: ['handshake', 'deal'] },
      { char: '🙏', keywords: ['pray', 'please', 'thanks'] },
      { char: '💪', keywords: ['muscle', 'strong', 'flex'] },
      { char: '🧠', keywords: ['brain', 'smart'] },
      { char: '🫀', keywords: ['heart_organ'] },
      { char: '👀', keywords: ['eyes', 'look', 'see'] },
      { char: '👁️', keywords: ['eye'] },
      { char: '👅', keywords: ['tongue'] },
      { char: '👄', keywords: ['mouth', 'lips'] },
    ],
  },
  {
    name: 'Animals & Nature',
    icon: '🐶',
    emojis: [
      { char: '🐶', keywords: ['dog', 'puppy'] },
      { char: '🐱', keywords: ['cat', 'kitty'] },
      { char: '🐭', keywords: ['mouse'] },
      { char: '🐹', keywords: ['hamster'] },
      { char: '🐰', keywords: ['rabbit', 'bunny'] },
      { char: '🦊', keywords: ['fox'] },
      { char: '🐻', keywords: ['bear'] },
      { char: '🐼', keywords: ['panda'] },
      { char: '🐨', keywords: ['koala'] },
      { char: '🐯', keywords: ['tiger'] },
      { char: '🦁', keywords: ['lion'] },
      { char: '🐮', keywords: ['cow'] },
      { char: '🐷', keywords: ['pig'] },
      { char: '🐸', keywords: ['frog'] },
      { char: '🐵', keywords: ['monkey'] },
      { char: '🐔', keywords: ['chicken'] },
      { char: '🐧', keywords: ['penguin'] },
      { char: '🐦', keywords: ['bird'] },
      { char: '🐤', keywords: ['baby_chick'] },
      { char: '🦆', keywords: ['duck'] },
      { char: '🦅', keywords: ['eagle'] },
      { char: '🦉', keywords: ['owl'] },
      { char: '🦇', keywords: ['bat'] },
      { char: '🐺', keywords: ['wolf'] },
      { char: '🦄', keywords: ['unicorn', 'magic'] },
      { char: '🐝', keywords: ['bee', 'honey'] },
      { char: '🐛', keywords: ['bug'] },
      { char: '🦋', keywords: ['butterfly'] },
      { char: '🐌', keywords: ['snail'] },
      { char: '🐞', keywords: ['ladybug'] },
      { char: '🌸', keywords: ['cherry_blossom', 'flower'] },
      { char: '🌹', keywords: ['rose', 'flower'] },
      { char: '🌺', keywords: ['hibiscus'] },
      { char: '🌻', keywords: ['sunflower'] },
      { char: '🌼', keywords: ['blossom'] },
      { char: '🌷', keywords: ['tulip'] },
      { char: '🌱', keywords: ['seedling', 'plant'] },
      { char: '🌲', keywords: ['tree'] },
      { char: '🌳', keywords: ['deciduous_tree'] },
      { char: '🌴', keywords: ['palm_tree'] },
      { char: '🌵', keywords: ['cactus'] },
      { char: '🌾', keywords: ['sheaf_of_rice'] },
      { char: '🌿', keywords: ['herb'] },
      { char: '☘️', keywords: ['shamrock', 'clover'] },
      { char: '🍀', keywords: ['four_leaf_clover', 'luck'] },
    ],
  },
  {
    name: 'Food & Drink',
    icon: '🍕',
    emojis: [
      { char: '🍏', keywords: ['green_apple'] },
      { char: '🍎', keywords: ['apple'] },
      { char: '🍐', keywords: ['pear'] },
      { char: '🍊', keywords: ['orange', 'tangerine'] },
      { char: '🍋', keywords: ['lemon'] },
      { char: '🍌', keywords: ['banana'] },
      { char: '🍉', keywords: ['watermelon'] },
      { char: '🍇', keywords: ['grapes'] },
      { char: '🍓', keywords: ['strawberry'] },
      { char: '🫐', keywords: ['blueberries'] },
      { char: '🍈', keywords: ['melon'] },
      { char: '🍒', keywords: ['cherries'] },
      { char: '🍑', keywords: ['peach'] },
      { char: '🥭', keywords: ['mango'] },
      { char: '🍍', keywords: ['pineapple'] },
      { char: '🥥', keywords: ['coconut'] },
      { char: '🥝', keywords: ['kiwi'] },
      { char: '🍅', keywords: ['tomato'] },
      { char: '🥑', keywords: ['avocado'] },
      { char: '🥦', keywords: ['broccoli'] },
      { char: '🥒', keywords: ['cucumber'] },
      { char: '🌶️', keywords: ['chili_pepper', 'spicy'] },
      { char: '🌽', keywords: ['corn'] },
      { char: '🥕', keywords: ['carrot'] },
      { char: '🥔', keywords: ['potato'] },
      { char: '🍕', keywords: ['pizza'] },
      { char: '🍔', keywords: ['burger', 'hamburger'] },
      { char: '🍟', keywords: ['fries', 'chips'] },
      { char: '🌭', keywords: ['hotdog'] },
      { char: '🍿', keywords: ['popcorn'] },
      { char: '🥓', keywords: ['bacon'] },
      { char: '🍳', keywords: ['egg', 'breakfast'] },
      { char: '🧇', keywords: ['waffle'] },
      { char: '🥞', keywords: ['pancakes'] },
      { char: '🥐', keywords: ['croissant'] },
      { char: '🍞', keywords: ['bread'] },
      { char: '🧀', keywords: ['cheese'] },
      { char: '🥗', keywords: ['salad'] },
      { char: '🍝', keywords: ['spaghetti', 'pasta'] },
      { char: '🍜', keywords: ['ramen', 'noodles'] },
      { char: '🍲', keywords: ['stew', 'soup'] },
      { char: '🍣', keywords: ['sushi'] },
      { char: '🍱', keywords: ['bento'] },
      { char: '🥟', keywords: ['dumpling'] },
      { char: '🍦', keywords: ['ice_cream'] },
      { char: '🍩', keywords: ['donut'] },
      { char: '🍪', keywords: ['cookie'] },
      { char: '🎂', keywords: ['birthday_cake'] },
      { char: '🍰', keywords: ['cake', 'dessert'] },
      { char: '🧁', keywords: ['cupcake'] },
      { char: '🍫', keywords: ['chocolate'] },
      { char: '🍬', keywords: ['candy'] },
      { char: '🍭', keywords: ['lollipop'] },
      { char: '☕', keywords: ['coffee', 'tea'] },
      { char: '🧃', keywords: ['beverage_box', 'juice'] },
      { char: '🥤', keywords: ['cup_with_straw', 'soda'] },
      { char: '🧋', keywords: ['boba', 'bubble_tea'] },
      { char: '🍺', keywords: ['beer'] },
      { char: '🍻', keywords: ['beers', 'cheers'] },
      { char: '🥂', keywords: ['clinking_glasses', 'cheers'] },
      { char: '🍷', keywords: ['wine'] },
    ],
  },
  {
    name: 'Objects & Symbols',
    icon: '❤️',
    emojis: [
      { char: '❤️', keywords: ['red_heart', 'love'] },
      { char: '🧡', keywords: ['orange_heart'] },
      { char: '💛', keywords: ['yellow_heart'] },
      { char: '💚', keywords: ['green_heart'] },
      { char: '💙', keywords: ['blue_heart'] },
      { char: '💜', keywords: ['purple_heart'] },
      { char: '🖤', keywords: ['black_heart'] },
      { char: '🤍', keywords: ['white_heart'] },
      { char: '🤎', keywords: ['brown_heart'] },
      { char: '💔', keywords: ['broken_heart'] },
      { char: '❣️', keywords: ['exclamation_heart'] },
      { char: '💕', keywords: ['two_hearts'] },
      { char: '💞', keywords: ['revolving_hearts'] },
      { char: '💓', keywords: ['beating_heart'] },
      { char: '💗', keywords: ['growing_heart'] },
      { char: '💖', keywords: ['sparkling_heart'] },
      { char: '💘', keywords: ['heart_arrow'] },
      { char: '💝', keywords: ['heart_ribbon'] },
      { char: '✨', keywords: ['sparkles', 'stars', 'magic'] },
      { char: '⭐', keywords: ['star'] },
      { char: '🌟', keywords: ['glowing_star'] },
      { char: '💫', keywords: ['dizzy', 'star'] },
      { char: '🔥', keywords: ['fire', 'flame', 'lit'] },
      { char: '💥', keywords: ['boom', 'collision'] },
      { char: '💯', keywords: ['hundred', 'score', 'perfect'] },
      { char: '🎉', keywords: ['party_popper', 'tada'] },
      { char: '🎊', keywords: ['confetti_ball'] },
      { char: '🚀', keywords: ['rocket', 'launch', 'fast'] },
      { char: '💡', keywords: ['bulb', 'idea'] },
      { char: '🎁', keywords: ['gift', 'present'] },
      { char: '🎈', keywords: ['balloon'] },
      { char: '🔔', keywords: ['bell', 'notification'] },
      { char: '🎶', keywords: ['notes', 'music'] },
      { char: '🎯', keywords: ['target', 'bullseye'] },
      { char: '🏆', keywords: ['trophy', 'winner'] },
      { char: '👑', keywords: ['crown', 'king', 'queen'] },
    ],
  },
];

export function EmojiPicker({ onSelectEmoji, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(0);
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

  const filteredEmojis = search.trim()
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter(
        (e) =>
          e.char.includes(search) ||
          e.keywords.some((k) => k.toLowerCase().includes(search.toLowerCase()))
      )
    : EMOJI_CATEGORIES[activeCategory].emojis;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-14 right-12 w-80 h-96 bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      {/* Search Header */}
      <div className="p-3 border-b border-dark-700 flex items-center justify-between gap-2 bg-dark-850">
        <div className="flex-1 relative flex items-center">
          <Search className="w-4 h-4 absolute left-3 text-dark-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emojis..."
            className="w-full pl-9 pr-3 py-1.5 bg-dark-700 border border-dark-600 rounded-xl text-xs text-white placeholder-dark-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
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

      {/* Category Tabs */}
      {!search.trim() && (
        <div className="flex items-center justify-around border-b border-dark-700 bg-dark-800 px-1 py-1">
          {EMOJI_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(idx)}
              title={cat.name}
              className={`p-1.5 rounded-lg text-base transition-colors ${
                activeCategory === idx ? 'bg-dark-700 scale-110' : 'opacity-60 hover:opacity-100'
              }`}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji Grid */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {filteredEmojis.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-dark-400">
            No emojis found
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {filteredEmojis.map((e, idx) => (
              <button
                key={`${e.char}-${idx}`}
                onClick={() => onSelectEmoji(e.char)}
                title={e.keywords[0]}
                className="w-9 h-9 flex items-center justify-center text-xl rounded-xl hover:bg-dark-700 hover:scale-125 transition-all duration-100"
              >
                {e.char}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
