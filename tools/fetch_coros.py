#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_coros.py —— 从高驰(Coros)账号直接拉取最新活动（FIT 文件）。

这是 workouts-page 的「接入高驰」核心脚本，复用 running_page 已验证的高驰
Training Hub 接口（CN 域名），只下载「尚未下载过」的活动，幂等可重复运行。

凭证获取顺序（都不会明文打印）：
  1. 环境变量 COROS_EMAIL / COROS_PASSWORD
  2. ~/github/running_page/config.yaml 里的 sync.coros.{email,password}
  3. 仍未找到则报错退出

用法：
  # 拉取最新活动到 ./coros_activities（首次会提示缺凭证）
  python3 tools/fetch_coros.py

  # 指定输出目录 / 凭证
  COROS_EMAIL=you@x.com COROS_PASSWORD=xxx python3 tools/fetch_coros.py --out-dir ./coros_activities

  # 拉取后直接同步进页面
  python3 tools/fetch_coros.py && python3 tools/sync_fit.py --parse ./coros_activities

依赖：pip install aiofiles httpx pyyaml
"""
import argparse
import asyncio
import glob
import hashlib
import os
import sys

try:
    import aiofiles
    import httpx
    import yaml
except ImportError:
    sys.exit("❌ 缺少依赖，请先安装：pip install aiofiles httpx pyyaml")

COROS_URL = {
    "LOGIN_URL": "https://teamcnapi.coros.com/account/login",
    "DOWNLOAD_URL": "https://teamcnapi.coros.com/activity/detail/download",
    "ACTIVITY_LIST": "https://teamcnapi.coros.com/activity/query?&modeList=100,102,103",
}
TIMEOUT = httpx.Timeout(240.0, connect=360.0)


def load_credentials():
    email = os.environ.get("COROS_EMAIL")
    pwd = os.environ.get("COROS_PASSWORD")
    if email and pwd:
        return email, pwd
    # 回退：读取 running_page 的 config.yaml
    cfg = os.path.expanduser("~/github/running_page/config.yaml")
    if os.path.exists(cfg):
        try:
            with open(cfg, encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            coros = data.get("sync", {}).get("coros", {})
            email = coros.get("email")
            pwd = coros.get("password")
            if email and pwd:
                return email, pwd
        except Exception:
            pass
    sys.exit("❌ 未找到高驰凭证：请设置环境变量 COROS_EMAIL / COROS_PASSWORD，或在 ~/github/running_page/config.yaml 配置 sync.coros。")


class Coros:
    def __init__(self, account, password):
        self.account = account
        self.password = hashlib.md5(password.encode()).hexdigest()
        self.headers = None
        self.req = None

    async def login(self):
        headers = {
            "accept": "application/json, text/plain, */*",
            "content-type": "application/json;charset=UTF-8",
            "origin": "https://t.coros.com",
            "referer": "https://t.coros.com/",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        }
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                COROS_URL["LOGIN_URL"],
                json={"account": self.account, "accountType": 2, "pwd": self.password},
                headers=headers,
            )
            j = resp.json()
            token = j.get("data", {}).get("accessToken")
            if not token:
                raise Exception("高驰登录失败，请检查账号/密码（config.yaml 或环境变量）。")
            self.headers = {
                "accesstoken": token,
                "cookie": f"CPL-coros-region=2; CPL-coros-token={token}",
            }
            self.req = httpx.AsyncClient(timeout=TIMEOUT, headers=self.headers)

    async def fetch_activity_ids(self):
        ids, page = [], 1
        while True:
            r = await self.req.get(f"{COROS_URL['ACTIVITY_LIST']}&pageNumber={page}&size=20")
            items = r.json().get("data", {}).get("dataList") or []
            if not items:
                break
            for a in items:
                if a.get("labelId"):
                    ids.append(a["labelId"])
            page += 1
        return ids

    async def download(self, label_id, folder):
        url = f"{COROS_URL['DOWNLOAD_URL']}?labelId={label_id}&sportType=100&fileType=4"
        try:
            r = await self.req.post(url)
            file_url = r.json().get("data", {}).get("fileUrl")
            if not file_url:
                return None
            fname = os.path.basename(file_url)
            path = os.path.join(folder, fname)
            async with self.req.stream("GET", file_url) as resp:
                resp.raise_for_status()
                async with aiofiles.open(path, "wb") as f:
                    async for chunk in resp.aiter_bytes():
                        await f.write(chunk)
            return fname
        except Exception as e:
            print(f"  ⚠️  下载 {label_id} 失败: {e}")
            return None


async def run(out_dir):
    email, pwd = load_credentials()
    os.makedirs(out_dir, exist_ok=True)
    existing = {os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(out_dir, "*.fit"))}

    c = Coros(email, pwd)
    await c.login()
    ids = await c.fetch_activity_ids()
    print(f"高驰账号共有 {len(ids)} 个活动；本地已存在 {len(existing)} 个")

    todo = [i for i in ids if i not in existing]
    if not todo:
        print("✅ 已是最新，无需下载。")
        await c.req.aclose()
        return 0

    sem = asyncio.Semaphore(10)

    async def task(i):
        async with sem:
            return await c.download(i, out_dir)

    results = await asyncio.gather(*(task(i) for i in todo))
    await c.req.aclose()
    ok = sum(1 for r in results if r)
    print(f"✅ 本次新增下载 {ok} 个活动到 {out_dir}")
    return ok


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="从高驰账号拉取最新活动 FIT 文件")
    ap.add_argument("--out-dir", default=os.path.join(here, "..", "coros_activities"),
                    help="FIT 输出目录（默认 ./coros_activities，已 gitignore）")
    args = ap.parse_args()
    out = os.path.abspath(args.out_dir)
    try:
        n = asyncio.run(run(out))
        sys.exit(0 if n is not None else 1)
    except Exception as e:
        print(f"❌ 拉取失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
