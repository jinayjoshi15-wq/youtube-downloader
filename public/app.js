const API_BASE = window.location.origin + '/api';

let videoData = null;

// DOM Elements
const urlInput = document.getElementById('urlInput');
const analyzeBtn = document.getElementById('btnAnalyze');
const errorMessage = document.getElementById('inputError');
const stepOptions = document.getElementById('step-options');
const thumbImg = document.getElementById('thumbImg');
const thumbLoader = document.getElementById('thumbLoader');
const videoTitle = document.getElementById('videoTitle');
const durationBadge = document.getElementById('durationBadge');
const qualitySelect = document.getElementById('qualitySelect');
const downloadBtn = document.getElementById('btnDownload');
const downloadBtnText = document.getElementById('btnDownloadText');
const btnSpinner = document.getElementById('btnSpinner');
const downloadError = document.getElementById('downloadError');
const formatCards = document.querySelectorAll('.format-card');
const commandBox = document.getElementById('commandBox');
const btnCopyCommand = document.getElementById('btnCopyCommand');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressPercent = document.getElementById('progressPercent');
const progressSpeed = document.getElementById('progressSpeed');

// Format duration (seconds to MM:SS or HH:MM:SS)
function formatDuration(seconds) {
    if (!seconds) return 'Unknown';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Show error message
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    setTimeout(() => {
        errorMessage.classList.add('hidden');
    }, 5000);
}

// Analyze button click handler
analyzeBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();

    if (!url) {
        showError('Please enter a YouTube URL');
        return;
    }

    // Basic URL validation
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        showError('Please enter a valid YouTube URL');
        return;
    }

    // Show loading state
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<div class="spinner"></div> Analyzing...';
    stepOptions.classList.add('hidden');
    errorMessage.textContent = '';

    try {
        const response = await fetch(`${API_BASE}/info`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch video information');
        }

        // Store video data
        videoData = data;

        // Update UI with video info
        thumbImg.src = data.thumbnail;
        thumbImg.onload = () => thumbLoader.classList.add('hidden');
        videoTitle.textContent = data.title;
        durationBadge.textContent = formatDuration(data.duration);
        durationBadge.classList.remove('hidden');

        // Populate quality options (default to MP4)
        updateQualityOptions('mp4');
        qualitySelect.disabled = false;

        // Show video preview
        stepOptions.classList.remove('hidden');

    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'Failed to fetch video information. Please try again.');
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> Analyze';
    }
});

// Format change handler
formatCards.forEach(card => {
    card.addEventListener('click', () => {
        formatCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const format = card.dataset.format;
        updateQualityOptions(format);
    });
});

// Quality change handler
qualitySelect.addEventListener('change', updateCommand);

// Copy command button
btnCopyCommand.addEventListener('click', () => {
    const command = commandBox.textContent;
    navigator.clipboard.writeText(command).then(() => {
        const originalText = btnCopyCommand.textContent;
        btnCopyCommand.textContent = '✓ Copied!';
        setTimeout(() => {
            btnCopyCommand.textContent = originalText;
        }, 2000);
    });
});

// Update quality dropdown based on format
function updateQualityOptions(format) {
    if (!videoData) return;

    qualitySelect.innerHTML = '';

    if (format === 'mp4') {
        videoData.videoFormats.forEach(vf => {
            const option = document.createElement('option');
            option.value = vf.format_id;
            option.textContent = vf.quality;
            option.dataset.quality = vf.quality;
            qualitySelect.appendChild(option);
        });
    } else {
        videoData.audioFormats.forEach(af => {
            const option = document.createElement('option');
            option.value = af.format_id;
            option.textContent = af.quality;
            option.dataset.quality = af.quality;
            qualitySelect.appendChild(option);
        });
    }

    // Enable download button after quality options are loaded
    downloadBtn.disabled = false;
    updateCommand();
}

// Update CLI command
function updateCommand() {
    const selectedFormatCard = document.querySelector('.format-card.selected');
    const format = selectedFormatCard ? selectedFormatCard.dataset.format : 'mp4';
    const selectedOption = qualitySelect.options[qualitySelect.selectedIndex];
    const quality = selectedOption ? selectedOption.textContent : '';
    const url = urlInput.value.trim();

    if (!url || !quality) {
        commandBox.textContent = 'Select quality and click "Copy Command"';
        btnCopyCommand.disabled = true;
        return;
    }

    const height = quality.replace(/[^\d]/g, '');
    let command;

    if (format === 'mp3') {
        command = `yt-dlp -x --audio-format mp3 -f bestaudio "${url}"`;
    } else {
        command = `yt-dlp -f "bestvideo[height<=${height}]+bestaudio/best[height<=${height}]" "${url}"`;
    }

    commandBox.textContent = command;
    btnCopyCommand.disabled = false;
}

// Download button click handler
downloadBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const selectedFormatCard = document.querySelector('.format-card.selected');
    const format = selectedFormatCard.dataset.format;
    const selectedOption = qualitySelect.options[qualitySelect.selectedIndex];
    const quality = selectedOption.textContent;

    downloadBtn.disabled = true;
    downloadBtnText.textContent = 'Downloading...';
    btnSpinner.classList.remove('hidden');
    downloadError.textContent = '';
    progressContainer.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    progressSpeed.textContent = 'Starting...';

    const progressId = Date.now().toString();

    // Listen to progress
    const eventSource = new EventSource(`${API_BASE}/progress/${progressId}`);

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.done) {
            eventSource.close();
            progressPercent.textContent = '100%';
            progressBar.style.width = '100%';
            progressSpeed.textContent = 'Complete!';
        } else if (data.percent) {
            progressBar.style.width = data.percent + '%';
            progressPercent.textContent = data.percent + '%';
            progressSpeed.textContent = data.speed || '--';
        }
    };

    try {
        const response = await fetch(`${API_BASE}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, format, quality, progressId }),
        });

        if (!response.ok) {
            throw new Error('Download failed');
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `video.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);

        downloadError.textContent = '✓ Download completed!';
        downloadError.classList.remove('text-red-400');
        downloadError.classList.add('text-green-400');

        setTimeout(() => {
            downloadError.textContent = '';
            downloadError.classList.remove('text-green-400');
            downloadError.classList.add('text-red-400');
            progressContainer.classList.add('hidden');
        }, 3000);

    } catch (error) {
        console.error('Download error:', error);
        downloadError.textContent = error.message || 'Download failed';
        eventSource.close();
        progressContainer.classList.add('hidden');
    } finally {
        downloadBtn.disabled = false;
        downloadBtnText.textContent = 'Download';
        btnSpinner.classList.add('hidden');
    }
});

// Allow Enter key to trigger analyze
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        analyzeBtn.click();
    }
});
