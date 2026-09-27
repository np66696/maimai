import { Point, RadialMath } from './RadialMath';
import { ThemeColors } from './ThemeManager';
import { KeybindManager } from '../core/KeybindManager';

export class TrackRenderer {
  /**
   * 渲染官方 maimai DX 圆形机台底盘、8 键物理外框、A/B/C/D/E 5大感应区与内外判定圈
   */
  static render(
    ctx: CanvasRenderingContext2D,
    center: Point,
    maxRadius: number,
    theme: ThemeColors,
    activeLanes: Set<number>,
    showSensorGuides: boolean = true,
    songProgress: number = 0,
    showButtons: boolean = true
  ): void {
    const judgeRadius = maxRadius * 0.82;
    const innerRadius = maxRadius * 0.22;
    const touchMidRadius = maxRadius * 0.52;

    ctx.save();

    // 1. 机台外围暗色底盘
    ctx.beginPath();
    ctx.arc(center.x, center.y, maxRadius * 0.98, 0, Math.PI * 2);
    ctx.fillStyle = theme.cabinetPlate;
    ctx.fill();

    // 2. 8 键外环触感扇区与按键按下高亮
    for (let i = 1; i <= 8; i++) {
      const angleRad = RadialMath.getButtonAngleRad(i);
      const startAngle = angleRad - (22.5 * Math.PI) / 180;
      const endAngle = angleRad + (22.5 * Math.PI) / 180;

      // 绘制按键外边缘弧形厚度
      ctx.beginPath();
      ctx.arc(center.x, center.y, maxRadius * 0.98, startAngle, endAngle);
      ctx.arc(center.x, center.y, judgeRadius, endAngle, startAngle, true);
      ctx.closePath();

      if (activeLanes.has(i)) {
        // 按下激活高亮
        const grad = ctx.createRadialGradient(center.x, center.y, judgeRadius, center.x, center.y, maxRadius);
        grad.addColorStop(0, theme.buttonHighlight);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0.7)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 3. 绘制 8 个物理机台按键标记（按键编号 + 绑定的键盘按键，在移动端/APK下不保留显示）
    if (showButtons) {
      const keybindManager = KeybindManager.getInstance();
      for (let i = 1; i <= 8; i++) {
        const pos = RadialMath.getButtonPosition(i, maxRadius * 0.91, center);
        const isDown = activeLanes.has(i);
        const keyLabel = keybindManager.getDisplayLabel(i);

        // 按键底座发光徽章 (Arcade Button Key Badge)
        ctx.save();
        ctx.translate(pos.x, pos.y);

        // 绘制按键外轮廓胶囊/圆盘 (随屏幕半径自适应放大，便于移动端手指点击识别)
        const badgeR = Math.max(22, Math.min(30, maxRadius * 0.11));
        ctx.beginPath();
        ctx.arc(0, 0, badgeR, 0, Math.PI * 2);
        if (isDown) {
          ctx.fillStyle = theme.judgeRing;
          ctx.shadowBlur = 0;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.stroke();

          // 额外发光外圈，零 shadowBlur 消耗
          ctx.beginPath();
          ctx.arc(0, 0, badgeR + 3, 0, Math.PI * 2);
          ctx.strokeStyle = theme.judgeRing;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(15, 20, 36, 0.85)';
          ctx.shadowBlur = 0;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // 上方小字：按键编号 #1..#8
        ctx.fillStyle = isDown ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 215, 0, 0.95)';
        ctx.font = `bold ${Math.round(badgeR * 0.45)}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${i}`, 0, -badgeR * 0.38);

        // 下方大字：键盘映射键位 [W], [E], [D] 等
        ctx.fillStyle = isDown ? '#000000' : '#ffffff';
        ctx.font = `900 ${Math.round(badgeR * 0.6)}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(keyLabel, 0, badgeR * 0.3);

        ctx.restore();
      }
    }

    // 4. A/B/C/D/E 感应区分界线（极坐标雷达网格）
    if (showSensorGuides) {
      // 8 条径向辐射分割线
      ctx.strokeStyle = theme.sensorLine;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      for (let i = 1; i <= 8; i++) {
        // 分割线位于相邻键中央
        const divAngleRad = RadialMath.getButtonAngleRad(i) + (22.5 * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(center.x + innerRadius * Math.cos(divAngleRad), center.y + innerRadius * Math.sin(divAngleRad));
        ctx.lineTo(center.x + judgeRadius * Math.cos(divAngleRad), center.y + judgeRadius * Math.sin(divAngleRad));
        ctx.stroke();
      }

      // 感应区内圈虚线 (分隔 A 与 B 区)
      ctx.beginPath();
      ctx.arc(center.x, center.y, touchMidRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([]);
    }

    // 5. 中心发射内环 (Inner Ring)
    ctx.beginPath();
    ctx.arc(center.x, center.y, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();
    ctx.strokeStyle = theme.judgeRingSub;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制中心 C 触控点标记
    ctx.beginPath();
    ctx.arc(center.x, center.y, maxRadius * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 6. 外圈主判定线 (Judgment Line)
    // 采用双重抗锯齿纯矢量描边替代 shadowBlur，避免手机端高昂的 CPU 高斯模糊
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(center.x, center.y, judgeRadius, 0, Math.PI * 2);
    ctx.strokeStyle = theme.judgeRing;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 外圈判定线细内衬
    ctx.beginPath();
    ctx.arc(center.x, center.y, judgeRadius - 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 7. 内屏环形歌曲播放进度条 (Circular Song Progress Ring)
    if (songProgress > 0) {
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + Math.PI * 2 * Math.min(1.0, Math.max(0, songProgress));
      ctx.beginPath();
      ctx.arc(center.x, center.y, judgeRadius + 3, startAngle, endAngle);
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3.5;
      ctx.shadowBlur = 0;
      ctx.stroke();
    }

    ctx.restore();
  }
}
