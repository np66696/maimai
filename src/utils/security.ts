/**
 * 安全防御与输入清理工具库
 * 提供针对 XSS、路径穿越 (Zip Slip)、注入及恶意大文件输入的防护工具
 */

/**
 * 对普通字符串进行 HTML 实体转义，防止 XSS 注入
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  const text = String(str);
  const entityMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;'
  };
  return text.replace(/[&<>"'/]/g, (s) => entityMap[s] || s);
}

/**
 * 清理文件名与文件夹名，防止路径穿越 (Path Traversal / Zip Slip)
 * 剔除 ../, ..\, 绝对路径前缀, 冒号, 空字符等
 */
export function sanitizePath(rawPath: string): string {
  if (!rawPath) return 'unnamed';
  
  // 1. 去除空字符与控制字符
  let clean = rawPath.replace(/[\x00-\x1f\x7f]/g, '');
  
  // 2. 统一正反斜杠并去除 ../ 与 ..\ 相对路径
  clean = clean.replace(/\\/g, '/');
  clean = clean.replace(/\.{2,}\//g, '').replace(/\.{2,}$/g, '');
  
  // 3. 去除危险系统文件名字符
  clean = clean.replace(/[<>:"|?*]/g, '_');
  
  // 4. 去除首尾空白与斜杠
  clean = clean.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  
  // 限制最大长度
  if (clean.length > 255) {
    clean = clean.slice(0, 255);
  }
  
  return clean || 'unnamed';
}

/**
 * 校验并限制文本长度，防止 ReDoS 与内存暴涨
 */
export function truncateSafe(str: string, maxLength: number = 200): string {
  if (!str) return '';
  return str.length > maxLength ? str.slice(0, maxLength) : str;
}

/**
 * ObjectURL 统一生命周期管理器，防止 Blob URL 内存泄漏
 */
export class ObjectUrlTracker {
  private urls: Set<string> = new Set();

  create(blob: Blob | File): string {
    if (typeof URL === 'undefined' || !URL.createObjectURL) {
      return '';
    }
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }

  revoke(url?: string): void {
    if (!url || typeof URL === 'undefined' || !URL.revokeObjectURL) return;
    if (this.urls.has(url)) {
      URL.revokeObjectURL(url);
      this.urls.delete(url);
    }
  }

  revokeAll(): void {
    if (typeof URL === 'undefined' || !URL.revokeObjectURL) return;
    for (const url of this.urls) {
      URL.revokeObjectURL(url);
    }
    this.urls.clear();
  }
}
