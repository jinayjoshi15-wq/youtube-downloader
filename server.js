const express = require('express');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sanitizeFilename = require('sanitize-filename');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Temporary downloads directory
const TEMP_DIR = path.join(__dirname, 'temp_downloads');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Clean up old files on startup
function cleanupTempFiles() {
    const files = fs.readdirSync(TEMP_DIR);
    files.forEach(file => {
        const filePath = path.join(TEMP_DIR, file);
        const stats = fs.statSync(filePath);
        const now = Date.now();
        const fileAge = now - stats.mtimeMs;
        // Delete files older than 1 hour
        if (fileAge > 3600000) {
            fs.unlinkSync(filePath);
            console.log(`Cleaned up old file: ${file}`);
        }
    });
}

cleanupTempFiles();
setInterval(cleanupTempFiles, 600000); // Clean every 10 minutes

// Input validation - prevent command injection
function validateYouTubeUrl(url) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+(\?[\w=&-]*)?$/;
    return youtubeRegex.test(url);
}

// Escape shell arguments to prevent injection
function escapeShellArg(arg) {
    return `"${arg.replace(/"/g, '\\"')}"`;
}

// POST /api/info - Get video metadata
app.post('/api/info', async (req, res) => {
    const { url } = req.body;

    if (!url || !validateYouTubeUrl(url)) {
        return res.status(400).json({ error: 'Invalid or missing YouTube URL' });
    }

    const command = `yt-dlp --dump-json --no-warnings ${escapeShellArg(url)}`;

    exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
        if (error) {
            console.error('=== YT-DLP ERROR ===');
            console.error('Command:', command);
            console.error('Error:', error.message);
            console.error('Error code:', error.code);
            console.error('stderr:', stderr);
            console.error('stdout:', stdout);
            console.error('===================');

            // Handle specific error cases
            if (stderr.includes('Video unavailable') || stderr.includes('Private video')) {
                return res.status(404).json({ error: 'Video is unavailable, private, or does not exist' });
            } else if (stderr.includes('age')) {
                return res.status(403).json({ error: 'Video is age-restricted and cannot be accessed' });
            } else if (stderr.includes('geo')) {
                return res.status(451).json({ error: 'Video is geo-restricted in your region' });
            }

            return res.status(500).json({
                error: 'Failed to fetch video information. Please check the URL.',
                debug: error.code === 'ENOENT' ? 'yt-dlp not found' : error.message
            });
        }

        try {
            const videoInfo = JSON.parse(stdout);

            const formats = videoInfo.formats || [];

            // Get unique video heights available
            const videoHeights = [...new Set(
                formats
                    .filter(f => f.height && f.vcodec !== 'none')
                    .map(f => f.height)
            )].sort((a, b) => b - a);

            // Map heights to quality labels
            const qualityMap = {
                4320: '4320p (8K)', 3840: '3840p (4K UHD)', 2160: '2160p (4K)',
                1440: '1440p (2K)', 1920: '1920p (Full HD+)', 1080: '1080p (Full HD)',
                720: '720p (HD)', 480: '480p (SD)', 360: '360p', 240: '240p', 144: '144p'
            };

            const videoFormats = videoHeights
                .filter(h => h >= 360)
                .map(h => ({
                    quality: qualityMap[h] || `${h}p`,
                    format_id: `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]`,
                    height: h
                }));

            // Get audio bitrates
            const audioRates = [...new Set(
                formats
                    .filter(f => f.abr && f.acodec !== 'none' && f.vcodec === 'none')
                    .map(f => Math.round(f.abr))
            )].sort((a, b) => b - a).slice(0, 3);

            const audioFormats = audioRates.map(abr => ({
                quality: `${abr}kbps`,
                format_id: 'bestaudio'
            }));

            res.json({
                title: videoInfo.title,
                duration: videoInfo.duration,
                thumbnail: videoInfo.thumbnail,
                videoFormats: videoFormats.length ? videoFormats : [
                    { quality: '1080p (Full HD)', format_id: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', height: 1080 },
                    { quality: '720p (HD)', format_id: 'bestvideo[height<=720]+bestaudio/best[height<=720]', height: 720 },
                    { quality: '480p (SD)', format_id: 'bestvideo[height<=480]+bestaudio/best[height<=480]', height: 480 }
                ],
                audioFormats: audioFormats.length ? audioFormats : [
                    { quality: 'Best', format_id: 'bestaudio' }
                ]
            });
        } catch (parseError) {
            console.error('Error parsing video info:', parseError);
            res.status(500).json({ error: 'Failed to parse video information' });
        }
    });
});

