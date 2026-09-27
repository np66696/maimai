export interface Point {
  x: number;
  y: number;
}

export type SlideShape = '-' | '>' | '<' | '^' | 'v' | 'p' | 'q' | 's' | 'z' | 'pp' | 'qq' | 'w' | 'V';

export class RadialMath {
  /**
   * 官方 8 个按键的基准角度：1号键位于正上方偏右 22.5度（即极坐标 -67.5度）
   * 顺时针递增 45度
   */
  static getButtonAngleDeg(button: number): number {
    const b = ((button - 1) % 8 + 8) % 8;
    return -67.5 + b * 45;
  }

  static getButtonAngleRad(button: number): number {
    return (this.getButtonAngleDeg(button) * Math.PI) / 180;
  }

  static normalizeAngleDeg(deg: number): number {
    return ((deg % 360) + 360) % 360;
  }

  static getButtonPosition(button: number, radius: number, center: Point): Point {
    const rad = this.getButtonAngleRad(button);
    return {
      x: center.x + radius * Math.cos(rad),
      y: center.y + radius * Math.sin(rad)
    };
  }

  /**
   * 触控感应区 (A1~A8, B1~B8, C, D1~D8, E1~E8) 的坐标映射
   */
  static getTouchZonePosition(zone: string, maxRadius: number, center: Point): Point {
    const z = zone.toUpperCase().trim();
    if (z === 'C' || z === 'C1' || z === 'C2') {
      return { x: center.x, y: center.y };
    }

    const type = z.charAt(0);
    const num = parseInt(z.slice(1), 10) || 1;

    let baseAngleDeg = this.getButtonAngleDeg(num);
    let r = maxRadius * 0.88;

    switch (type) {
      case 'A': // 外环按键附近
        r = maxRadius * 0.92;
        break;
      case 'B': // 内环与按键同角
        r = maxRadius * 0.52;
        break;
      case 'D': // 外环相邻按键之间 (偏移 +22.5度)
        r = maxRadius * 0.92;
        baseAngleDeg += 22.5;
        break;
      case 'E': // 内环相邻按键之间 (偏移 +22.5度)
        r = maxRadius * 0.52;
        baseAngleDeg += 22.5;
        break;
      default:
        r = maxRadius * 0.7;
    }

    const rad = (baseAngleDeg * Math.PI) / 180;
    return {
      x: center.x + r * Math.cos(rad),
      y: center.y + r * Math.sin(rad)
    };
  }

  static interpolateRadial(startRadius: number, endRadius: number, progress: number): number {
    const p = Math.max(0, Math.min(1, progress));
    return startRadius + (endRadius - startRadius) * p;
  }

