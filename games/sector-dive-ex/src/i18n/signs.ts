// The words on the scenery's signs (world/looks.ts). They are part of the picture, not text for the player, so they
// are the same in every language; they live here because this is where the game keeps its written words.
// The walled city: made-up shop names in traditional Chinese, the way a Hong Kong street writes them (a lucky name,
// then the trade), and the one or two characters of a neon sign that stands out from a wall
export const KWLN_SHOP_NAMES = ['永興麵家', '福記茶餐廳', '榮華藥房', '新發電器行', '金龍大押', '合興雜貨'];
// painted down each leaf of the boss room's door
export const KWLN_DANGER = '危險';
export const KWLN_NEON_WORDS = ['冰室', '旅館', '酒家', '麻雀', '理髮', '茶樓', '押', '藥'];
// The smelter block: the enamel plates of a Japanese steelworks ("mind the heat", "safety first"), and the warning
// painted down each leaf of the boss room's door
export const FORGE_PLATE_HEAT = '高温注意';
export const FORGE_PLATE_SAFETY = '安全第一';
export const FORGE_DANGER = '危険';
// The deep noise: the plates of a Japanese broadcasting station ("quiet", "staff only"), the lamp sign over a studio,
// and the warning ("high voltage") painted down each leaf of the boss room's door
export const NOISE_PLATE_QUIET = '静粛';
export const NOISE_PLATE_STAFF = '関係者以外立入禁止';
export const NOISE_ON_AIR = 'ON AIR';
export const NOISE_DANGER = '高電圧';
// The ruined streets: the head of the residents' notice board ("notice board"), and the plate on the boss room's door
// ("keep out")
export const RUIN_NOTICE_BOARD = '掲示板';
export const RUIN_KEEP_OUT = '立入禁止';
// The old downtown: the signs of a Japanese office building (the emergency exit, the floor guide, the plate over a
// fire extinguisher), and "keep out" painted down each leaf of the boss room's door
export const CITY_EXIT = '非常口';
export const CITY_GUIDE = 'フロア案内';
export const CITY_EXTINGUISHER = '消火器';
export const CITY_KEEP_OUT = '立入禁止';
// The shopping mall: made-up shop names (the shutters of the closed shops), the plates and notices of a Japanese
// mall (floor guide, closing sale, closed, toilets, fire hydrant), the places the hanging direction signs point to,
// and the warning ("staff only") on the boss room's loading-bay shutter
// (by kind of shop: a clothes shop, a cafe, a bookshop, an optician's, an electronics shop, a drugstore, the food
// court; a shop's room draws its name from its kind's list. The food court has the one name)
export const MALL_SHOP_NAMES = [
  [
    'ルナ・ブティック',
    'ファッション ミドリ',
    'メンズ カトウ',
    'ブティック さくら',
    'レディース ハナ',
    'トレンド ミナミ',
  ],
  ['カフェ ソレイユ', '喫茶 みなと', '珈琲 のんびり', 'カフェ ルナ', '茶房 しずく', '喫茶 ひだまり'],
  ['ほんのいずみ', '書店 あおぞら', '本の森', 'ブックス ふじ', '文楽堂', '古書 つばき'],
  ['メガネのミツイ', 'めがね ひかり', 'アイケア 松本', 'めがね 光明堂', '視力館 まなび', 'メガネ ハルカ'],
  ['デンキのサクラ', 'スマホ館', '家電 ふじや', 'デンキの ウメ', 'モバイル 桜井', '電器 みどり堂'],
  ['くすりの ヒマワリ', 'ドラッグ ふじ', '薬局 みどり', 'ドラッグ すずらん', 'くすり 笑顔堂', 'ヘルスケア 竹'],
  ['フードコート'],
];
// the food court's stalls (on the walls of its room: two to a picture)
export const MALL_STALLS = [
  'うどん 山彦',
  'ラーメン 春日',
  'カレー ごえもん',
  'ハンバーガー ポップ',
  'たこ焼き まるまる',
  '定食 おふくろ',
];
// the cloth banners hung in the mall's atrium, one picture each: its words in one or two columns, written downward
// (the first column on the right; the long-vowel mark is 丨 there, as it is written downward)
export const MALL_BANNERS = [
  ['閉店セ丨ル'],
  ['毎月10日は', 'ポイント5倍'],
  ['夏の大感謝祭'],
  ['全品半額'],
  ['ご愛顧', '感謝セール'],
  ['お買い得', '最終週'],
];
export const MALL_WATER = 'お水';
// an empty tenancy's notice, and the plate over a lift's way in
export const MALL_VACANT = 'テナント募集';
export const MALL_LIFT = 'エレベーター';
// the words in the shops' rooms: the cafe's menu board, the food court's tray return, the optician's eye chart is
// letters only
export const MALL_MENU = 'メニュー';
export const MALL_TRAY_RETURN = '返却口';
export const MALL_PHARMACY = '調剤薬局';
export const MALL_FITTING = '試着室';
export const MALL_GUIDE = 'フロアガイド';
export const MALL_SALE = '閉店セール';
export const MALL_CLOSED = '閉店しました';
export const MALL_TOILET = 'お手洗い';
export const MALL_HYDRANT = '消火栓';
export const MALL_STAFF_ONLY = '関係者以外立入禁止';
export const MALL_EXIT = '非常口';
export const MALL_NOTICE = 'お知らせ';
export const MALL_PUSH = '押';
export const MALL_ATM = 'ATM';
// the mall's loading dock (its boss room): the plates high on its walls
export const MALL_DOCK = '搬入口';
export const MALL_DOCK_YARD = '荷捌き場';
export const MALL_FORKLIFT = ['フォークリフト', '通行注意'];
export const MALL_DIRECTIONS = ['↑ 階段・エレベーター', '← 駐車場', 'お手洗い →', 'インフォメーション →'];
// what the closed mall left along its walls: the plate over the coin lockers, the sign on a shuttered sales wagon, the
// photo booth's and the massage chairs' headers, the stand sign that fell over, and the paper pops torn down from the
// ceiling
export const MALL_LOCKERS = 'コインロッカー';
export const MALL_WAGON = '準備中';
export const MALL_PHOTO = 'フォトブース';
export const MALL_MASSAGE = 'マッサージ';
export const MALL_GACHA = 'ガチャ';
export const MALL_STAND_SALE = 'SALE';
export const MALL_POPS = ['本日限り', '特価', '在庫一掃'];
// The closed hospital: the department boards over the rooms' doors (by kind of room: a ward, a consulting room, an
// examination room, the pharmacy, the linen room and stores, the waiting hall; a room draws its name from its kind's
// list), the plates and notices of a Japanese general hospital, the signs hung in the corridors and the words on the
// operating theatre's doors (its boss room)
export const HOSP_DEPARTMENTS = [
  ['3階東病棟', '内科病棟', '外科病棟', '小児科病棟', '4階西病棟', '整形外科病棟'],
  ['内科', '外科', '小児科', '整形外科', '耳鼻咽喉科', '眼科'],
  ['放射線科', 'CT検査室', 'X線撮影室', '検体検査', '超音波検査', '内視鏡室'],
  ['薬剤部', '調剤室', '薬局', 'お薬の受け渡し'],
  ['リネン室', '中央倉庫', '物品庫', '材料室', '洗濯物収集'],
  ['外来待合', '総合受付', '会計・待合'],
];
export const HOSP_LIFT = 'エレベーター';
export const HOSP_GUIDE = '院内案内';
export const HOSP_DEPT_GUIDE = '診療科のご案内';
export const HOSP_DEPT_LIST = ['内科', '外科', '小児科', '放射線科', '薬局'];
export const HOSP_TOILET = 'お手洗い';
export const HOSP_HYDRANT = '消火栓';
export const HOSP_NOTICE = '掲示板';
export const HOSP_EXIT = '非常口';
export const HOSP_AED = 'AED';
export const HOSP_SANITIZER = '手指消毒';
export const HOSP_RECEPTION = '受付';
export const HOSP_CALLING = '診察番号';
export const HOSP_PHARMACY_WINDOW = 'お薬の受け渡し';
export const HOSP_PAYMENT = '自動精算機';
export const HOSP_PHONE = '公衆電話';
export const HOSP_LOCKER = 'ロッカー';
export const HOSP_RADIATION = '放射線管理区域';
export const HOSP_NO_ENTRY = '関係者以外立入禁止';
export const HOSP_NURSE_CALL = 'ナースコール';
export const HOSP_BED_LIFT = 'ベッド・ストレッチャー用';
export const HOSP_POSTERS = ['手洗いの徹底を', '面会は午後から', 'マスクの着用を'];
export const HOSP_DIRECTIONS = ['↑ 外来・受付', '← 病棟', '放射線科 →', '手術室 →', '薬局 →', '↑ 階段・エレベーター'];
// the operating theatre (the boss room): the lamp over its doors
export const HOSP_SURGERY = '手術室';
export const HOSP_IN_SURGERY = '手術中';
// what the closed hospital left along its walls: the label of the medicine cabinet, of the stretcher bay, of the
// boxes of charts and of the bags of linen
export const HOSP_MEDICINE = '薬品庫';
export const HOSP_STRETCHER = '救急搬送用';
export const HOSP_CHART = 'カルテ';
export const HOSP_LINEN = 'リネン';
// The discarded data layer: the numbers on the racks, the zone's plate on a wall (its code, and "mind the static"),
// and the word painted down each leaf of the boss room's door ("sealed")
export const DATA_RACK_IDS = ['A-01', 'A-02', 'A-03', 'B-07', 'B-08', 'C-12'];
export const DATA_PLATE_ZONE = 'DS-04';
export const DATA_PLATE_CAUTION = '静電気注意';
export const DATA_SEALED = '封鎖';
// The base: the site office's plates ("safety first", "check before you go in") and the head of its notice board
export const BASE_SAFETY = '安全第一';
export const BASE_CHECK = '作業前点検';
export const BASE_BOARD = '連絡事項';
// HOIST, the loading dock's overhead crane: the plates on its girder (rated load, unit number) and its caution card
export const HOIST_RATING = '定格荷重 10t';
export const HOIST_UNIT = 'HOIST-07';
export const HOIST_CAUTION = '吊り荷注意';
