# maimai DX 官方街机风格谱面查看器 & 播放器

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.2-purple.svg)](https://vitejs.dev/)
[![Electron](https://img.shields.io/badge/Electron-44.4-cyan.svg)](https://www.electronjs.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.5-blue.svg)](https://capacitorjs.com/)

一个高还原度的 **maimai DX 官方街机风格** 谱面查看器、播放分析仪与跨平台打歌播放器。支持浏览器网页端、Windows 桌面客户端（Electron）以及 Android 移动触屏版（Capacitor）。

---

## ✨ 核心特性

1. **官方街机级圆盘与极坐标渲染**
   - 采用高性能 HTML5 Canvas 2D 进行亚像素级极坐标与雷达网格渲染。
   - 完整支持外圈 8 轨道键位与 A/B/C/D/E 五大触控感应区。
   - 动态主题系统：支持 Prism（霓虹青蓝）、Festival（盛典金橙）、Classic（经典街机深空）。

2. **完备的 Simai 语法与判定系统**
   - 完美解析并播放 TAP, HOLD, SLIDE, BREAK, TOUCH, TOUCH-HOLD 等所有音符类型。
   - 真实再现 SLIDE 官方 1-beat 等待延迟与贝塞尔引导轨迹。
   - 内置 Critical Perfect / Perfect / Great / Good / Miss 五级精准判定引擎，支持 DX 分数与实时评级计算。

3. **双翼式操作控制台 (Dual Flank Consoles)**
   - **左翼面板**：曲目信息概览、进度拖动滑条、精准时间跳转、重新开始。
   - **右翼面板**：流速调节 (Hi-Speed)、谱面偏移微调 (Offset ms)、BPM 倍速变换、主题切换、音乐与音效独立音量调节。

4. **移动端/APK 深度触屏适配 & 沉浸打歌**
   - **纯净触屏模式**：移动端自动隐去键盘映射徽章与调试按键，还原本真触屏视野。
   - **非 Auto 顶栏避让**：在手动打歌模式下，顶部 HUD 栏自动平滑滑移至左侧空白区域，彻底释放 12 点钟方向 1 号与 8 号按键视野。
   - **浮窗自动滑出**：手动试玩开始时，双翼控制台平滑滑出屏幕外隐藏，音乐结束或暂停时自动唤回。

5. **AstroDX 在线曲库 & .adx 格式支持**
   - 直连 AstroDX 资源库，支持实时在线搜索、难度筛选、试听与一键下载试玩。
   - 支持直接拖拽或读取 `.adx` / `.zip` 歌曲包，支持内建本地离线 IndexedDB 曲库持久化存储。

6. **全平台编译工具链**
   - **Web 端**：即开即用，秒级热重载。
   - **Windows 桌面端**：基于 Electron Packager，一键打包独立 `.exe`。
   - **Android 移动端**：基于 Capacitor 8 + Gradle，一键构建触屏版 `.apk`。

---

## 🚀 快速上手

### 环境要求
- Node.js 18.0 或更高版本
- npm 或 pnpm / yarn

### 安装依赖
```bash
npm install
```

### 启动网页开发服务器
```bash
npm run dev
```
浏览器打开 `http://localhost:5174/` 即可开始体验。

### 运行自动化测试
```bash
npm test
```
包含 10 个测试套件与 45 项单元测试（覆盖极坐标数学、Simai 解析、音频同步、判定引擎、.adx 打包解包与本地曲库服务）。

---

## 📦 打包构建

### 构建纯前端静态资源
```bash
npm run build
```

### 打包 Windows 独立桌面端 (.exe)
```bash
npm run build:exe
```
打包输出目录：`release/maimai-DX-win32-x64/maimai-DX.exe`

### 打包 Android 安装包 (.apk)
```bash
npm run build:apk
```
打包输出文件：`release/maimai-DX.apk`

---

## ⌨️ 默认按键映射（PC 键盘）

| 街机按键 | 默认按键 | 对应位置 |
| :---: | :---: | :---: |
| #1 | `W` | 顶部偏右 |
| #2 | `E` | 右侧偏上 |
| #3 | `D` | 右侧偏下 |
| #4 | `C` | 底部偏右 |
| #5 | `X` | 底部偏左 |
| #6 | `Z` | 左侧偏下 |
| #7 | `A` | 左侧偏上 |
| #8 | `Q` | 顶部偏左 |

*可在操作面板中随时自定义按键映射。*

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。仅供节奏游戏技术交流与学习参考。
