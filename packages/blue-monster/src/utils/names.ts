/**
 * BlueMonster 隨機名稱產生器
 * 為每個任務創建一個友善、好記的名稱
 */

// 簡單好記的英文名字（按字母排序，容易找到對應）
const SIMPLE_NAMES = [
  'Ace', 'Ada', 'Axel', 'Bailey', 'Bear', 'Blue', 'Boo', 'Buddy',
  'Charlie', 'Chip', 'Cleo', 'Coco', 'Cookie', 'Dash', 'Dot', 'Duke',
  'Echo', 'Eddie', 'Ella', 'Finn', 'Flash', 'Fluffy', 'Ginger', 'Gizmo',
  'Happy', 'Hazel', 'Honey', 'Ivy', 'Jack', 'Jazz', 'Jelly', 'Joy',
  'Kiki', 'Leo', 'Lucky', 'Luna', 'Max', 'Milo', 'Minty', 'Mochi',
  'Nala', 'Neo', 'Niko', 'Nova', 'Olive', 'Oreo', 'Oscar', 'Panda',
  'Peach', 'Penny', 'Pepper', 'Pip', 'Pixel', 'Poppy', 'Rex', 'Rocky',
  'Ruby', 'Sam', 'Scout', 'Shadow', 'Sky', 'Smoky', 'Snow', 'Spark',
  'Star', 'Sunny', 'Taco', 'Tiger', 'Toby', 'Trixie', 'Ziggy', 'Zoe'
];

// 水果名稱
const FRUIT_NAMES = [
  'Apple', 'Apricot', 'Banana', 'Berry', 'Cherry', 'Citrus', 'Clementine',
  'Coconut', 'Date', 'Fig', 'Grape', 'Guava', 'Kiwi', 'Lemon', 'Lime',
  'Lychee', 'Mango', 'Melon', 'Orange', 'Papaya', 'Peach', 'Pear',
  'Pineapple', 'Plum', 'Pomelo', 'Raspberry', 'Strawberry', 'Tangerine', 'Watermelon'
];

// 動物名稱（可愛的）
const ANIMAL_NAMES = [
  'Bunny', 'Butterfly', 'Cat', 'Dolphin', 'Dragon', 'Duck', 'Eagle',
  'Elephant', 'Fox', 'Frog', 'Hamster', 'Hedgehog', 'Koala', 'Ladybug',
  'Lion', 'Owl', 'Panda', 'Penguin', 'Phoenix', 'Rabbit', 'Raccoon',
  'Sparrow', 'Squirrel', 'Tiger', 'Turtle', 'Unicorn', 'Wolf'
];

// 顏色形容詞（可選，讓名字更獨特）
const COLOR_ADJECTIVES = [
  'Blue', 'Coral', 'Crimson', 'Crystal', 'Golden', 'Jade', 'Midnight',
  'Mint', 'Rose', 'Ruby', 'Silver', 'Sunset', 'Teal', 'Violet'
];

// 所有名稱池
const ALL_NAMES = [...SIMPLE_NAMES, ...FRUIT_NAMES, ...ANIMAL_NAMES];

// 對應的 Emoji（用於顯示）
const NAME_EMOJIS: Record<string, string> = {
  // 水果
  'Apple': '🍎', 'Apricot': '🍑', 'Banana': '🍌', 'Berry': '🫐', 'Cherry': '🍒',
  'Citrus': '🍊', 'Clementine': '🍊', 'Coconut': '🥥', 'Date': '🌴', 'Fig': '🫒',
  'Grape': '🍇', 'Guava': '🥝', 'Kiwi': '🥝', 'Lemon': '🍋', 'Lime': '🍈',
  'Lychee': '🍒', 'Mango': '🥭', 'Melon': '🍈', 'Orange': '🍊', 'Papaya': '🥭',
  'Peach': '🍑', 'Pear': '🍐', 'Pineapple': '🍍', 'Plum': '🍇', 'Pomelo': '🍊',
  'Raspberry': '🍓', 'Strawberry': '🍓', 'Tangerine': '🍊', 'Watermelon': '🍉',
  // 動物
  'Bunny': '🐰', 'Butterfly': '🦋', 'Cat': '🐱', 'Dolphin': '🐬', 'Dragon': '🐲',
  'Duck': '🦆', 'Eagle': '🦅', 'Elephant': '🐘', 'Fox': '🦊', 'Frog': '🐸',
  'Hamster': '🐹', 'Hedgehog': '🦔', 'Koala': '🐨', 'Ladybug': '🐞', 'Lion': '🦁',
  'Owl': '🦉', 'Panda': '🐼', 'Penguin': '🐧', 'Phoenix': '🔥', 'Rabbit': '🐇',
  'Raccoon': '🦝', 'Sparrow': '🐦', 'Squirrel': '🐿️', 'Tiger': '🐯', 'Turtle': '🐢',
  'Unicorn': '🦄', 'Wolf': '🐺',
  // 其他常見名字
  'Bear': '🐻', 'Blue': '💙', 'Cookie': '🍪', 'Honey': '🍯', 'Lucky': '🍀',
  'Luna': '🌙', 'Mochi': '🍡', 'Nova': '⭐', 'Oreo': '🍪', 'Pixel': '🎮',
  'Shadow': '🌑', 'Sky': '🌈', 'Snow': '❄️', 'Spark': '✨', 'Star': '⭐',
  'Sunny': '☀️', 'Taco': '🌮', 'Ziggy': '⚡'
};

// 預設 emoji
const DEFAULT_EMOJI = '👾';

/**
 * 產生一個隨機的 BlueMonster 名稱
 * @param usedNames 已使用的名稱集合（避免重複）
 * @returns 隨機名稱
 */
export function generateRandomName(usedNames?: Set<string>): string {
  const available = usedNames 
    ? ALL_NAMES.filter(n => !usedNames.has(n))
    : ALL_NAMES;
  
  if (available.length === 0) {
    // 所有名字都用過了，加上數字後綴
    const baseName = ALL_NAMES[Math.floor(Math.random() * ALL_NAMES.length)];
    const suffix = Math.floor(Math.random() * 100);
    return `${baseName}${suffix}`;
  }
  
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * 取得名稱對應的 Emoji
 * @param name BlueMonster 名稱
 * @returns 對應的 emoji 或預設值
 */
export function getNameEmoji(name: string): string {
  return NAME_EMOJIS[name] || DEFAULT_EMOJI;
}

/**
 * 產生帶 Emoji 的完整顯示名稱
 * @param name BlueMonster 名稱
 * @returns "emoji Name" 格式
 */
export function formatNameWithEmoji(name: string): string {
  const emoji = getNameEmoji(name);
  return `${emoji} ${name}`;
}

// 導出名稱列表供其他用途
export { ALL_NAMES, FRUIT_NAMES, SIMPLE_NAMES, ANIMAL_NAMES };
