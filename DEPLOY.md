# Deploy Options

## Option 1: Koyeb.com (BEST - 4K Support) ✅

**Why**: 2GB RAM free tier (vs 512MB), handles 4K videos

### Steps:
1. Push code to GitHub (see bottom)
2. Go to **https://app.koyeb.com** → Sign up (free, no card)
3. Click **Create App** → **GitHub**
4. Select your `youtube-downloader` repo
5. **Builder**: Buildpack
6. **Instance**: Nano (2GB RAM free)
7. Add build command:
   ```
   apt-get update && apt-get install -y python3 python3-pip && pip3 install yt-dlp && npm install
   ```
8. **Port**: 3001
9. **Deploy**

Live at: `https://your-app.koyeb.app`

**Supports**: Up to 4K (2160p) ✅, 8K may timeout ⚠️

---

## Option 2: Render.com (Easier setup, 1080p max)

**Why**: Auto-detects config, but only 512MB RAM

1. Go to **https://render.com** → Sign up
2. New → Web Service → Connect GitHub repo
3. Auto-detects from `render.yaml`
4. After deploy, open Shell and run:
   ```bash
   curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
   chmod a+rx /usr/local/bin/yt-dlp
   ```
5. Restart service

**Supports**: Up to 1080p max ⚠️

---

## Option 3: Cyclic.sh (Serverless, good for occasional use)

1. Go to **https://cyclic.sh** → Sign up with GitHub
2. **Deploy** → Select your repo
3. Add environment variable:
   - `NIXPACKS_INSTALL_CMD`: `apt-get update && apt-get install -y python3-pip && pip3 install yt-dlp`
4. Deploy

**Supports**: Up to 4K but limited bandwidth (10GB/month) ⚠️

---

## Push to GitHub First

```bash
cd "C:\Users\jinay\Downloads\youtube-downloader"

git init
git add .
git commit -m "YouTube Downloader with 4K support"

# Create repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/youtube-downloader.git
git branch -M main
git push -u origin main
```

---

## Recommendation

**Use Koyeb** - best free tier for video downloads (2GB RAM, 30min timeout).

For 8K, users should still use the **"Copy Command"** feature for direct download.
