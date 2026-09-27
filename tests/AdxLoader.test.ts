import { describe, it, expect } from 'vitest';
import { AdxLoader } from '../src/core/AdxLoader';
import { zipSync, strToU8 } from 'fflate';
import * as fs from 'fs';
import * as path from 'path';

describe('AdxLoader', () => {
  it('identifies .adx and .zip files correctly', () => {
    expect(AdxLoader.isAdxOrZip('song.adx')).toBe(true);
    expect(AdxLoader.isAdxOrZip('song.zip')).toBe(true);
    expect(AdxLoader.isAdxOrZip('010188 天ノ弱.adx')).toBe(true);
    expect(AdxLoader.isAdxOrZip('song.txt')).toBe(false);
    expect(AdxLoader.isAdxOrZip('song.mp3')).toBe(false);
  });

  it('extracts difficulty slots and level tags from maidata.txt', () => {
    const maidata = `
&title=Test Track
&artist=Test Artist
&wholebpm=180
&lv_2=5.0
&inote_2=(180){4}1,2,3,4,
&lv_3=8.5
&inote_3=(180){4}1,2,3,4,
&lv_4=11.2
&inote_4=(180){4}1,2,3,4,
&lv_5=13+
&inote_5=(180){4}1,2,3,4,
&lv_6=14.4
&inote_6=(180){4}1,2,3,4,
`;
    const diffs = AdxLoader.extractDifficulties(maidata);
    expect(diffs).toHaveLength(5);
    expect(diffs[0]).toEqual({ slot: 2, inoteKey: 2, name: 'BASIC', level: '5.0' });
    expect(diffs[1]).toEqual({ slot: 3, inoteKey: 3, name: 'ADVANCED', level: '8.5' });
    expect(diffs[2]).toEqual({ slot: 4, inoteKey: 4, name: 'EXPERT', level: '11.2' });
    expect(diffs[3]).toEqual({ slot: 5, inoteKey: 5, name: 'MASTER', level: '13+' });
    expect(diffs[4]).toEqual({ slot: 6, inoteKey: 6, name: 'Re:MASTER', level: '14.4' });
  });

  it('extracts fallback single inote chart as MASTER', () => {
    const maidata = `
&title=Single Inote
&artist=Solo
&wholebpm=140
&lv=12+
&inote=(140){4}1,2,3,4,
`;
    const diffs = AdxLoader.extractDifficulties(maidata);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].slot).toBe(5);
    expect(diffs[0].name).toBe('MASTER');
  });

  it('unpacks in-memory nested .adx package cleanly', () => {
    const mockChart = `&title=Memory Test\n&artist=Unit Tester\n&wholebpm=150\n&lv_5=13.0\n&inote_5=(150){4}1,2,3,4,`;
    const mockZipData = zipSync({
      'nested_folder/maidata.txt': strToU8(mockChart),
      'nested_folder/track.mp3': new Uint8Array([0x49, 0x44, 0x33, 0x03]), // ID3 mock
      'nested_folder/bg.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]) // PNG header
    });

    const pkg = AdxLoader.loadFromUint8Array(mockZipData, 'mock.adx');
    expect(pkg.title).toBe('Memory Test');
    expect(pkg.artist).toBe('Unit Tester');
    expect(pkg.bpm).toBe(150);
    expect(pkg.difficulties).toHaveLength(1);
    expect(pkg.difficulties[0].slot).toBe(5);
    expect(pkg.defaultSlot).toBe(5);
    expect(pkg.audioBlob).toBeDefined();
    expect(pkg.coverBlob).toBeDefined();
  });

  it('successfully parses the real 010188 天ノ弱.adx file from disk', () => {
    const adxPath = path.resolve(__dirname, '../010188 天ノ弱.adx');
    if (!fs.existsSync(adxPath)) {
      console.warn('Real .adx file not found at:', adxPath);
      return;
    }

    const fileBuf = fs.readFileSync(adxPath);
    const uint8 = new Uint8Array(fileBuf.buffer, fileBuf.byteOffset, fileBuf.byteLength);

    const pkg = AdxLoader.loadFromUint8Array(uint8, '010188 天ノ弱.adx');

    expect(pkg.title).toBe('天ノ弱');
    expect(pkg.artist).toBe('164');
    expect(pkg.bpm).toBe(200);
    expect(pkg.difficulties.length).toBeGreaterThanOrEqual(4);

    const masterDiff = pkg.difficulties.find(d => d.slot === 5);
    expect(masterDiff).toBeDefined();
    expect(masterDiff?.name).toBe('MASTER');
    expect(masterDiff?.level).toBe('12.8');

    expect(pkg.defaultSlot).toBe(5);
    expect(pkg.audioBlob).toBeDefined();
    expect(pkg.audioBlob!.size).toBeGreaterThan(100000);
    expect(pkg.coverBlob).toBeDefined();
    expect(pkg.coverBlob!.size).toBeGreaterThan(100000);
  });
});
