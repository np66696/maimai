const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  // 1. 同步前端资源到 Android 项目
  console.log('Syncing web assets to Capacitor Android...');
  execSync('npx cap copy android', { stdio: 'inherit' });

  // 2. 动态寻找 Gradle 运行时，避免硬编码特定用户的绝对路径
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const gradleCache = path.join(homeDir, '.gradle', 'wrapper', 'dists', 'gradle-9.1.0-bin', '9agqghryom9wkf8r80qlhnts3', 'gradle-9.1.0', 'bin', 'gradle.bat');
  const gradlewLocal = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

  let gradleCmd = 'gradle';
  if (fs.existsSync(gradleCache)) {
    gradleCmd = `"${gradleCache}"`;
  } else if (fs.existsSync(path.join('android', gradlewLocal))) {
    gradleCmd = process.platform === 'win32' ? path.join('android', 'gradlew.bat') : './android/gradlew';
  }

  console.log(`Building Android APK using: ${gradleCmd}...`);
  execSync(`${gradleCmd} -p android assembleDebug`, { stdio: 'inherit' });

  // 3. 复制生成的 debug APK 到 release/
  const apkSrc = path.join('android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  const apkDest = path.join('release', 'maimai-DX.apk');
  if (fs.existsSync(apkSrc)) {
    fs.mkdirSync('release', { recursive: true });
    fs.copyFileSync(apkSrc, apkDest);
    console.log(`Successfully exported APK to: ${apkDest}`);
  }
} catch (err) {
  console.error('APK build failed:', err.message);
  process.exit(1);
}
