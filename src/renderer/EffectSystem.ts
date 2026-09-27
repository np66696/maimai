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

    // 3. 产生爆破粒子
    const particleCount = isBreak ? 32 : 18;
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
  }

  update(dt: number): void {
    // 更新粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 更新冲击波
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life -= dt;
      const progress = 1 - s.life / s.maxLife;
      s.radius = s.maxRadius * progress;
      if (s.life <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }

    // 更新判定标
    for (let i = this.banners.length - 1; i >= 0; i--) {
      const b = this.banners[i];
      b.life -= dt;
      b.y -= 14 * dt; // 向上飘动
      if (b.life <= 0) {
        this.banners.splice(i, 1);
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // 1. 绘制冲击波
    for (const s of this.shockwaves) {
      const alpha = Math.max(0, s.life / s.maxLife);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3.5 * alpha;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 12;
      ctx.stroke();
    }

    // 2. 绘制粒子
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
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
        // 使用官方高精度 SVG 横幅
        ctx.shadowColor = b.grade === 'CRITICAL_PERFECT' ? '#ffd700' : (b.grade === 'PERFECT' ? '#ff2a85' : '#00f0ff');
        ctx.shadowBlur = 12;
        ctx.drawImage(img, -imgW / 2, -imgH / 2, imgW, imgH);
      } else {
        // 优雅后备矢量文字
        ctx.font = 'italic 900 22px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = b.grade === 'CRITICAL_PERFECT' ? '#ffd700' : (b.grade === 'PERFECT' ? '#ff2a85' : '#00f0ff');
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
        ctx.shadowBlur = 6;
        ctx.shadowColor = pillColor;
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
