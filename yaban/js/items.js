// Eşyalar, tarifler ve oyun içi tanımlar.

export const ITEMS = {
  wood:    { name: 'Odun', stack: 99 },
  stone:   { name: 'Taş', stack: 99 },
  fiber:   { name: 'Lif', stack: 99 },
  berry:   { name: 'Orman Meyvesi', stack: 40, food: { hunger: 9, thirst: 6 } },
  meat:    { name: 'Çiğ Et', stack: 20, food: { hunger: 12, hp: -6 } },
  cooked:  { name: 'Pişmiş Et', stack: 20, food: { hunger: 40, hp: 15 } },
  hide:    { name: 'Deri', stack: 40 },
  essence: { name: 'Gölge Özü', stack: 40 },
  bandage: { name: 'Bandaj', stack: 10, heal: 35 },
  axe:     { name: 'Taş Balta', tool: { dmg: 14, wood: 3, stone: 1, reach: 2.5, cd: 0.55 } },
  pick:    { name: 'Taş Kazma', tool: { dmg: 12, wood: 1, stone: 3, reach: 2.5, cd: 0.55 } },
  spear:   { name: 'Mızrak', tool: { dmg: 26, wood: 1, stone: 1, reach: 3.4, cd: 0.65 } },
  torch:   { name: 'Meşale', tool: { dmg: 10, wood: 1, stone: 1, reach: 2.3, cd: 0.5 }, light: true },
  sword:   { name: 'Gölge Kılıcı', tool: { dmg: 50, wood: 2, stone: 2, reach: 2.9, cd: 0.45 } },
  armor:   { name: 'Deri Zırh', passive: true },
  campfire:{ name: 'Kamp Ateşi', place: 'campfire', stack: 5 },
  wall:    { name: 'Ahşap Duvar', place: 'wall', stack: 20 },
  spikes:  { name: 'Kazık Tuzağı', place: 'spikes', stack: 10 },
  bed:     { name: 'Uyku Tulumu', place: 'bed', stack: 1 },
};

export const HAND = { dmg: 7, wood: 1, stone: 1, reach: 2.2, cd: 0.45 };

export function toolOf(id) {
  return (id && ITEMS[id] && ITEMS[id].tool) || HAND;
}

export function stackOf(id) {
  return (ITEMS[id] && ITEMS[id].stack) || 1;
}

export const RECIPES = [
  { out: 'axe', n: 1, cost: { wood: 5, stone: 3 }, desc: 'Ağaçtan 3 kat odun. Silah olarak da iş görür.' },
  { out: 'pick', n: 1, cost: { wood: 5, stone: 5 }, desc: 'Kayadan 3 kat taş.' },
  { out: 'torch', n: 1, cost: { wood: 3, fiber: 2 }, desc: 'Elinde tutunca geceyi aydınlatır.' },
  { out: 'campfire', n: 1, cost: { wood: 10, stone: 6 }, desc: 'Işık, ısı ve can yeniler. Gölgeler ateşe yaklaşamaz!' },
  { out: 'cooked', n: 1, cost: { meat: 1 }, fire: true, desc: 'Yanan bir ateşin yanında pişir. Doyurucu ve iyileştirir.' },
  { out: 'spear', n: 1, cost: { wood: 8, stone: 4, fiber: 3 }, desc: 'Uzun menzil, yüksek hasar.' },
  { out: 'wall', n: 2, cost: { wood: 8 }, desc: 'Yaratıkların yolunu keser (2 adet).' },
  { out: 'spikes', n: 1, cost: { wood: 6, stone: 2 }, desc: 'Üstüne basan düşmana hasar verir.' },
  { out: 'bandage', n: 1, cost: { fiber: 5 }, desc: '+35 can.' },
  { out: 'bed', n: 1, cost: { fiber: 10, hide: 2 }, desc: 'Öldüğünde burada yeniden doğarsın.' },
  { out: 'armor', n: 1, cost: { hide: 6, fiber: 6 }, desc: 'Envanterinde durdukça hasarı %35 azaltır.' },
  { out: 'sword', n: 1, cost: { essence: 5, stone: 10, wood: 5 }, desc: 'Gölgelerin özünden dövülmüş efsanevi kılıç.' },
];

// Ölünce yere düşen eşyalar (aletler ve yapılar sende kalır)
export const RESOURCE_ITEMS = ['wood', 'stone', 'fiber', 'berry', 'meat', 'cooked', 'hide', 'essence', 'bandage'];

export const MOB_TYPES = ['deer', 'boar', 'wolf', 'ghoul', 'brute'];
export const MOB_NAMES = { deer: 'Geyik', boar: 'Yaban Domuzu', wolf: 'Kurt', ghoul: 'Gölge', brute: 'Dev Gölge' };
export const MOB_R = { deer: 0.6, boar: 0.65, wolf: 0.55, ghoul: 0.45, brute: 0.85 };
export const NODE_NAMES = { pine: 'Çam Ağacı', oak: 'Meşe Ağacı', rock: 'Kaya', bush: 'Meyve Çalısı' };
export const STRUCTS = {
  campfire: { name: 'Kamp Ateşi', hp: 150 },
  wall: { name: 'Ahşap Duvar', hp: 220 },
  spikes: { name: 'Kazık Tuzağı', hp: 14 },
  bed: { name: 'Uyku Tulumu', hp: 100 },
};
