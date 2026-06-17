#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

LOG_DIR="$SCRIPT_DIR/.logs"
PID_FILE="$LOG_DIR/admin-server.pid"
PORT_FILE="$LOG_DIR/admin-server.port"
META_FILE="$LOG_DIR/admin-server.json"

APP_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")"

echo "IELTS Writing 管理后台"
echo "当前版本：$APP_VERSION"

if [ ! -f "$PID_FILE" ]; then
  echo "没有找到本项目管理后台的 PID 记录。"
  rm -f "$PORT_FILE" "$META_FILE"
  echo
  read -n 1 -s -r -p "按任意键关闭窗口..."
  echo
  exit 0
fi

SERVER_PID="$(cat "$PID_FILE" 2>/dev/null)"
SERVER_PORT="$(cat "$PORT_FILE" 2>/dev/null)"

if [ -z "$SERVER_PID" ]; then
  echo "PID 记录为空，正在清理。"
  rm -f "$PID_FILE" "$PORT_FILE" "$META_FILE"
  exit 0
fi

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "管理后台进程不存在，正在清理 PID 和端口记录。"
  rm -f "$PID_FILE" "$PORT_FILE" "$META_FILE"
  exit 0
fi

echo "正在停止本项目管理后台，PID：$SERVER_PID，端口：${SERVER_PORT:-未知}"
kill "$SERVER_PID" 2>/dev/null || true

for i in $(seq 1 20); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
  sleep 0.3
done

if kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "进程仍在运行，正在强制停止本项目 PID。"
  kill -9 "$SERVER_PID" 2>/dev/null || true
fi

rm -f "$PID_FILE" "$PORT_FILE" "$META_FILE"
echo "管理后台已停止，PID 和端口记录已清理。"
echo
read -n 1 -s -r -p "按任意键关闭窗口..."
echo
