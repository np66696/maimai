import { Point } from './RadialMath';
import { JudgeGrade, FastLate } from '../core/JudgeEngine';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

interface JudgeBannerItem {
  grade: JudgeGrade;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  isBreak: boolean;
  fastLate: FastLate;
  deltaMs: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

export class EffectSystem {
  private particles: Particle[] = [];
  private banners: JudgeBannerItem[] = [];
  private shockwaves: Shockwave[] = [];

  // 预载官方判定标图 (SVG Images)
  private judgeImages: Record<JudgeGrade, HTMLImageElement>;

  constructor() {
    this.judgeImages = {
      CRITICAL_PERFECT: new Image(),
      PERFECT: new Image(),
      GREAT: new Image(),
      GOOD: new Image(),
      MISS: new Image()
    };

    this.judgeImages.CRITICAL_PERFECT.src = './assets/arcade/judge-critical.svg';
    this.judgeImages.PERFECT.src = './assets/arcade/judge-perfect.svg';
    this.judgeImages.GREAT.src = './assets/arcade/judge-great.svg';
    this.judgeImages.GOOD.src = './assets/arcade/judge-good.svg';
    this.judgeImages.MISS.src = './assets/arcade/judge-miss.svg';
  }

  triggerHit(
    pos: Point,
    grade: JudgeGrade,
    isBreak: boolean = false,
    fastLate: FastLate = 'EXACT',
    deltaMs: number = 0
  ): void {
    // 1. 添加判定横幅
    this.banners.push({
      grade,
      x: pos.x,
      y: pos.y - 12,
      life: 0.65,
      maxLife: 0.65,
      isBreak,
      fastLate,
      deltaMs
    });

    if (grade === 'MISS') {
      return;
    }

    // 2. 确定特效主色调
    let mainColor = '#00f0ff';
    if (grade === 'CRITICAL_PERFECT') {
      mainColor = isBreak ? '#ff8800' : '#ffe600';
    } else if (grade === 'PERFECT') {
      mainColor = '#ff2a85';
    } else if (grade === 'GREAT') {
      mainColor = '#00e5ff';
    } else if (grade === 'GOOD') {
      mainColor = '#22cc88';
    }

    // 3. 产生爆破粒子（移动端/触摸屏下自适应精简粒子数，杜绝海量高频打击时的卡顿）
    const isMobileDevice = typeof window !== 'undefined' && ('ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));
    const particleCount = isMobileDevice ? (isBreak ? 14 : 8) : (isBreak ? 24 : 14);
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 200 + 90) * (isBreak ? 1.6 : 1.0);
      this.particles.push({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: Math.random() > 0.35 ? mainColor : '#ffffff',
        size: Math.random() * 4.5 + 2.5,
        life: 0.48,
        maxLife: 0.48
      });
    }

    // 4. 产生扩散冲击波圆环
    this.shockwaves.push({
      x: pos.x,
      y: pos.y,
      radius: 6,
      maxRadius: isBreak ? 72 : 50,
      color: mainColor,
      life: 0.38,
      maxLife: 0.38
    });

    // 内存与性能防护：限制最大存活实体数量，防止极高连击时内存暴涨
    if (this.particles.length > 150) {
      this.particles.splice(0, this.particles.length - 120);
    }
    if (this.shockwaves.length > 25) {
      this.shockwaves.splice(0, this.shockwaves.length - 15);
    }
    if (this.banners.length > 16) {
      this.banners.splice(0, this.banners.length - 10);
    }
  }

