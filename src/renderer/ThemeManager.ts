export type ThemeName = 'prism' | 'finale' | 'dark';

export interface ThemeColors {
  name: ThemeName;
  displayName: string;
  bgFill: string;
  cabinetRim: string;
  cabinetPlate: string;
  sensorLine: string;
  judgeRing: string;
  judgeRingSub: string;
  tapPink: string;
  tapBlue: string;
  breakColor: string;
  eachGold: string;
  slideGuide: string;
  slideStar: string;
  holdBody: string;
  touchRing: string;
  buttonHighlight: string;
  hudText: string;
  hudGlow: string;
}

export class ThemeManager {
  private static themes: Record<ThemeName, ThemeColors> = {
    prism: {
      name: 'prism',
      displayName: 'PRiSM / BUDDiES 宇宙幻彩',
      bgFill: '#0b0c16',
      cabinetRim: '#181b2a',
      cabinetPlate: '#101220',
      sensorLine: 'rgba(0, 240, 255, 0.22)',
      judgeRing: '#00f0ff',
      judgeRingSub: 'rgba(255, 42, 133, 0.55)',
      tapPink: '#ff2a85',
      tapBlue: '#00e5ff',
      breakColor: '#ff4400',
      eachGold: '#ffd700',
      slideGuide: '#ffea00',
      slideStar: '#fff066',
      holdBody: 'rgba(255, 170, 0, 0.75)',
      touchRing: '#00f0ff',
      buttonHighlight: 'rgba(0, 240, 255, 0.45)',
      hudText: '#ffffff',
      hudGlow: 'rgba(0, 240, 255, 0.6)'
    },
    finale: {
      name: 'finale',
      displayName: 'FiNALE 经典蓝白金属',
      bgFill: '#0a121f',
      cabinetRim: '#1b2c45',
      cabinetPlate: '#0d1929',
      sensorLine: 'rgba(77, 148, 255, 0.25)',
      judgeRing: '#267df4',
      judgeRingSub: 'rgba(255, 140, 0, 0.5)',
      tapPink: '#e62e7b',
      tapBlue: '#1a8cff',
      breakColor: '#ff3300',
      eachGold: '#ffcc00',
      slideGuide: '#33ccff',
      slideStar: '#ffff33',
      holdBody: 'rgba(255, 153, 0, 0.8)',
      touchRing: '#33ccff',
      buttonHighlight: 'rgba(38, 125, 244, 0.4)',
      hudText: '#f0f4f8',
      hudGlow: 'rgba(38, 125, 244, 0.5)'
    },
    dark: {
      name: 'dark',
      displayName: 'Dark Pro 暗黑电竞模式',
      bgFill: '#050608',
      cabinetRim: '#12141a',
      cabinetPlate: '#090a0d',
      sensorLine: 'rgba(255, 255, 255, 0.12)',
      judgeRing: '#e0e0e0',
      judgeRingSub: 'rgba(255, 255, 255, 0.3)',
      tapPink: '#ff3388',
      tapBlue: '#00d0ff',
      breakColor: '#ff2200',
      eachGold: '#ffbb00',
      slideGuide: '#ffffff',
      slideStar: '#ffffff',
      holdBody: 'rgba(255, 136, 0, 0.85)',
      touchRing: '#ffffff',
      buttonHighlight: 'rgba(255, 255, 255, 0.35)',
      hudText: '#ffffff',
      hudGlow: 'rgba(255, 255, 255, 0.3)'
    }
  };

  private static currentTheme: ThemeName = 'prism';

  static getTheme(name?: ThemeName): ThemeColors {
    if (name && this.themes[name]) {
      return this.themes[name];
    }
    return this.themes[this.currentTheme];
  }

  static setTheme(name: ThemeName): ThemeColors {
    if (this.themes[name]) {
      this.currentTheme = name;
    }
    return this.getTheme();
  }

  static getCurrentThemeName(): ThemeName {
    return this.currentTheme;
  }
}
