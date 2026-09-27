import { Capacitor } from '@capacitor/core';

/**
 * 判断是否运行在 Android APK 原生应用环境或移动端设备
 */
export function isApkPlatform(): boolean {
  try {
    if (Capacitor.isNativePlatform()) {
      return true;
    }
    const plat = Capacitor.getPlatform();
    if (plat === 'android' || plat === 'ios') {
      return true;
    }
  } catch {
    // 忽略 Capacitor 未初始化
  }

  if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) {
      return true;
    }
  }

  return false;
}

/**
 * 判断是否为触摸屏设备
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    isApkPlatform() ||
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  );
}
