import { Point, RadialMath, SlideShape } from './RadialMath';
import { NoteEvent } from '../core/ChartModel';
import { TimeSync, SlideMotionState } from '../core/TimeSync';
import { ThemeColors } from './ThemeManager';

export class NoteRenderer {
  /**
   * 绘制当前帧所有活动音符（内屏 SLIDE 滑条、HOLD 拖尾、TAP、BREAK、星星、TOUCH）
   */
  static renderNotes(
    ctx: CanvasRenderingContext2D,
    notes: NoteEvent[],
    sync: TimeSync,
    center: Point,
    maxRadius: number,
    theme: ThemeColors
  ): void {
    const judgeRadius = maxRadius * 0.82;
    const innerRadius = maxRadius * 0.20;
    const noteRadius = maxRadius * 0.054;

    ctx.save();

    // 性能优化：通过二分查找计算当前活动时间窗口内的候选音符切片，避免全谱面数千音符全量循环
    const minTime = sync.currentTime - 8.0;
    const maxTime = sync.currentTime + Math.max(2.5, sync.approachTime * 2.0);
    const startIdx = this.findActiveStartIndex(notes, minTime);

    const activeNotes: NoteEvent[] = [];
    for (let i = startIdx; i < notes.length; i++) {
      const note = notes[i];
      if (note.time > maxTime) break;
      activeNotes.push(note);
    }

    // 1. 优先绘制 SLIDE 官方标志性内屏滑条（宽幅发光导轨 + 动态大箭头流光阵列）
    this.renderSlideGuides(ctx, activeNotes, sync, center, judgeRadius, maxRadius, theme);

    // 2. 绘制同拍金色双押连线 (EACH Connectors)
    this.renderEachConnectors(ctx, activeNotes, sync, center, judgeRadius, theme);

    // 3. 绘制 HOLD 音符斜纹警示胶囊长条轨迹 (Striped Hold Ribbons)
    this.renderHoldRibbons(ctx, activeNotes, sync, center, innerRadius, judgeRadius, noteRadius, theme);

    // 4. 绘制各类飞行中的主体音符 (TAP, BREAK, SLIDE 星星, TOUCH)
    for (const note of activeNotes) {
      const totalDur = note.duration || (note.slides ? Math.max(...note.slides.map(s => s.delay + s.duration)) : 0);
      if (!sync.isNoteVisible(note.time, totalDur)) continue;

      if (note.type === 'TOUCH' || note.type === 'TOUCH_HOLD') {
        this.renderTouchNote(ctx, note, sync, center, maxRadius, theme);
      } else if (note.type === 'SLIDE') {
        this.renderSlideStar(ctx, note, sync, center, innerRadius, judgeRadius, noteRadius, theme);
      } else if (note.type === 'BREAK') {
        this.renderBreakNote(ctx, note, sync, center, innerRadius, judgeRadius, noteRadius, theme);
      } else {
        this.renderTapOrHoldHead(ctx, note, sync, center, innerRadius, judgeRadius, noteRadius, theme);
      }
    }

    ctx.restore();
  }

