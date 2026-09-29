const { execSync } = require("child_process");

const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function run(command) {
  execSync(command, { stdio: "inherit" });
}

function main() {
  log("========== Vakao Axios 发布 ==========", colors.cyan);

  // 1. 构建项目
  log("[1/2] 正在构建项目...", colors.yellow);
  run("pnpm run build");
  log("构建完成", colors.green);

  // 2. 发布到 npm registry
  log("[2/2] 正在执行 npm publish...", colors.yellow);
  run("npm publish");

  log("========== 发布成功 ==========", colors.green);
}

try {
  main();
} catch (error) {
  log(`发布失败：${error.message}`, colors.red);
  process.exit(1);
}
