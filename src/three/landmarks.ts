/** Framing presets and camera angles for each holy landmark (zero three.js runtime dependency). */
export interface LandmarkPreset {
  id: string;
  name: string;
  icon: string;
  desc: string;
  azimuth: number;
  polar: number;
  distFactor: number;
  centerOffset: [number, number, number];
}

export const KAABA_LANDMARKS: LandmarkPreset[] = [
  {
    id: 'overview',
    name: 'نظرة شاملة',
    icon: '🕋',
    desc: 'الكعبة المشرفة وصحن المطاف وحجر إسماعيل ومقام إبراهيم.',
    azimuth: 0.8,
    polar: 1.15,
    distFactor: 1.0,
    centerOffset: [0, 5, 0],
  },
  {
    id: 'hajar',
    name: 'الحجر الأسود',
    icon: '🖤',
    desc: 'الركن الجنوبي الشرقي، الإطار الفضي المصمت، مبدأ الطواف ومنتهاه.',
    azimuth: 0.78,
    polar: 1.35,
    distFactor: 0.32,
    centerOffset: [6, 1.8, 5.5],
  },
  {
    id: 'door',
    name: 'باب الكعبة والملتزم',
    icon: '🚪',
    desc: 'الباب الذهبي الخالص، والملتزم بين الحجر والباب حيث يُستجاب الدعاء.',
    azimuth: 1.55,
    polar: 1.25,
    distFactor: 0.38,
    centerOffset: [6, 3.8, -1.5],
  },
  {
    id: 'mizab',
    name: 'ميزاب الرحمة',
    icon: '🌧️',
    desc: 'ميزاب الذهب الخالص أعلى الجدار الشمالي الغربي يصب في حجر إسماعيل.',
    azimuth: -1.55,
    polar: 0.72,
    distFactor: 0.4,
    centerOffset: [0, 11, -5.5],
  },
  {
    id: 'hijr',
    name: 'حجر إسماعيل (الحطيم)',
    icon: '🌙',
    desc: 'الجدار الرخامي المقوس، الصلاة داخله تعد صلاة داخل الكعبة المشرفة.',
    azimuth: -1.55,
    polar: 0.95,
    distFactor: 0.65,
    centerOffset: [0, 2, -8],
  },
  {
    id: 'maqam',
    name: 'مقام إبراهيم',
    icon: '🏛️',
    desc: 'المقصورة الذهبية التي تضم حجر أثر قدمي الخليل إبراهيم عليه السلام.',
    azimuth: 1.7,
    polar: 1.3,
    distFactor: 0.45,
    centerOffset: [10, 1.5, -1.5],
  },
  {
    id: 'yamani',
    name: 'الركن اليماني',
    icon: '🧭',
    desc: 'الركن الجنوبي الغربي، يُستلم باليمين دون تقبيل اقتداءً بسنة النبي ﷺ.',
    azimuth: -0.78,
    polar: 1.35,
    distFactor: 0.35,
    centerOffset: [-6, 1.8, 5.5],
  },
];