  /**
   * 二分查找起始活动音符索引
   */
  private static findActiveStartIndex(notes: NoteEvent[], minTime: number): number {
    let low = 0;
    let high = notes.length - 1;
    let result = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (notes[mid].time >= minTime) {
        result = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    return result;
  }

  /**
   * 绘制官方 maimai DX 标志性内屏滑条（宽幅发光导轨 + 动态大箭头流光阵列 + 终点按键光圈）
   */
  private static renderSlideGuides(
    ctx: CanvasRenderingContext2D,
    notes: NoteEvent[],
    sync: TimeSync,
    center: Point,
    judgeRadius: number,
    maxRadius: number,
    theme: ThemeColors
  ): void {
    for (const note of notes) {
      if (note.type !== 'SLIDE' || !note.slides) continue;

      for (const slide of note.slides) {
        const slideStartTime = note.time;
        const slideEndTime = slideStartTime + slide.delay + slide.duration;
        // 提早 1.5 秒或更早显示内屏滑条，让玩家清晰看清滑行轨迹
        const trackAppearanceTime = slideStartTime - Math.max(1.2, sync.approachTime * 1.5);

        if (sync.currentTime < trackAppearanceTime || sync.currentTime > slideEndTime + 0.25) {
          continue;
        }

        // 计算滑条进出场的平滑淡入淡出透明度
        let alpha = 1.0;
        if (sync.currentTime < slideStartTime - sync.approachTime) {
          alpha = Math.max(0.2, Math.min(1.0, (sync.currentTime - trackAppearanceTime) / Math.max(0.1, (slideStartTime - sync.approachTime - trackAppearanceTime))));
        } else if (sync.currentTime > slideEndTime) {
          alpha = Math.max(0, 1.0 - (sync.currentTime - slideEndTime) / 0.25);
        }

        const motion = sync.getSlideProgress(slideStartTime, slide.delay, slide.duration);
        const isBreak = slide.isBreak || note.isBreak;

        // 如果是 Wi-Fi 扩散滑条 ('w')，绘制三条发散扇形滑道
        if (slide.shape === 'w') {
          const centerEnd = ((slide.startLane + 4 - 1) % 8) + 1;
          const leftEnd = ((centerEnd - 2 + 8) % 8) + 1;
          const rightEnd = (centerEnd % 8) + 1;
          const targets = [leftEnd, centerEnd, rightEnd];

          for (const targetLane of targets) {
            this.drawSingleSlideTrack(
              ctx,
              slide.shape,
              slide.startLane,
              targetLane,
              motion,
              center,
              judgeRadius,
              maxRadius,
              theme,
              isBreak,
              alpha,
              sync.currentTime,
              slide.stopLanes
            );
          }
        } else {
          this.drawSingleSlideTrack(
            ctx,
            slide.shape,
            slide.startLane,
            slide.endLane,
            motion,
            center,
            judgeRadius,
            maxRadius,
            theme,
            isBreak,
            alpha,
            sync.currentTime,
            slide.stopLanes
          );
        }
      }
    }
  }

  /**
   * 绘制单条内屏滑条的宽幅底轨与 Chevron 大号流动箭头
   */
  private static drawSingleSlideTrack(
    ctx: CanvasRenderingContext2D,
    shape: SlideShape,
    startLane: number,
    endLane: number,
    motion: SlideMotionState,
    center: Point,
    judgeRadius: number,
    maxRadius: number,
    _theme: ThemeColors,
    isBreak: boolean,
    alpha: number,
    currentTime: number,
    stopLanes?: number[]
  ): void {
    const steps = maxRadius < 250 ? 36 : 48;
    const points = RadialMath.getSlidePathPoints(
      shape,
      startLane,
      endLane,
      center,
      judgeRadius,
      steps,
      stopLanes
    );

    if (points.length < 2) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 0;

    // 滑条宽度（约 28px ~ 34px）
    const trackWidth = maxRadius * 0.082;
    const bedFill = isBreak ? 'rgba(255, 60, 0, 0.28)' : 'rgba(255, 230, 0, 0.28)';
    const railColor = isBreak ? '#ffe066' : '#ffffff';

    // 1. 确定当前未滑过的有效路径段
    // 如果正在移动，从 motion.progress 处截断（已经滑过的轨迹消失）
    const startIdx = motion.moving ? Math.min(points.length - 2, Math.floor(motion.progress * (points.length - 1))) : 0;
    const activePoints = points.slice(startIdx);

    if (activePoints.length >= 2) {
      // 1.1 绘制半透明霓虹滑道底层 (Wide Track Bed)
      ctx.beginPath();
      ctx.moveTo(activePoints[0].x, activePoints[0].y);
      for (let i = 1; i < activePoints.length; i++) {
        ctx.lineTo(activePoints[i].x, activePoints[i].y);
      }
      ctx.strokeStyle = bedFill;
      ctx.lineWidth = trackWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 0;
      ctx.stroke();

      // 1.2 绘制滑道外沿高光双轨 (Outer Neon Border Rails)
      ctx.strokeStyle = railColor;
      ctx.lineWidth = 2.0;
      ctx.stroke();

      // 1.3 绘制沿路径流动的大号 Chevron 官方箭头阵列
      const arrowSpacing = maxRadius * 0.08; // 箭头间距 ~24px - 28px
      let accumulatedDist = 0;
      let lastArrowDist = 0;
      let arrowIndex = 0;

      const arrowW = maxRadius * 0.058; // 箭头宽度
      const arrowH = maxRadius * 0.042; // 箭头长度

      for (let i = 1; i < activePoints.length; i++) {
        const p1 = activePoints[i - 1];
        const p2 = activePoints[i];
        const segDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        accumulatedDist += segDist;

        if (accumulatedDist - lastArrowDist >= arrowSpacing) {
          lastArrowDist = accumulatedDist;
          arrowIndex++;

          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

          ctx.save();
          ctx.translate(p2.x, p2.y);
          ctx.rotate(angle);

          // 计算流水跑马灯脉冲 (Chasing wave)
          const wavePhase = (arrowIndex - currentTime * 11) % 6;
          const isPulse = wavePhase >= 0 && wavePhase < 1.8;

          // 绘制官方尖角 Chevron 箭头图形 (>>>)
          ctx.beginPath();
          ctx.moveTo(arrowH * 0.65, 0); // 尖端朝前
          ctx.lineTo(-arrowH * 0.45, -arrowW * 0.5); // 上羽翼
          ctx.lineTo(-arrowH * 0.15, 0); // 中心凹陷
          ctx.lineTo(-arrowH * 0.45, arrowW * 0.5); // 下羽翼
          ctx.closePath();

          ctx.shadowBlur = 0;
          if (isPulse) {
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = isBreak ? '#ff2200' : '#ffd700';
            ctx.lineWidth = 2.2;
            ctx.stroke();
          } else {
            ctx.fillStyle = isBreak ? '#ff4400' : '#ffe600';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          ctx.restore();
        }
      }
    }

    // 2. 终点按键提示光圈 (Destination Target Ring)
    const pEnd = points[points.length - 1];
    ctx.save();
    ctx.translate(pEnd.x, pEnd.y);
    const pulseR = 18 + 4 * Math.sin(currentTime * 12);
    ctx.beginPath();
    ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = isBreak ? '#ff5500' : '#ffee00';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 0;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /**
   * 绘制同拍金色双押连线 (EACH Connector Arc)
   */
  private static renderEachConnectors(
    ctx: CanvasRenderingContext2D,
    notes: NoteEvent[],
    sync: TimeSync,
    center: Point,
    judgeRadius: number,
    theme: ThemeColors
  ): void {
    const eachGroups = new Map<number, NoteEvent[]>();
    for (const note of notes) {
      if (!note.isEach || note.lane === 0) continue;
      if (!sync.isNoteVisible(note.time, note.duration || 0)) continue;

      const key = Math.round(note.time * 100);
      if (!eachGroups.has(key)) eachGroups.set(key, []);
      eachGroups.get(key)!.push(note);
    }

    ctx.save();
    ctx.strokeStyle = theme.eachGold;
    ctx.lineWidth = 4.5;
    ctx.shadowBlur = 0;

    for (const group of eachGroups.values()) {
      if (group.length < 2) continue;
      const n1 = group[0];
      const n2 = group[1];

      const p1 = sync.getNoteProgress(n1.time);
      const p2 = sync.getNoteProgress(n2.time);
      const prog = Math.max(0, Math.min(1, (p1 + p2) / 2));

      const r = judgeRadius * prog;
      if (r < 12) continue;

      const a1 = RadialMath.getButtonAngleRad(n1.lane);
      const a2 = RadialMath.getButtonAngleRad(n2.lane);

      ctx.beginPath();
      ctx.arc(center.x, center.y, r, a1, a2);
      ctx.stroke();

      // 双押连线中心高亮脉冲
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, a1, a2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 绘制 HOLD 音符的斜纹流动胶囊长条轨迹 (Official Striped Hold Capsule)
   */
  private static renderHoldRibbons(
    ctx: CanvasRenderingContext2D,
    notes: NoteEvent[],
    sync: TimeSync,
    center: Point,
    innerRadius: number,
    judgeRadius: number,
    noteRadius: number,
    theme: ThemeColors
  ): void {
    for (const note of notes) {
      if (note.type !== 'HOLD' || !note.duration) continue;
      if (!sync.isNoteVisible(note.time, note.duration)) continue;

      const angleRad = RadialMath.getButtonAngleRad(note.lane);
      const headProgress = sync.getNoteProgress(note.time);
      const tailProgress = sync.getNoteProgress(note.time + note.duration);

      const rHead = Math.max(innerRadius, Math.min(judgeRadius, RadialMath.interpolateRadial(innerRadius, judgeRadius, headProgress)));
      const rTail = Math.max(innerRadius, Math.min(judgeRadius, RadialMath.interpolateRadial(innerRadius, judgeRadius, tailProgress)));

      if (rHead <= rTail) continue;

      const ribbonWidth = noteRadius * 1.5;
      const color = note.isEach ? theme.eachGold : theme.holdBody;

      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(angleRad);

      // 绘制底层半透明胶囊
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(rTail, -ribbonWidth / 2, rHead - rTail, ribbonWidth, ribbonWidth / 2)
        : ctx.rect(rTail, -ribbonWidth / 2, rHead - rTail, ribbonWidth);
      ctx.fillStyle = color;
      ctx.shadowBlur = 0;
      ctx.fill();

      // 绘制斜纹动态条纹 (Caution / Hazard Stripes)
      ctx.save();
      ctx.clip(); // 限制在胶囊内部
      const stripeSpacing = 16;
      const stripeOffset = (sync.currentTime * 45) % stripeSpacing;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 4;
      for (let x = rTail - ribbonWidth + stripeOffset; x < rHead + ribbonWidth; x += stripeSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, -ribbonWidth);
        ctx.lineTo(x + ribbonWidth, ribbonWidth);
        ctx.stroke();
      }
      ctx.restore();

      // 胶囊外轮廓白色高光线
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(rTail, -ribbonWidth / 2, rHead - rTail, ribbonWidth, ribbonWidth / 2)
        : ctx.rect(rTail, -ribbonWidth / 2, rHead - rTail, ribbonWidth);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * 绘制普通 TAP 音符与 HOLD 音符头部双环圆盘 (Official Double-Ring Acrylic TAP)
   */
  private static renderTapOrHoldHead(
    ctx: CanvasRenderingContext2D,
    note: NoteEvent,
    sync: TimeSync,
    center: Point,
    innerRadius: number,
    judgeRadius: number,
    noteRadius: number,
    theme: ThemeColors
  ): void {
    const progress = sync.getNoteProgress(note.time);
    if (progress < 0 || progress > 1.15) return;

    const r = RadialMath.interpolateRadial(innerRadius, judgeRadius, Math.min(1.0, progress));
    const angleRad = RadialMath.getButtonAngleRad(note.lane);
    const x = center.x + r * Math.cos(angleRad);
    const y = center.y + r * Math.sin(angleRad);

    const baseColor = note.isEach
      ? theme.eachGold
      : (note.lane % 2 === 1 ? theme.tapPink : theme.tapBlue);

    ctx.save();
    ctx.translate(x, y);

    // 1. 最外层实色环 (Saturated Outer Acrylic Ring)
    ctx.beginPath();
    ctx.arc(0, 0, noteRadius, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.shadowBlur = 0;
    ctx.fill();

    // 2. 细白内衬环 (White Concentric Inner Ring)
    ctx.beginPath();
    ctx.arc(0, 0, noteRadius * 0.78, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 3. 核心暗色凹槽 (Sunken Dark Core)
    ctx.beginPath();
    ctx.arc(0, 0, noteRadius * 0.60, 0, Math.PI * 2);
    ctx.fillStyle = '#0b0e18';
    ctx.shadowBlur = 0;
    ctx.fill();

    // 4. 核心纯白定位光点 (Center Target Pip)
    ctx.beginPath();
    ctx.arc(0, 0, noteRadius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // 5. 顶部月牙形水晶高光 (Glossy Top Reflection Arc)
    ctx.beginPath();
    ctx.arc(0, -noteRadius * 0.12, noteRadius * 0.72, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.restore();
  }

  /**
   * 绘制 BREAK 红色/金色旋转八芒爆裂齿轮 (Official 8-Point Rotating Sunburst Gear)
   */
  private static renderBreakNote(
    ctx: CanvasRenderingContext2D,
    note: NoteEvent,
    sync: TimeSync,
    center: Point,
    innerRadius: number,
    judgeRadius: number,
    noteRadius: number,
    theme: ThemeColors
  ): void {
    const progress = sync.getNoteProgress(note.time);
    if (progress < 0 || progress > 1.15) return;

    const r = RadialMath.interpolateRadial(innerRadius, judgeRadius, Math.min(1.0, progress));
    const angleRad = RadialMath.getButtonAngleRad(note.lane);
    const x = center.x + r * Math.cos(angleRad);
    const y = center.y + r * Math.sin(angleRad);

    ctx.save();
    ctx.translate(x, y);

    // 快速旋转动画
    ctx.rotate(sync.currentTime * 8.5);

    const outerR = noteRadius * 1.45;
    const innerR = noteRadius * 0.72;
    const points = 8;

    // 绘制 8 芒齿轮星芒
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / points;
      const px = radius * Math.cos(angle);
      const py = radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    // 金红色放射渐变
    const grad = ctx.createRadialGradient(0, 0, innerR * 0.4, 0, 0, outerR);
    grad.addColorStop(0, '#ffff55');
    grad.addColorStop(0.5, '#ff8800');
    grad.addColorStop(1, theme.breakColor);

    ctx.fillStyle = grad;
    ctx.shadowBlur = 0;
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 齿轮中心橙黄炽热熔核
    ctx.beginPath();
    ctx.arc(0, 0, noteRadius * 0.40, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 0;
    ctx.fill();

    ctx.restore();
  }

  /**
   * 绘制 SLIDE 星星（包含接近阶段、停顿阶段与沿轨迹滑动阶段）
   */
  private static renderSlideStar(
    ctx: CanvasRenderingContext2D,
    note: NoteEvent,
    sync: TimeSync,
    center: Point,
    innerRadius: number,
    judgeRadius: number,
    noteRadius: number,
    _theme: ThemeColors
  ): void {
    if (!note.slides || note.slides.length === 0) return;

    for (const slide of note.slides) {
      const motion = sync.getSlideProgress(note.time, slide.delay, slide.duration);

      let starPos: Point;
      let rotation = sync.currentTime * 7;
      let scale = 1.0;

      if (motion.finished) {
        continue;
      } else if (motion.moving) {
        starPos = RadialMath.interpolateSlidePath(
          slide.shape,
          slide.startLane,
          slide.endLane,
          motion.progress,
          center,
          judgeRadius,
          slide.stopLanes
        );
        rotation = motion.progress * Math.PI * 4;
      } else if (motion.waiting) {
        starPos = RadialMath.getButtonPosition(slide.startLane, judgeRadius, center);
        scale = 1.0 + 0.22 * Math.sin(sync.currentTime * 20);
      } else {
        const progress = sync.getNoteProgress(note.time);
        if (progress < 0) continue;
        const r = RadialMath.interpolateRadial(innerRadius, judgeRadius, Math.min(1.0, progress));
        const angleRad = RadialMath.getButtonAngleRad(slide.startLane);
        starPos = {
          x: center.x + r * Math.cos(angleRad),
          y: center.y + r * Math.sin(angleRad)
        };
      }

      ctx.save();
      ctx.translate(starPos.x, starPos.y);
      ctx.rotate(rotation);
      ctx.scale(scale, scale);

      // 绘制官方 3D 棱面金色五角星 (Beveled 5-Point Dimensional Star)
      const outerR = noteRadius * 1.35;
      const innerR = noteRadius * 0.58;
      const isBreak = slide.isBreak || note.isBreak;

      // 绘制 10 个交替明暗小三角构成 3D 棱面
      for (let i = 0; i < 10; i++) {
        const a1 = (i * Math.PI) / 5 - Math.PI / 2;
        const a2 = ((i + 1) * Math.PI) / 5 - Math.PI / 2;
        const r1 = i % 2 === 0 ? outerR : innerR;
        const r2 = (i + 1) % 2 === 0 ? outerR : innerR;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r1 * Math.cos(a1), r1 * Math.sin(a1));
        ctx.lineTo(r2 * Math.cos(a2), r2 * Math.sin(a2));
        ctx.closePath();

        if (isBreak) {
          ctx.fillStyle = i % 2 === 0 ? '#ffcc00' : '#ff4400';
        } else {
          ctx.fillStyle = i % 2 === 0 ? '#ffe600' : '#ffa500';
        }
        ctx.fill();
      }

      // 星星外轮廓与发光
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const px = radius * Math.cos(angle);
        const py = radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.shadowBlur = 0;
      ctx.stroke();

      // 星星中心宝石核心 (Center Gem Bead)
      ctx.beginPath();
      ctx.arc(0, 0, noteRadius * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.restore();
    }
  }

  /**
   * 绘制 TOUCH / TOUCH_HOLD 触控音符 (Official 4-Petal Flower Inward Target)
   */
  private static renderTouchNote(
    ctx: CanvasRenderingContext2D,
    note: NoteEvent,
    sync: TimeSync,
    center: Point,
    maxRadius: number,
    theme: ThemeColors
  ): void {
    const zonePos = RadialMath.getTouchZonePosition(note.touchZone || 'C', maxRadius * 0.82, center);
    const progress = sync.getNoteProgress(note.time);
    if (progress < 0 || progress > 1.2) return;

    ctx.save();
    ctx.translate(zonePos.x, zonePos.y);

    const size = maxRadius * 0.065;
    // 4 个花瓣箭头从外围向中心汇合闭合
    const inwardDist = (1 - Math.min(1.0, progress)) * size * 2.4;

    const directions = [
      { dx: 0, dy: -1, angle: 0 },
      { dx: 1, dy: 0, angle: Math.PI / 2 },
      { dx: 0, dy: 1, angle: Math.PI },
      { dx: -1, dy: 0, angle: -Math.PI / 2 }
    ];

    ctx.fillStyle = theme.touchRing;
    ctx.shadowBlur = 0;

    for (const dir of directions) {
      ctx.save();
      ctx.translate(dir.dx * inwardDist, dir.dy * inwardDist);
      ctx.rotate(dir.angle);

      ctx.beginPath();
      ctx.moveTo(-size * 0.38, -size * 0.55);
      ctx.lineTo(size * 0.38, -size * 0.55);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();
    }

    // 中心定位圆环与内花蕊
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, size * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();
  }
}