  /**
   * 计算各类 SLIDE 路径上的当前滑行星星点位
   */
  static interpolateSlidePath(
    shape: SlideShape,
    startLane: number,
    endLane: number,
    progress: number,
    center: Point,
    judgeRadius: number,
    stopLanes?: number[]
  ): Point {
    const t = Math.max(0, Math.min(1, progress));
    const pStart = this.getButtonPosition(startLane, judgeRadius, center);
    const pEnd = this.getButtonPosition(endLane, judgeRadius, center);

    switch (shape) {
      case '-': {
        // 直线型：起止点线性插值
        return {
          x: pStart.x + (pEnd.x - pStart.x) * t,
          y: pStart.y + (pEnd.y - pStart.y) * t
        };
      }

      case '>':
      case '<':
      case '^': {
        // 圆弧型：沿判定圆外周弧线插值
        const aStart = this.getButtonAngleRad(startLane);
        let aEnd = this.getButtonAngleRad(endLane);

        if (shape === '>') {
          // 顺时针：angle 必须大于 aStart
          while (aEnd <= aStart) aEnd += Math.PI * 2;
        } else if (shape === '<') {
          // 逆时针：angle 必须小于 aStart
          while (aEnd >= aStart) aEnd -= Math.PI * 2;
        } else {
          // '^'：大弧（跨越大于半圆方向）
          const diff = aEnd - aStart;
          if (Math.abs(diff) < Math.PI) {
            aEnd += diff > 0 ? -Math.PI * 2 : Math.PI * 2;
          }
        }

        const currentAngle = aStart + (aEnd - aStart) * t;
        return {
          x: center.x + judgeRadius * Math.cos(currentAngle),
          y: center.y + judgeRadius * Math.sin(currentAngle)
        };
      }

      case 'v': {
        // V型：经屏幕中心折返
        if (t <= 0.5) {
          const subT = t * 2;
          return {
            x: pStart.x + (center.x - pStart.x) * subT,
            y: pStart.y + (center.y - pStart.y) * subT
          };
        } else {
          const subT = (t - 0.5) * 2;
          return {
            x: center.x + (pEnd.x - center.x) * subT,
            y: center.y + (pEnd.y - center.y) * subT
          };
        }
      }

      case 'V': {
        // 角折线：经过指定的中间按键折返
        const midLane = stopLanes && stopLanes.length > 0 ? stopLanes[0] : (startLane % 8) + 1;
        const pMid = this.getButtonPosition(midLane, judgeRadius, center);
        if (t <= 0.5) {
          const subT = t * 2;
          return {
            x: pStart.x + (pMid.x - pStart.x) * subT,
            y: pStart.y + (pMid.y - pStart.y) * subT
          };
        } else {
          const subT = (t - 0.5) * 2;
          return {
            x: pMid.x + (pEnd.x - pMid.x) * subT,
            y: pMid.y + (pEnd.y - pMid.y) * subT
          };
        }
      }

      case 'p':
      case 'q': {
        // P/Q 迂回环（贝塞尔曲线）
        // 顺时针或逆时针经圆心侧向凸起
        const isP = shape === 'p';
        const startRad = this.getButtonAngleRad(startLane);
        const normalRad = startRad + (isP ? Math.PI / 2 : -Math.PI / 2);
        const offsetDist = judgeRadius * 0.45;

        const cp1 = {
          x: center.x + offsetDist * Math.cos(normalRad),
          y: center.y + offsetDist * Math.sin(normalRad)
        };
        const cp2 = {
          x: (cp1.x + pEnd.x) / 2,
          y: (cp1.y + pEnd.y) / 2
        };

        // 3次贝塞尔插值
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;

        return {
          x: uuu * pStart.x + 3 * uu * t * cp1.x + 3 * u * tt * cp2.x + ttt * pEnd.x,
          y: uuu * pStart.y + 3 * uu * t * cp1.y + 3 * u * tt * cp2.y + ttt * pEnd.y
        };
      }

      case 's':
      case 'z': {
        // S / Z 型折线拐弯路径（三次贝塞尔反向拐点）
        const isS = shape === 's';
        const startRad = this.getButtonAngleRad(startLane);
        const normRad = startRad + (isS ? Math.PI / 2 : -Math.PI / 2);
        const offset = judgeRadius * 0.45;
        const cp1 = {
          x: pStart.x + offset * Math.cos(normRad),
          y: pStart.y + offset * Math.sin(normRad)
        };
        const cp2 = {
          x: pEnd.x - offset * Math.cos(normRad),
          y: pEnd.y - offset * Math.sin(normRad)
        };
        const u = 1 - t;
        return {
          x: u * u * u * pStart.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * pEnd.x,
          y: u * u * u * pStart.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * pEnd.y
        };
      }

      case 'w': {
        // Wi-Fi 扩散扇面：中心向目标主键滑动
        return {
          x: pStart.x + (pEnd.x - pStart.x) * t,
          y: pStart.y + (pEnd.y - pStart.y) * t
        };
      }

      default:
        return {
          x: pStart.x + (pEnd.x - pStart.x) * t,
          y: pStart.y + (pEnd.y - pStart.y) * t
        };
    }
  }

  /**
   * 生成 SLIDE 静态引导线离散点集（用于 Canvas 渲染引导虚线/箭头）
   */
  static getSlidePathPoints(
    shape: SlideShape,
    startLane: number,
    endLane: number,
    center: Point,
    judgeRadius: number,
    steps: number = 30,
    stopLanes?: number[]
  ): Point[] {
    const points: Point[] = [];
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      points.push(this.interpolateSlidePath(shape, startLane, endLane, p, center, judgeRadius, stopLanes));
    }
    return points;
  }
}
