const { execSync } = require('child_process');
const {
  log,
  showBanner,
  showSuccess,
  separator,
  handleError,
  colors
} = require('@vakao-ui/scripts-utils');

// 显示 Banner
showBanner('Vakao Axios 发布');

try {
  // 1. 构建项目
  separator();
  log('正在构建项目...', 'build');
  execSync('pnpm run build', { stdio: 'inherit' });
  log('构建完成！', 'success');

  // 2. 发布到 NPM
  separator();
  log('准备发布到 NPM...', 'publish');
  
  // 提示：实际发布命令。这里为了安全起见，我们先打印出来，或者让用户确认。
  // 但根据用户指令"新建发布脚本"，通常意味着要执行发布。
  // 我们添加一个简单的确认提示或者直接执行 npm publish
  // 这里直接执行 npm publish，假设用户已经做好了准备（如登录 npm）
  
  // 注意：npm publish 会读取 package.json 中的 version
  log('正在执行 npm publish...', 'info');
  execSync('npm publish', { stdio: 'inherit' });
  
  separator();
  showSuccess('Vakao Axios 发布成功！');

} catch (error) {
  separator();
  console.error(`${colors.red}发布过程中出错：${colors.reset}`);
  console.error(error.message);
  process.exit(1);
}
