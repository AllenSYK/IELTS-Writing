#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

LOG_DIR="$SCRIPT_DIR/.logs"
LOG_FILE="$LOG_DIR/electron-dev.log"
USER_LOG_FILE="$LOG_DIR/electron-user-friendly.log"
ROOT_APP="$SCRIPT_DIR/IELTS Writing.app"
INSTALLED_APP="/Applications/IELTS Writing.app"
mkdir -p "$LOG_DIR"

APP_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")"

show_message() {
  /usr/bin/osascript -e "display dialog \"$1\" buttons {\"确定\"} default button \"确定\" with title \"IELTS Writing\"" >/dev/null 2>&1
}

show_progress() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"IELTS Writing\" sound name \"default\"" >/dev/null 2>&1
}

show_loading_dialog() {
  /usr/bin/osascript <<EOF
    tell application "System Events"
      display dialog "正在启动 IELTS Writing...\n\n请稍候，应用正在加载中。" ¬
        buttons {"确定"} ¬
        default button 1 ¬
        with title "IELTS Writing" ¬
        giving up after 10 ¬
        with icon note
    end tell
EOF
}

log_user_message() {
  local timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[$timestamp] $1" >> "$USER_LOG_FILE"
}

find_latest_release_app() {
  local latest_path=""
  local latest_mtime=0
  if [ -d "$SCRIPT_DIR/release" ]; then
    while IFS= read -r -d '' app_path; do
      local mtime
      mtime="$(stat -f "%m" "$app_path" 2>/dev/null || echo 0)"
      if [ "$mtime" -gt "$latest_mtime" ]; then
        latest_mtime="$mtime"
        latest_path="$app_path"
      fi
    done < <(find "$SCRIPT_DIR/release" -maxdepth 4 -type d -name "IELTS Writing.app" -print0 2>/dev/null)
  fi
  printf "%s" "$latest_path"
}

open_app() {
  local app_path="$1"
  echo "正在打开：$app_path"
  open "$app_path"
}

check_next_server() {
  local port="$1"
  curl -fsS --max-time 2 "http://127.0.0.1:${port}/api/launcher/health" 2>/dev/null | grep -q '"ielts-writing-desktop"'
}

check_electron_process() {
  local pid="$1"
  if kill -0 "$pid" 2>/dev/null; then
    return 0
  else
    return 1
  fi
}

check_renderer_ready() {
  local port="$1"
  curl -fsS --max-time 2 "http://127.0.0.1:${port}" >/dev/null 2>&1
}

wait_for_electron() {
  local pid="$1"
  local port="${2:-3000}"
  local max_wait=30
  local count=0
  
  while [ $count -lt $max_wait ]; do
    if ! check_electron_process "$pid"; then
      return 1
    fi
    
    if check_renderer_ready "$port"; then
      return 0
    fi
    
    sleep 1
    count=$((count + 1))
  done
  
  return 1
}

log_user_message "开始启动用户应用"
log_user_message "当前应用版本：$APP_VERSION"

echo "正在启动用户应用……"
echo "当前应用版本：$APP_VERSION"
show_progress "正在启动 IELTS Writing..."

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  log_user_message "启动失败：项目依赖尚未安装"
  echo "启动失败：项目依赖尚未安装，请先运行 npm install。"
  show_message "项目依赖尚未安装，请先在终端运行 npm install。"
  exit 1
fi

EXISTING_PORT=""
for port in $(seq 3000 3020); do
  if check_next_server "$port"; then
    EXISTING_PORT="$port"
    break
  fi
done

if [ -n "$EXISTING_PORT" ]; then
  log_user_message "检测到 Next.js 服务已在端口 $EXISTING_PORT 运行"
  echo "检测到 Next.js 服务已在端口 $EXISTING_PORT 运行，直接启动 Electron……"
  echo "详细日志：$LOG_FILE"
  
  nohup npx cross-env ELECTRON_RENDERER_URL="http://127.0.0.1:${EXISTING_PORT}" electron . >"$LOG_FILE" 2>&1 &
  ELECTRON_PID=$!
  log_user_message "Electron 进程已启动，PID: $ELECTRON_PID"
  
  if wait_for_electron "$ELECTRON_PID" "$EXISTING_PORT"; then
    log_user_message "Electron 窗口已成功显示"
    echo "用户应用已成功启动！"
    show_progress "IELTS Writing 已启动完成！"
  else
    log_user_message "Electron 启动超时或失败"
    echo "用户应用启动可能遇到问题。"
    echo "常见问题及解决方案："
    echo "1. 应用窗口被其他窗口遮挡 - 请检查任务栏"
    echo "2. 系统权限问题 - 请在系统偏好设置中允许应用运行"
    echo "3. 依赖文件损坏 - 请尝试重新安装应用"
    echo ""
    echo "如需技术支持，请将以下日志文件发送给开发者："
    echo "$LOG_FILE"
    show_message "应用启动可能遇到问题。\n\n如需技术支持，请查看日志文件：\n$LOG_FILE"
  fi
  exit 0
fi

log_user_message "正在启动 Electron 开发版（最新代码）"
echo "正在启动 Electron 开发版（最新代码）……"
echo "详细日志：$LOG_FILE"

nohup npm run electron:dev >"$LOG_FILE" 2>&1 &
ELECTRON_PID=$!
log_user_message "Electron 开发版进程已启动，PID: $ELECTRON_PID"

if wait_for_electron "$ELECTRON_PID" "3000"; then
  log_user_message "Electron 开发版窗口已成功显示"
  echo "用户应用已成功启动！"
  show_progress "IELTS Writing 开发版已启动完成！"
else
  log_user_message "Electron 开发版启动超时或失败"
  echo "用户应用启动可能遇到问题。"
  echo "常见问题及解决方案："
  echo "1. 应用窗口被其他窗口遮挡 - 请检查任务栏"
  echo "2. 系统权限问题 - 请在系统偏好设置中允许应用运行"
  echo "3. 开发环境配置问题 - 请确保 Node.js 和 npm 已正确安装"
  echo "4. 依赖文件损坏 - 请尝试运行 npm install 重新安装依赖"
  echo ""
  echo "如需技术支持，请将以下日志文件发送给开发者："
  echo "$LOG_FILE"
  show_message "应用启动可能遇到问题。\n\n如需技术支持，请查看日志文件：\n$LOG_FILE"
fi
exit 0
