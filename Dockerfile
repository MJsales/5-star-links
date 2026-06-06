FROM node:20-slim

RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install yt-dlp

RUN curl -L https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz | tar xJ \
    && mv ffmpeg-master-latest-linux64-gpl/bin/ffmpeg /usr/local/bin/ \
    && mv ffmpeg-master-latest-linux64-gpl/bin/ffprobe /usr/local/bin/ \
    && rm -rf ffmpeg-master-latest-linux64-gpl

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY clip-downloader.js ./
COPY server.js ./

RUN mkdir -p /tmp/5star-videos

EXPOSE 4242

CMD ["node", "server.js"]
