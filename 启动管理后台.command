#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

LOG_DIR="$SCRIPT_DIR/.logs"
LOG_FILE="$LOG_DIR/admin-server.log"
PID_FILE="$LOG_DIR/admin-server.pid"
PORT_FILE="$LOG_DIR/admin-server.port"
META_FILE="$LOG_DIR/admin-server.json"
mkdir -p "$LOG_DIR"

APP_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")"

show_message() {
  /usr/bin/osascript -e "display dialog \"$1\" buttons {\"确定\"} default button \"确定\" with title \"IELTS Writing 管理后台\"" >/dev/null 2>&1
}

check_health() {
  local port="$1"
  curl -fsS --max-time 2 "http://127.0.0.1:${port}/api/launcher/health" 2>/dev/null | grep -q '"ielts-writing-desktop"'
}

find_running_server() {
  for port in $(seq 3000 3020); do
    if check_health "$port"; then
      echo "$port"
      return 0
    fi
  done
  return 1
}

echo "IELTS Writing 管理后台"
echo "当前版本：$APP_VERSION"
echo "正在检查管理后台服务……"

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "启动失败：项目依赖尚未安装，请先运行 npm install。"
  show_message "项目依赖尚未安装，请先在终端运行 npm install。"
  exit 1
fi

EXISTING_PORT="$(find_running_server)"
if [ -n "$EXISTING_PORT" ]; then
  echo "管理后台已在运行，端口：$EXISTING_PORT"
  echo "$EXISTING_PORT" > "$PORT_FILE"
  open "http://127.0.0.1:${EXISTING_PORT}/admin"
  exit 0
fi

rm -f "$PID_FILE" "$PORT_FILE" "$META_FILE"

PORT=3000
while /usr/sbin/lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if [ "$PORT" -gt 3010 ]; then
    echo "启动失败：3000 到 3010 端口均被占用。"
    show_message "启动失败：3000 到 3010 端口均被占用。"
    exit 1
  fi
done

echo "正在启动管理后台，端口：$PORT"
echo "详细日志：$LOG_FILE"
nohup npm run dev -- -p "$PORT" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"
echo "$PORT" > "$PORT_FILE"
printf '{"root":"%s","pid":%s,"port":%s,"version":"%s","startedAt":"%s"}\n' "$SCRIPT_DIR" "$SERVER_PID" "$PORT" "$APP_VERSION" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$META_FILE"

READY=0
for i in $(seq 1 60); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
  if check_health "$PORT"; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -eq 1 ]; then
  echo "管理后台已启动，正在打开浏览器……"
  open "http://127.0.0.1:${PORT}/admin"
  exit 0
fi

rm -f "$PID_FILE" "$PORT_FILE" "$META_FILE"
echo "管理后台启动失败，请查看日志："
echo "$LOG_FILE"
show_message "管理后台启动失败，请查看日志文件：$LOG_FILE"
exit 1
