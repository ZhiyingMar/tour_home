// 全局配置。想调房间、文案、扩展开关都在这里。

export const GAME_TITLE = '星光小屋';
export const DEFAULT_NAME = '小颖';
export const SAVE_KEY = 'starhome.save.v1';

// 房间范围（米）：x 左右，z 前后（负数靠里），h 墙高
export const ROOM = { x0: -6, x1: 6, z0: -3.5, z1: 4, h: 4.2 };

// ───── 扩展位（现在都不实现，只留开关和入口）─────
// kitchen：右墙那扇门是入口，实现时在 main.js 的 acts.door 里切换房间，
//          新房间照 room.js 的 buildRoom 写一个 buildKitchen 即可。
// multiplayer：所有玩家动作都经过 store.js 的 bus.emit('action')，联机时把它同步出去。
// seasons：scenery.js 里的 PALETTES 按季节加一组配色，再把 SEASON 换成对应的键。
export const FEATURES = { kitchen: false, multiplayer: false, seasons: false };
export const SEASON = 'default';

// 桌上的信（占位文字，之后直接改这里）
export const LETTER_TEXT = [
  '{name}：',
  '见字如面。',
  '这封信先替以后想说的话占个位置。等想好要写什么，再把它换掉。',
  '壁炉边很暖，窗外偶尔会有小火车经过。累了就窝进沙发，小星胸前的小星星会替你留一盏灯。',
  '——小屋',
];