// POST /api/download - Download with progress tracking
app.post('/api/download', async (req, res) => {
    const { url, format, quality, progressId } = req.body;

    if (!url || !validateYouTubeUrl(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    if (!format || !['mp4', 'mp3'].includes(format)) {
        return res.status(400).json({ error: 'Invalid format' });
    }

    const timestamp = Date.now();
    const outputPath = path.join(TEMP_DIR, `${timestamp}.${format}`);
    const height = quality.replace(/[^\d]/g, '');
    const formatSelector = format === 'mp3'
        ? 'bestaudio'
        : `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;

    const ytDlpArgs = [
        '-f', formatSelector,
        '--newline',
        '--no-warnings',
        '--no-playlist',
        '-o', outputPath
    ];

    if (format === 'mp3') {
        ytDlpArgs.push('-x', '--audio-format', 'mp3');
    } else {
        ytDlpArgs.push('--merge-output-format', 'mp4');
    }

    ytDlpArgs.push(url);

    const ytDlp = spawn('yt-dlp', ytDlpArgs);

    ytDlp.stdout.on('data', (data) => {
        const output = data.toString();
        if (progressId && progressClients[progressId]) {
            // Parse: [download]  45.2% of 123.45MiB at 1.23MiB/s ETA 00:12
            const match = output.match(/\[download\]\s+(\d+\.?\d*)%.*?at\s+(\S+)\s/);
            if (match) {
                progressClients[progressId].write(`data: ${JSON.stringify({ percent: match[1], speed: match[2] })}\n\n`);
            }
        }
    });

    ytDlp.stderr.on('data', (data) => {
        console.error('yt-dlp:', data.toString());
    });

    ytDlp.on('close', (code) => {
        if (code !== 0) {
            if (progressId && progressClients[progressId]) {
                progressClients[progressId].write('data: {"error":true}\n\n');
                progressClients[progressId].end();
                delete progressClients[progressId];
            }
            return res.status(500).json({ error: 'Download failed' });
        }

        // Download complete, send file
        if (progressId && progressClients[progressId]) {
            progressClients[progressId].write('data: {"done":true}\n\n');
            progressClients[progressId].end();
            delete progressClients[progressId];
        }

        res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="video.${format}"`);

        const fileStream = fs.createReadStream(outputPath);
        fileStream.pipe(res);

        fileStream.on('end', () => {
            fs.unlink(outputPath, () => {});
        });

        fileStream.on('error', () => {
            fs.unlink(outputPath, () => {});
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error streaming file' });
            }
        });
    });
});

// Progress tracking via SSE
const progressClients = {};

app.get('/api/progress/:id', (req, res) => {
    const { id } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    progressClients[id] = res;

    req.on('close', () => {
        delete progressClients[id];
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    exec('yt-dlp --version', (error, stdout) => {
        if (error) {
            return res.status(500).json({
                status: 'error',
                message: 'yt-dlp not found. Please install it first.'
            });
        }
        res.json({
            status: 'ok',
            ytdlp_version: stdout.trim()
        });
    });
});

app.listen(PORT, () => {
    console.log(`🚀 YouTube Downloader server running on http://localhost:${PORT}`);
    console.log(`📁 Temporary files directory: ${TEMP_DIR}`);
});
