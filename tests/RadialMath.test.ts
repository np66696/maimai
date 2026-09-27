import { describe, it, expect } from 'vitest';
import { RadialMath } from '../src/renderer/RadialMath';

describe('RadialMath', () => {
  const center = { x: 500, y: 500 };
  const judgeRadius = 400;

  it('should correctly calculate button angles', () => {
    // 1号键为 -67.5度 = 292.5度, 2号键为 -22.5度 = 337.5度
    expect(RadialMath.normalizeAngleDeg(RadialMath.getButtonAngleDeg(1))).toBeCloseTo(292.5, 1);
    expect(RadialMath.normalizeAngleDeg(RadialMath.getButtonAngleDeg(2))).toBeCloseTo(337.5, 1);
    expect(RadialMath.normalizeAngleDeg(RadialMath.getButtonAngleDeg(3))).toBeCloseTo(22.5, 1);
    expect(RadialMath.normalizeAngleDeg(RadialMath.getButtonAngleDeg(4))).toBeCloseTo(67.5, 1);
    expect(RadialMath.normalizeAngleDeg(RadialMath.getButtonAngleDeg(5))).toBeCloseTo(112.5, 1);
    expect(RadialMath.normalizeAngleDeg(RadialMath.getButtonAngleDeg(6))).toBeCloseTo(157.5, 1);
    expect(RadialMath.normalizeAngleDeg(RadialMath.getButtonAngleDeg(7))).toBeCloseTo(202.5, 1);
    expect(RadialMath.normalizeAngleDeg(RadialMath.getButtonAngleDeg(8))).toBeCloseTo(247.5, 1);
  });

  it('should calculate button positions correctly', () => {
    const p1 = RadialMath.getButtonPosition(1, judgeRadius, center);
    const rad1 = RadialMath.getButtonAngleRad(1);
    expect(p1.x).toBeCloseTo(center.x + judgeRadius * Math.cos(rad1), 2);
    expect(p1.y).toBeCloseTo(center.y + judgeRadius * Math.sin(rad1), 2);
  });

  it('should calculate touch zone C at center and A/B/D/E zones', () => {
    const posC = RadialMath.getTouchZonePosition('C', judgeRadius, center);
    expect(posC.x).toBe(500);
    expect(posC.y).toBe(500);

    const posA1 = RadialMath.getTouchZonePosition('A1', judgeRadius, center);
    const posB1 = RadialMath.getTouchZonePosition('B1', judgeRadius, center);
    expect(posA1.x).not.toBe(posB1.x); // A is outer, B is inner
    // Both A1 and B1 share the angle of button 1
    const angleA1 = Math.atan2(posA1.y - center.y, posA1.x - center.x);
    const angleB1 = Math.atan2(posB1.y - center.y, posB1.x - center.x);
    expect(angleA1).toBeCloseTo(angleB1, 2);

    // D1 is between button 1 and 2
    const posD1 = RadialMath.getTouchZonePosition('D1', judgeRadius, center);
    const angleD1 = Math.atan2(posD1.y - center.y, posD1.x - center.x) * 180 / Math.PI;
    expect(RadialMath.normalizeAngleDeg(angleD1)).toBeCloseTo(315.0, 1); // (-67.5 + 22.5 = -45 = 315)
  });

  it('should interpolate straight slide paths', () => {
    // 1-5 straight through center
    const start = RadialMath.interpolateSlidePath('-', 1, 5, 0, center, judgeRadius);
    const mid = RadialMath.interpolateSlidePath('-', 1, 5, 0.5, center, judgeRadius);
    const end = RadialMath.interpolateSlidePath('-', 1, 5, 1, center, judgeRadius);

    expect(mid.x).toBeCloseTo(center.x, 2);
    expect(mid.y).toBeCloseTo(center.y, 2);

    const p1 = RadialMath.getButtonPosition(1, judgeRadius, center);
    const p5 = RadialMath.getButtonPosition(5, judgeRadius, center);
    expect(start.x).toBeCloseTo(p1.x, 2);
    expect(end.x).toBeCloseTo(p5.x, 2);
  });

  it('should interpolate circumference arc slide paths (>, <)', () => {
    // 1>3 clockwise arc
    const mid = RadialMath.interpolateSlidePath('>', 1, 3, 0.5, center, judgeRadius);
    const distToCenter = Math.hypot(mid.x - center.x, mid.y - center.y);
    expect(distToCenter).toBeCloseTo(judgeRadius, 1);

    // Midpoint of 1 and 3 along circumference clockwise is button 2
    const p2 = RadialMath.getButtonPosition(2, judgeRadius, center);
    expect(mid.x).toBeCloseTo(p2.x, 1);
    expect(mid.y).toBeCloseTo(p2.y, 1);
  });

  it('should interpolate V-shape slide paths (v)', () => {
    // 1v5 goes through center
    const mid = RadialMath.interpolateSlidePath('v', 1, 5, 0.5, center, judgeRadius);
    expect(mid.x).toBeCloseTo(center.x, 2);
    expect(mid.y).toBeCloseTo(center.y, 2);
  });
});
