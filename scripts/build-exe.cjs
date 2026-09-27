const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const packager = require('electron-packager');

function getFolderSize(dirPath) {
  let total = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getFolderSize(full);
    } else {
      total += fs.statSync(full).size;
    }
  }
  return total;
}

function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function buildExe() {
  const startTime = Date.now();
  console.log('====================================================');
  console.log('   maimai DX Windows Desktop (EXE) 自动化精简构建    ');
  console.log('====================================================\n');

  // 1. 构建前端代码
  console.log('▶ 正在执行前端构建 (tsc && vite build)...');
  execSync('npm run build', { stdio: 'inherit' });

  // 2. 准备纯净的打包暂存区 (仅包含运行时必备文件，彻底隔绝源码、安卓与历史构建)
  const stagingDir = path.resolve('.staging-exe-pack');
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  console.log('\n▶ 正在组装纯净打包暂存目录...');
  fs.cpSync('dist', path.join(stagingDir, 'dist'), { recursive: true });
  fs.cpSync('electron', path.join(stagingDir, 'electron'), { recursive: true });

  // 生成仅包含主进程入口的轻量化生产 package.json
  const prodPkg = {
    name: 'maimai-viewer',
    version: '1.0.0',
    private: true,
    main: 'electron/main.cjs'
  };
  fs.writeFileSync(path.join(stagingDir, 'package.json'), JSON.stringify(prodPkg, null, 2));

  // 3. 执行 Electron 打包 (启用 asar 虚拟打包归档)
  console.log('▶ 正在打包 Electron 应用 (开启 ASAR 虚拟归档)...');
  const tempOut = path.resolve('.build-out-temp');
  if (fs.existsSync(tempOut)) {
    fs.rmSync(tempOut, { recursive: true, force: true });
  }

  const appPaths = await packager({
    dir: stagingDir,
    name: 'maimai-DX',
    platform: 'win32',
    arch: 'x64',
    out: tempOut,
    overwrite: true,
    asar: true,
    quiet: true
  });

  const packagedDir = appPaths[0];

  // 清理暂存源码目录
  fs.rmSync(stagingDir, { recursive: true, force: true });

  // 4. 执行空间深度瘦身优化 (在不影响任何功能的前提下精简冗余文件)
  console.log('\n▶ 正在执行零损耗体积精简优化...');

  // 4.1 精简多语言包: 仅保留简体中文、繁体中文、日文、英文，剔除其余52国语言包
  const localesDir = path.join(packagedDir, 'locales');
  const keepLocales = new Set(['zh-CN.pak', 'zh-TW.pak', 'ja.pak', 'en-US.pak']);
  if (fs.existsSync(localesDir)) {
    let prunedCount = 0;
    let prunedBytes = 0;
    for (const file of fs.readdirSync(localesDir)) {
      if (!keepLocales.has(file)) {
        const filePath = path.join(localesDir, file);
        prunedBytes += fs.statSync(filePath).size;
        fs.unlinkSync(filePath);
        prunedCount++;
      }
    }
    console.log(`  ✓ 语言包精简: 清理 ${prunedCount} 个无关语言包，节省 ${formatMB(prunedBytes)}`);
  }

  // 4.2 剔除 WebGPU HLSL 专用着色器编译器 (应用采用 Canvas2D/WebGL 与 D3D11，不依赖 D3D12/WebGPU 编译器)
  const dxcFiles = ['dxcompiler.dll', 'dxil.dll'];
  let dxcBytes = 0;
  for (const f of dxcFiles) {
    const p = path.join(packagedDir, f);
    if (fs.existsSync(p)) {
      dxcBytes += fs.statSync(p).size;
      fs.unlinkSync(p);
    }
  }
  if (dxcBytes > 0) {
    console.log(`  ✓ 剔除无引用的 WebGPU 专用着色器编译器 (dxcompiler/dxil): 节省 ${formatMB(dxcBytes)}`);
  }

  // 4.3 剔除超大静态离线说明 HTML (LICENSES.chromium.html 占 ~20.5MB，无任何代码引用)
  const licenseFile = path.join(packagedDir, 'LICENSES.chromium.html');
  if (fs.existsSync(licenseFile)) {
    const licSize = fs.statSync(licenseFile).size;
    fs.unlinkSync(licenseFile);
    console.log(`  ✓ 剔除离线许可证 HTML (无运行时代码依赖): 节省 ${formatMB(licSize)}`);
  }

  // 5. 部署到 release 目标目录
  const releaseBase = path.resolve('release');
  const targetDir = path.join(releaseBase, 'maimai-DX-win32-x64');
  if (!fs.existsSync(releaseBase)) {
    fs.mkdirSync(releaseBase, { recursive: true });
  }

  if (fs.existsSync(targetDir)) {
    console.log('\n▶ 正在移除旧版本 release/maimai-DX-win32-x64...');
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  console.log(`▶ 正在部署精炼版到: ${targetDir}`);
  fs.cpSync(packagedDir, targetDir, { recursive: true });

  // 同步更新 release-exe/ 以保持与旧构建产物路径习惯兼容
  const releaseExeDir = path.resolve('release-exe', 'maimai-DX-win32-x64');
  fs.mkdirSync(path.resolve('release-exe'), { recursive: true });
  if (fs.existsSync(releaseExeDir)) {
    fs.rmSync(releaseExeDir, { recursive: true, force: true });
  }
  fs.cpSync(packagedDir, releaseExeDir, { recursive: true });

  // 清理临时打包输出目录
  fs.rmSync(tempOut, { recursive: true, force: true });

  const finalSizeBytes = getFolderSize(targetDir);
  console.log('\n====================================================');
  console.log(`🎉 构建成功！最终目录大小: ${formatMB(finalSizeBytes)}`);
  console.log('====================================================');

  // 6. 若本机安装了 7-Zip，自动生成极速便携压缩包 release/maimai-DX-win32-x64.7z
  const sevenZipPaths = [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe'
  ];
  const sevenZipExe = sevenZipPaths.find(p => fs.existsSync(p));
  if (sevenZipExe) {
    const archivePath = path.join(releaseBase, 'maimai-DX-win32-x64.7z');
    console.log(`\n▶ 检测到 7-Zip，正在更新压缩包: ${archivePath}...`);
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
    execSync(`"${sevenZipExe}" a -mx9 "${archivePath}" "${targetDir}\\*"`, { stdio: 'inherit' });
    const archiveSize = fs.statSync(archivePath).size;
    console.log(`📦 7z 发布包已更新: ${formatMB(archiveSize)}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✨ 全部构建与优化流程完成，耗时 ${elapsed}s\n`);
}

buildExe().catch(err => {
  console.error('构建失败:', err);
  process.exit(1);
});