  update(dt: number): void {
    // 更新粒子 (swap-and-pop O(1) 高效移除，避免 O(N) 内存移位)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
      }
    }

    // 更新冲击波 (swap-and-pop O(1) 移除)
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life -= dt;
      const progress = 1 - s.life / s.maxLife;
      s.radius = s.maxRadius * progress;
      if (s.life <= 0) {
        this.shockwaves[i] = this.shockwaves[this.shockwaves.length - 1];
        this.shockwaves.pop();
      }
    }

    // 更新判定标 (swap-and-pop O(1) 移除)
    for (let i = this.banners.length - 1; i >= 0; i--) {
      const b = this.banners[i];
      b.life -= dt;
      b.y -= 14 * dt; // 向上飘动
      if (b.life <= 0) {
        this.banners[i] = this.banners[this.banners.length - 1];
        this.banners.pop();
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.shadowBlur = 0; // 默认关闭全局阴影模糊，杜绝移动端 CPU/GPU 高斯模糊滤镜开销

    // 1. 绘制冲击波（双层同心圆拟合发光，比 shadowBlur 快数十倍）
    for (const s of this.shockwaves) {
      const alpha = Math.max(0, s.life / s.maxLife);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3.5 * alpha;
      ctx.globalAlpha = alpha;
      ctx.stroke();

      // 外发光层
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.lineWidth = 7.0 * alpha;
      ctx.globalAlpha = alpha * 0.35;
      ctx.stroke();
    }

    // 2. 绘制粒子（直接使用纯色透明度渲染，零卡顿）
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fill();
    }

    // 3. 绘制官方判定横幅 (SVG Image 或 Fallback 艺术字体)
    for (const b of this.banners) {
      const timeElapsed = b.maxLife - b.life;
      // 弹出缩放曲线 (1.4 -> 1.0)
      const popScale = timeElapsed < 0.08 ? 1.0 + 0.4 * (1.0 - timeElapsed / 0.08) : 1.0;
      const alpha = Math.min(1.0, b.life / (b.maxLife * 0.4));

      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(popScale, popScale);
      ctx.globalAlpha = alpha;

      const img = this.judgeImages[b.grade];
      const imgW = 150;
      const imgH = 46;

      if (img && img.complete && img.naturalWidth > 0) {
        // 使用官方高精度 SVG 横幅 (移除 shadowBlur 以确保移动端 120Hz 零卡顿)
        ctx.shadowBlur = 0;
        ctx.drawImage(img, -imgW / 2, -imgH / 2, imgW, imgH);
      } else {
        // 优雅后备矢量文字
        ctx.font = 'italic 900 22px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = b.grade === 'CRITICAL_PERFECT' ? '#ffd700' : (b.grade === 'PERFECT' ? '#ff2a85' : '#00f0ff');
        ctx.shadowBlur = 0;
        ctx.fillText(b.grade.replace('_', ' '), 0, 0);
      }

      // 4. 绘制 FAST / LATE 细分时差胶囊药丸 (Offset Timing Pill)
      if (b.fastLate !== 'EXACT' && b.grade !== 'MISS') {
        const isFast = b.fastLate === 'FAST';
        const sign = b.deltaMs > 0 ? '+' : '';
        const pillText = `${b.fastLate} ${sign}${Math.round(b.deltaMs)}ms`;
        const pillColor = isFast ? '#00f0ff' : '#ff7733';

        ctx.font = 'bold 11px -apple-system, sans-serif';
        const textWidth = ctx.measureText(pillText).width;
        const pillW = textWidth + 14;
        const pillH = 18;
        const pillY = imgH / 2 + 3;

        // 胶囊底座
        ctx.beginPath();
        ctx.roundRect
          ? ctx.roundRect(-pillW / 2, pillY, pillW, pillH, 9)
          : ctx.rect(-pillW / 2, pillY, pillW, pillH);
        ctx.fillStyle = 'rgba(10, 15, 28, 0.88)';
        ctx.shadowBlur = 0;
        ctx.fill();

        ctx.strokeStyle = pillColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 胶囊文字
        ctx.fillStyle = pillColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pillText, 0, pillY + pillH / 2);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  reset(): void {
    this.particles = [];
    this.banners = [];
    this.shockwaves = [];
  }
}
