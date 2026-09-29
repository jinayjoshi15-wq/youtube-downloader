FROM node:24-slim

# Install Python and yt-dlp
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && pip3 install --break-system-packages yt-dlp \
    && ln -s /usr/local/bin/yt-dlp /usr/bin/yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Create temp directory
RUN mkdir -p temp_downloads

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "server.js"]
